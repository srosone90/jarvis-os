import { descriviErrore, log } from "../diagnostica";
import {
  applicaEvento,
  inCorso,
  nuovoTurno,
  type EventoPipeline,
  type TipoErrore,
  type Turno,
} from "./eventi";

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
  /**
   * device_id di questo pannello (`jarvis_<stanza>`), mandato con ogni domanda:
   * jarvis_voce assegna a lui i timer chiesti da qui (v0.4.6). null = non si manda.
   */
  dispositivo?: () => string | null;
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

/**
 * Domanda a voce nata dalla parola «Jarvis» (v0.5.0). Senza `no_vad`: la fine
 * della frase la decide il server (jarvis_voce è tarato lì).
 */
export interface OpzioniParla {
  /**
   * La parola come la dice il modello ("Jarvis"): va a HA come
   * `wake_word_phrase`, così se due pannelli sentono la stessa parola entro 2 s
   * risponde uno solo (`duplicate_wake_up_detected`, pipeline.py di HA 2026.9.3).
   */
  parola?: string;
  /**
   * Mentre suona un timer: la pipeline si ferma al testo (end_stage "stt") e
   * decide chi chiama. "fermato" = era «stop», il turno si chiude qui senza
   * Gemini; "continua" = è una domanda, riparte da intent a tts sullo stesso turno.
   */
  dopoTrascrizione?: (testo: string) => "fermato" | "continua";
}

/**
 * Contesto prima di «Jarvis» (v0.5.3): pipeline a parte, solo trascrizione.
 * Se HA non la chiude entro questo tempo, la si chiude da qui.
 */
export const CONTESTO_MASSIMO_MS = 30_000;
/** Pezzi del contesto: come quelli del microfono (1024 campioni a 16 kHz). */
const PEZZO_CONTESTO = 1024;

/** Risposta scritta di un «Jarvis, stop» gestito sul pannello. */
export const RISPOSTA_STOP = "Timer fermato.";

