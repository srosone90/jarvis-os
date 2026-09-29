import { descriviErrore, log } from "../diagnostica/log";
import { applicaEvento, inCorso, nuovoTurno, type EventoPipeline, type Turno } from "./eventi";

/**
 * Motore della conversazione con l'assistente (Gemini, dentro la pipeline Assist
 * di HA). È l'unico posto che parla con `assist_pipeline/run`: la chat (F4), la
 * voce (F5) e l'Hub sono solo "facce" diverse che lo ascoltano.
 *
 * Regole (CLAUDE.md, sezione 5):
 *  - offline la domanda non parte e non si inventa nessuna risposta;
 *  - la sottoscrizione si apre con `resubscribe: false`: la libreria, dopo una
 *    riconnessione, rimanda da sola le sottoscrizioni, e rimandare "spegni la TV"
 *    eseguirebbe il comando due volte;
 *  - se HA cade a metà, il turno va in errore "connessione" e la domanda resta
 *    lì da rimandare con un tocco (non si sa cosa è stato eseguito);
 *  - a fine risposta ci si disiscrive: HA non chiude da solo la sottoscrizione
 *    della pipeline, e in mesi di domande la mappa dei comandi crescerebbe;
 *  - HA dimentica una conversazione dopo 5 minuti senza messaggi: dopo quel
 *    tempo la chat riparte vuota, così resta in vista solo il contesto vero.
 */

/** Quello che il motore usa della connessione (la `Connection` della libreria va bene). */
export interface ConnessioneAssistente {
  subscribeMessage<T>(
    callback: (messaggio: T) => void,
    messaggio: Record<string, unknown>,
    opzioni?: { resubscribe?: boolean },
  ): Promise<() => Promise<void>>;
}

export interface DipendenzeAssistente {
  conn: () => ConnessioneAssistente | null;
  /** Manda un frame binario sul WebSocket di HA (audio del microfono). False se non è partito. */
  inviaBinario: (dati: ArrayBuffer) => boolean;
  /** HA collegato adesso (non "da 10 s": una domanda non parte su un socket che non c'è). */
  collegato: () => boolean;
  /** Avvisa quando lo stato della connessione cambia; ritorna la funzione per smettere. */
  ascoltaConnessione: (f: () => void) => () => void;
  adesso?: () => number;
}

/** HA dimentica il contesto dopo 5 minuti (CONVERSATION_TIMEOUT in helpers/chat_session.py). */
export const CONTESTO_MS = 5 * 60_000;
/** Dopo quanto la risposta è "più lenta del solito". */
export const LENTA_MS = 15_000;
/** Tempo massimo per una risposta; lo stesso valore va a HA come `timeout` della pipeline. */
export const MASSIMO_MS = 60_000;
/** Se dopo la risposta HA non chiude la pipeline, si pulisce comunque dopo questo tempo. */
const CHIUSURA_MS = 10_000;

export const LINGUA = "it";

interface Esecuzione {
  turnoId: number;
  smetti: (() => Promise<void>) | null;
  timerMassimo: ReturnType<typeof setTimeout>;
  /** Voce: parte solo quando finisci di parlare, non mentre parli. */
  timerLenta: ReturnType<typeof setTimeout> | undefined;
  /** Voce: la fine dell'audio è già stata mandata (si manda una volta sola). */
  audioChiuso: boolean;
  timerChiusura: ReturnType<typeof setTimeout> | undefined;
  chiusa: boolean;
}

export class Assistente {
  private elenco: Turno[] = [];
  private conversationId: string | null = null;
  private ultimaAttivita = 0;
  private contatore = 0;
  private esecuzione: Esecuzione | null = null;
  private lentaDa: number | null = null;
  private readonly ascoltatori = new Set<() => void>();
  private readonly adesso: () => number;

  constructor(private readonly dip: DipendenzeAssistente) {
    this.adesso = dip.adesso ?? Date.now;
    dip.ascoltaConnessione(() => this.suConnessione());
  }

  get turni(): readonly Turno[] {
    return this.elenco;
  }

  /** Una risposta è in arrivo (la chat non si chiude da sola, il campo è occupato). */
  get occupato(): boolean {
    return this.esecuzione !== null && !this.esecuzione.chiusa && this.turnoInCorso() !== null;
  }

  /** La risposta in corso ci sta mettendo più del solito. */
  get lenta(): boolean {
    return this.lentaDa !== null && this.occupato;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /**
   * Se sono passati più di 5 minuti dall'ultimo messaggio, HA ha già dimenticato
   * la conversazione: la si ricomincia anche qui. Da chiamare prima di mostrare
   * la chat e prima di ogni domanda.
   */
  controllaScadenza(): void {
    if (this.occupato || this.elenco.length === 0) return;
    if (this.adesso() - this.ultimaAttivita > CONTESTO_MS) this.nuovaConversazione();
  }

  nuovaConversazione(): void {
    if (this.occupato) return;
    this.elenco = [];
    this.conversationId = null;
    this.notifica();
  }

  /** Manda una domanda. Offline non parte: ritorna false e non aggiunge niente. */
  chiedi(domanda: string): boolean {
    const pulita = domanda.trim();
    if (!pulita || this.occupato) return false;
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) return false;
    this.controllaScadenza();
    this.contatore += 1;
    const turno = nuovoTurno(this.contatore, pulita);
    this.elenco = [...this.elenco, turno];
    this.ultimaAttivita = this.adesso();
    this.avvia(conn, turno);
    this.notifica();
    return true;
  }

  /**
   * Domanda a voce: pipeline da stt a tts. L'audio del microfono si manda con
   * `inviaAudio` appena HA dà l'id (run-start); prima lo tiene chi registra.
   * Ritorna l'id del turno, o null se non può partire (offline, già occupato).
   */
  parla(sampleRate: number): number | null {
    if (this.occupato) return null;
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) return null;
    this.controllaScadenza();
    this.contatore += 1;
    const turno = nuovoTurno(this.contatore, "", true);
    this.elenco = [...this.elenco, turno];
    this.ultimaAttivita = this.adesso();
    this.avvia(conn, turno, sampleRate);
    this.notifica();
    return turno.id;
  }

  /** Toglie un turno a voce finito senza parole (seguito a cui nessuno ha risposto). */
  scarta(turnoId: number): void {
    const t = this.turno(turnoId);
    if (!t?.voce || t.domanda || inCorso(t)) return;
    this.elenco = this.elenco.filter((x) => x.id !== turnoId);
    this.notifica();
  }

  turno(id: number): Turno | undefined {
    return this.elenco.find((t) => t.id === id);
  }

  /** Manda un pezzo di audio del turno a voce. False se HA non ha ancora dato l'id o l'ascolto è finito. */
  inviaAudio(turnoId: number, pcm: ArrayBuffer): boolean {
    const t = this.turno(turnoId);
    const esecuzione = this.esecuzione;
    if (
      t?.idAudio == null ||
      t.fase !== "ascolto" ||
      esecuzione?.turnoId !== turnoId ||
      esecuzione.audioChiuso
    )
      return false;
    const frame = new Uint8Array(pcm.byteLength + 1);
    frame[0] = t.idAudio;
    frame.set(new Uint8Array(pcm), 1);
    return this.dip.inviaBinario(frame.buffer);
  }

  /** Fine dell'audio (tocco su "ferma" o fine del parlato): un frame col solo id, una volta sola. */
  fineAudio(turnoId: number): void {
    const t = this.turno(turnoId);
    const esecuzione = this.esecuzione;
    if (t?.idAudio == null || esecuzione?.turnoId !== turnoId || esecuzione.audioChiuso) return;
    esecuzione.audioChiuso = true;
    this.dip.inviaBinario(new Uint8Array([t.idAudio]).buffer);
  }

  /** Rimanda la domanda di un turno finito in errore (lo sostituisce, non ne aggiunge uno). */
  rimanda(turnoId: number): boolean {
    const vecchio = this.elenco.find((t) => t.id === turnoId);
    // un turno a voce senza testo non si rimanda: si riparla
    if (vecchio?.fase !== "errore" || !vecchio.domanda || this.occupato) return false;
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) return false;
    this.contatore += 1;
    const turno = nuovoTurno(this.contatore, vecchio.domanda);
    this.elenco = this.elenco.map((t) => (t.id === turnoId ? turno : t));
    this.ultimaAttivita = this.adesso();
    this.avvia(conn, turno);
    this.notifica();
    return true;
  }

  private turnoInCorso(): Turno | null {
    const id = this.esecuzione?.turnoId;
    const t = this.elenco.find((x) => x.id === id);
    return t && inCorso(t) ? t : null;
  }

  private armaLenta(): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.lentaDa = this.adesso();
      this.notifica();
    }, LENTA_MS);
  }

  private avvia(conn: ConnessioneAssistente, turno: Turno, sampleRate?: number): void {
    const esecuzione: Esecuzione = {
      turnoId: turno.id,
      smetti: null,
      chiusa: false,
      audioChiuso: false,
      timerChiusura: undefined,
      timerLenta: turno.voce ? undefined : this.armaLenta(),
      timerMassimo: setTimeout(() => {
        log.avviso(`Assistente: nessuna risposta entro ${MASSIMO_MS / 1000} s`);
        this.chiudiConErrore(esecuzione, "tempo", `Nessuna risposta entro ${MASSIMO_MS / 1000} s`);
      }, MASSIMO_MS),
    };
    this.esecuzione = esecuzione;
    this.lentaDa = null;
    const messaggio: Record<string, unknown> = turno.voce
      ? {
          type: "assist_pipeline/run",
          start_stage: "stt",
          end_stage: "tts",
          input: { sample_rate: sampleRate ?? 16000 },
          conversation_id: this.conversationId,
          timeout: MASSIMO_MS / 1000,
        }
      : {
          type: "assist_pipeline/run",
          start_stage: "intent",
          end_stage: "intent",
          input: { text: turno.domanda },
          conversation_id: this.conversationId,
          timeout: MASSIMO_MS / 1000,
        };
    conn
      .subscribeMessage<EventoPipeline>((ev) => this.suEvento(esecuzione, ev), messaggio, {
        resubscribe: false,
      })
      .then((smetti) => {
        esecuzione.smetti = smetti;
        // l'evento finale può essere arrivato nello stesso pacchetto del risultato
        if (esecuzione.chiusa) void this.disiscrivi(esecuzione);
      })
      .catch((errore: unknown) => {
        // HA ha rifiutato la richiesta (pipeline mancante, connessione persa prima dell'invio...)
        log.errore(`Assistente: richiesta rifiutata: ${descriviErrore(errore)}`);
        this.chiudiConErrore(esecuzione, "agente", descriviErrore(errore));
      });
  }

  private suEvento(esecuzione: Esecuzione, ev: EventoPipeline): void {
    if (esecuzione.chiusa) return;
    const prima = this.elenco.find((t) => t.id === esecuzione.turnoId);
    if (!prima) return;
    const dopo = applicaEvento(prima, ev);
    if (dopo === prima) return;
    this.sostituisci(dopo);
    if (dopo.conversationId) this.conversationId = dopo.conversationId;
    // voce: finito di parlare, da qui conta il tempo della risposta
    if (prima.fase === "ascolto" && dopo.fase !== "ascolto" && esecuzione.timerLenta === undefined)
      esecuzione.timerLenta = this.armaLenta();
    if (dopo.fase === "errore" && prima.fase !== "errore")
      log.errore(`Assistente: ${dopo.errore?.dettaglio ?? "errore"}`);
    if (!inCorso(dopo)) {
      this.ultimaAttivita = this.adesso();
      this.fermaTimer(esecuzione);
      // di norma HA manda run-end subito dopo: se non arriva, si pulisce lo stesso
      if (!dopo.concluso && esecuzione.timerChiusura === undefined)
        esecuzione.timerChiusura = setTimeout(() => this.concludi(esecuzione), CHIUSURA_MS);
    }
    if (dopo.concluso) this.concludi(esecuzione);
    this.notifica();
  }

  /** HA perso mentre la risposta era in corso: errore chiaro, domanda da rimandare. */
  private suConnessione(): void {
    const esecuzione = this.esecuzione;
    if (!esecuzione || esecuzione.chiusa || this.dip.collegato()) return;
    if (!this.turnoInCorso()) {
      // risposta già arrivata: la sottoscrizione è morta con il socket
      this.concludi(esecuzione, false);
      return;
    }
    log.avviso("Assistente: connessione persa durante la risposta");
    this.chiudiConErrore(
      esecuzione,
      "connessione",
      "Connessione a Home Assistant persa durante la risposta",
      false,
    );
  }

  private chiudiConErrore(
    esecuzione: Esecuzione,
    tipo: "agente" | "connessione" | "tempo",
    dettaglio: string,
    disiscrivi = true,
  ): void {
    if (esecuzione.chiusa) return;
    const t = this.elenco.find((x) => x.id === esecuzione.turnoId);
    if (t && inCorso(t))
      this.sostituisci({ ...t, fase: "errore", concluso: true, errore: { tipo, dettaglio } });
    this.ultimaAttivita = this.adesso();
    this.concludi(esecuzione, disiscrivi);
    this.notifica();
  }

  private concludi(esecuzione: Esecuzione, disiscrivi = true): void {
    if (esecuzione.chiusa) return;
    esecuzione.chiusa = true;
    this.fermaTimer(esecuzione);
    clearTimeout(esecuzione.timerChiusura);
    if (this.esecuzione === esecuzione) {
      this.esecuzione = null;
      this.lentaDa = null;
    }
    // Con il socket caduto non si manda niente: la libreria ha già buttato la
    // sottoscrizione (resubscribe: false) e non la rimanderà.
    if (disiscrivi) void this.disiscrivi(esecuzione);
  }

  private async disiscrivi(esecuzione: Esecuzione): Promise<void> {
    const smetti = esecuzione.smetti;
    if (!smetti || !this.dip.collegato()) return;
    esecuzione.smetti = null;
    try {
      await smetti();
    } catch (errore) {
      log.avviso(`Assistente: chiusura della pipeline non riuscita: ${descriviErrore(errore)}`);
    }
  }

  private fermaTimer(esecuzione: Esecuzione): void {
    clearTimeout(esecuzione.timerLenta);
    clearTimeout(esecuzione.timerMassimo);
  }

  private sostituisci(t: Turno): void {
    this.elenco = this.elenco.map((x) => (x.id === t.id ? t : x));
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Assistente: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