interface Esecuzione {
  turnoId: number;
  dopoTrascrizione: OpzioniParla["dopoTrascrizione"];
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
  parla(sampleRate: number, opzioni: OpzioniParla = {}): number | null {
    if (this.occupato) return null;
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) return null;
    this.controllaScadenza();
    this.contatore += 1;
    const turno = nuovoTurno(this.contatore, "", true);
    this.elenco = [...this.elenco, turno];
    this.ultimaAttivita = this.adesso();
    this.avvia(conn, turno, { sampleRate, ...opzioni });
    this.notifica();
    return turno.id;
  }

  /**
   * Il parlato del minuto PRIMA della frase con «Jarvis» (v0.5.3, "persona
   * sempre presente"): una pipeline a parte, solo stt e con `no_vad`, col
   * device_id `<pannello>__contesto`. jarvis_voce lo trascrive e lo dà a
   * Gemini insieme alla domanda (aspetta la trascrizione fino a 6 s).
   *
   * Parte prima della richiesta, l'audio va tutto a raffica appena HA dà l'id
   * e si chiude subito col frame vuoto. Indipendente dalla domanda: niente
   * turno, niente interfaccia, e se fallisce solo una riga nel registro (la
   * domanda va avanti lo stesso). Del testo trascritto si scrive solo la
   * lunghezza: è il discorso di casa, non va nel registro.
   * `pcm` (16 kHz) viene azzerato appena inviato. False se non è partita.
   */
  inviaContesto(pcm: Int16Array): boolean {
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato() || pcm.length === 0) {
      pcm.fill(0);
      return false;
    }
    const secondi = (pcm.length / 16000).toFixed(1).replace(".", ",");
    const t0 = this.adesso();
    let smetti: (() => Promise<void>) | null = null;
    let finita = false;
    const chiudi = (): void => {
      if (finita) return;
      finita = true;
      clearTimeout(limite);
      pcm.fill(0);
      const s = smetti;
      smetti = null;
      if (s && this.dip.collegato())
        s().catch((errore: unknown) => {
          log.avviso(`Contesto: chiusura della pipeline non riuscita: ${descriviErrore(errore)}`);
        });
    };
    const limite = setTimeout(() => {
      log.avviso(`Contesto: HA non ha chiuso la trascrizione entro ${CONTESTO_MASSIMO_MS / 1000} s`);
      chiudi();
    }, CONTESTO_MASSIMO_MS);
    const suEvento = (ev: EventoPipeline): void => {
      if (finita) return;
      const dati = ev.data ?? {};
      if (ev.type === "run-start") {
        const runner = dati["runner_data"] as { stt_binary_handler_id?: unknown } | undefined;
        const id = runner?.stt_binary_handler_id;
        if (typeof id !== "number") {
          log.avviso("Contesto: HA non ha dato l'id per l'audio");
          return chiudi();
        }
        for (let i = 0; i < pcm.length; i += PEZZO_CONTESTO) {
          const pezzo = pcm.subarray(i, i + PEZZO_CONTESTO);
          const frame = new Uint8Array(pezzo.byteLength + 1);
          frame[0] = id;
          frame.set(new Uint8Array(pezzo.buffer, pezzo.byteOffset, pezzo.byteLength), 1);
          if (!this.dip.inviaBinario(frame.buffer)) {
            log.avviso("Contesto: connessione persa durante l'invio");
            return chiudi();
          }
        }
        this.dip.inviaBinario(new Uint8Array([id]).buffer);
        pcm.fill(0);
        log.info(`Contesto: ${secondi} s inviati in ${this.adesso() - t0} ms`);
      } else if (ev.type === "stt-end") {
        const uscita = dati["stt_output"] as { text?: unknown } | undefined;
        const n = typeof uscita?.text === "string" ? uscita.text.length : 0;
        log.info(`Contesto: trascritto da HA in ${this.adesso() - t0} ms (${n} caratteri)`);
      } else if (ev.type === "error") {
        const codice = typeof dati["code"] === "string" ? dati["code"] : "errore";
        log.avviso(`Contesto non trascritto: ${codice}`);
      } else if (ev.type === "run-end") chiudi();
    };
    const dispositivo = this.dip.dispositivo?.() ?? "jarvis_pannello";
    conn
      .subscribeMessage<EventoPipeline>(
        suEvento,
        {
          type: "assist_pipeline/run",
          start_stage: "stt",
          end_stage: "stt",
          input: { sample_rate: 16000, no_vad: true },
          device_id: `${dispositivo}__contesto`,
          timeout: CONTESTO_MASSIMO_MS / 1000,
        },
        { resubscribe: false },
      )
      .then((s) => {
        smetti = s;
        // run-end arrivato insieme al risultato
        if (finita) {
          smetti = null;
          if (this.dip.collegato())
            s().catch((errore: unknown) => {
              log.avviso(`Contesto: chiusura della pipeline non riuscita: ${descriviErrore(errore)}`);
            });
        }
      })
      .catch((errore: unknown) => {
        log.avviso(`Contesto: richiesta rifiutata da HA: ${descriviErrore(errore)}`);
        chiudi();
      });
    return true;
  }

  /**
   * Jarvis parla per primo (v0.5.4, evento `jarvis_annuncio`): il testo arriva
   * già scritto, serve solo la voce. Pipeline da tts a tts (`input.text`,
   * ammessa da assist_pipeline/run: start_stage tts vuole il testo), con la
   * stessa voce delle risposte. Il turno nasce con la risposta già scritta e
   * "fatto", e aspetta solo l'audio (tts-end). Niente conversation_id: la
   * frase la tiene il server come contesto per 3 minuti (jarvis_voce 0.2.8).
   * Ritorna l'id del turno, o null se non può partire (offline, occupato).
   */
  annuncia(testo: string): number | null {
    const pulito = testo.trim();
    if (!pulito || this.occupato) return null;
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) return null;
    this.controllaScadenza();
    this.contatore += 1;
    const turno: Turno = {
      ...nuovoTurno(this.contatore, "", true),
      fase: "fatto",
      risposta: pulito,
      annuncio: true,
    };
    this.elenco = [...this.elenco, turno];
    this.ultimaAttivita = this.adesso();
    this.avvia(conn, turno, "annuncio");
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

  /**
   * Chiude il turno in corso da qui, senza aspettare HA: tocco su "ferma"
   * mentre Jarvis pensa, o un limite di tempo della voce. Il pulsante del
   * microfono non deve mai restare bloccato (sessione server, 30/09).
   */
  interrompi(turnoId: number, tipo: "annullata" | "tempo" | "nonSentito", dettaglio: string): void {
    const esecuzione = this.esecuzione;
    if (esecuzione?.turnoId !== turnoId || esecuzione.chiusa) return;
    log.avviso(`Assistente: ${dettaglio}`);
    const t = this.turno(turnoId);
    if (t?.fase === "fatto") {
      // risposta scritta già arrivata, manca solo l'audio: la si tiene così,
      // senza audio (niente più da aspettare), invece di trasformarla in errore
      this.sostituisci({ ...t, audioPronto: true, urlAudio: null, concluso: true });
      this.ultimaAttivita = this.adesso();
      this.concludi(esecuzione);
      this.notifica();
      return;
    }
    this.chiudiConErrore(esecuzione, tipo, dettaglio);
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

  private avvia(
    conn: ConnessioneAssistente,
    turno: Turno,
    voce: (OpzioniParla & { sampleRate: number }) | "risposta" | "annuncio" | null = null,
  ): void {
    const perVoce = voce !== null && voce !== "risposta" && voce !== "annuncio" ? voce : null;
    const esecuzione: Esecuzione = {
      turnoId: turno.id,
      dopoTrascrizione: perVoce?.dopoTrascrizione,
      smetti: null,
      chiusa: false,
      audioChiuso: false,
      timerChiusura: undefined,
      // a voce "più lenta del solito" conta da quando hai finito di parlare
      timerLenta: turno.voce && voce !== "risposta" && voce !== "annuncio" ? undefined : this.armaLenta(),
      timerMassimo: setTimeout(() => {
        log.avviso(`Assistente: nessuna risposta entro ${MASSIMO_MS / 1000} s`);
        this.chiudiConErrore(esecuzione, "tempo", `Nessuna risposta entro ${MASSIMO_MS / 1000} s`);
      }, MASSIMO_MS),
    };
    this.esecuzione = esecuzione;
    this.lentaDa = null;
    const messaggio: Record<string, unknown> =
      voce === "annuncio"
        ? {
            type: "assist_pipeline/run",
            start_stage: "tts",
            end_stage: "tts",
            input: { text: turno.risposta },
            timeout: MASSIMO_MS / 1000,
          }
        : perVoce
          ? {
              type: "assist_pipeline/run",
              start_stage: "stt",
              end_stage: perVoce.dopoTrascrizione ? "stt" : "tts",
              input: {
                sample_rate: perVoce.sampleRate,
                ...(perVoce.parola ? { wake_word_phrase: perVoce.parola } : {}),
              },
              conversation_id: this.conversationId,
              timeout: MASSIMO_MS / 1000,
            }
          : {
              type: "assist_pipeline/run",
              start_stage: "intent",
              // il seguito di una domanda a voce trascritta: risposta scritta e audio
              end_stage: voce === "risposta" ? "tts" : "intent",
              input: { text: turno.domanda },
              conversation_id: this.conversationId,
              timeout: MASSIMO_MS / 1000,
            };
    const dispositivo = this.dip.dispositivo?.() ?? null;
    // accettato da assist_pipeline/run (vol.Optional("device_id"), HA 2026.9.3)
    if (dispositivo) messaggio["device_id"] = dispositivo;
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
    if (ev.type === "stt-end" && esecuzione.dopoTrascrizione) {
      this.dopoTrascrizione(esecuzione, dopo, esecuzione.dopoTrascrizione);
      return;
    }
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

  /**
   * Il testo della domanda fatta mentre suonava un timer: «stop» si chiude
   * qui, il resto va avanti con una pipeline da intent a tts sullo stesso
   * turno (stessa conversazione, stessa faccia della voce).
   */
  private dopoTrascrizione(
    esecuzione: Esecuzione,
    trascritto: Turno,
    decidi: NonNullable<OpzioniParla["dopoTrascrizione"]>,
  ): void {
    // la pipeline "solo testo" è finita qui: HA manda solo run-end
    this.concludi(esecuzione);
    let esito: "fermato" | "continua";
    try {
      esito = trascritto.domanda ? decidi(trascritto.domanda) : "continua";
    } catch (errore) {
      log.errore(`Assistente: decisione dopo la trascrizione in errore: ${descriviErrore(errore)}`);
      esito = "continua";
    }
    this.ultimaAttivita = this.adesso();
    if (!trascritto.domanda) {
      this.sostituisci({
        ...trascritto,
        fase: "errore",
        concluso: true,
        errore: { tipo: "nonSentito", dettaglio: "stt-end senza testo" },
      });
      this.notifica();
      return;
    }
    if (esito === "fermato") {
      this.sostituisci({
        ...trascritto,
        fase: "fatto",
        risposta: RISPOSTA_STOP,
        audioPronto: true,
        urlAudio: null,
        concluso: true,
      });
      this.notifica();
      return;
    }
    const conn = this.dip.conn();
    if (!conn || !this.dip.collegato()) {
      this.sostituisci({
        ...trascritto,
        fase: "errore",
        concluso: true,
        errore: { tipo: "connessione", dettaglio: "Connessione persa dopo la trascrizione" },
      });
      this.notifica();
      return;
    }
    this.sostituisci({ ...trascritto, fase: "pensa", concluso: false });
    const aggiornato = this.turno(trascritto.id);
    if (aggiornato) this.avvia(conn, aggiornato, "risposta");
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
    tipo: TipoErrore,
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
