import {
  erroreDiGoogle,
  messaggioMicrofono,
  problemaDaErrore,
  type Assistente,
  type MessaggioMicrofono,
  type OpzioniParla,
  type Turno,
} from "../assistente";
import { descriviErrore, log } from "../diagnostica";
import { Bip, Riproduttore } from "./audio";
import { CAMPIONI_PER_PEZZO, Microfono, MicrofonoNonDisponibile } from "./microfono";
import type { SorgenteMicrofono } from "./microfono-condiviso";
import { RilevaParlato } from "./parlato";
import {
  caricaPreferenzeVoce,
  leggiPreferenzeVoce,
  PREFERENZE_VOCE_DI_SERIE,
  salvaPreferenzeVoce,
  type PreferenzeVoce,
} from "./preferenze-voce";

/**
 * Voce "tocca per parlare" (F5). Una faccia del motore dell'assistente: la
 * domanda e la risposta sono turni come quelli scritti, e finiscono nella chat.
 *
 * Flusso: tocco → bip → microfono → assist_pipeline/run da stt a tts. L'audio
 * va a HA appena HA dà l'id (prima si tiene da parte). HA chiude l'ascolto da
 * solo dopo 0,7 s di silenzio (VAD); il tocco su "ferma" lo chiude prima.
 * L'audio della risposta parte SUBITO a tts-end (o tts-start in streaming),
 * mai aspettando run-end: per le risposte locali HA non chiude la pipeline
 * finché qualcuno non consuma l'audio.
 *
 * Conversazione continua (v0.5.3, come un Echo): finita la risposta il
 * pannello riascolta senza «Jarvis». La domanda verso HA parte solo se qui
 * si sente parlare (`RilevaParlato`), con lo stesso conversation_id; se
 * nessuno parla si chiude in silenzio e dal pannello non è uscito niente.
 * Dalla v0.5.8 quanto dipende dalla risposta: se Jarvis ha fatto una
 * domanda (continue_conversation) "Ti ascolto ancora…" per 8 s; dopo
 * un'azione o una risposta chiusa una finestra breve (2 s) senza scritte.
 */
export type FaseVoce = "spenta" | "apertura" | "ascolto" | "pensa" | "risponde" | "errore";
/** Dove si vede la voce: nella chat, nel riquadro piccolo o nell'Hub (fase G). */
export type DoveVoce = "chat" | "riquadro" | "hub";

/**
 * Rete di sicurezza: la frase la chiude il server (jarvis_voce 0.2.7, al
 * massimo 30 s). Il pannello non deve tagliarla prima: noi chiudiamo a 35.
 */
const ASCOLTO_MASSIMO_MS = 35_000;
/** Dopo una domanda di Jarvis: per quanto si riascolta senza «Jarvis» (v0.5.3; Impostazioni → Voce). */
export const SEGUITO_MS = PREFERENZE_VOCE_DI_SERIE.riascoltoSecondi * 1000;
/** Dopo un'azione o una risposta chiusa: la finestra breve (v0.5.8; Impostazioni → Voce). */
export const SEGUITO_BREVE_MS = PREFERENZE_VOCE_DI_SERIE.riascoltoAzioneSecondi * 1000;
/** Seguito: audio mandato a HA prima del primo pezzo di parlato, per non tagliare la prima sillaba. */
const PRIMA_DEL_PARLATO = 8; // pezzi da 64 ms: ~0,5 s
/**
 * Il pulsante del microfono non resta mai bloccato (sessione server, 30/09):
 * ogni fase "di attesa" ha un limite, e scaduto quello si torna attivi con un
 * messaggio umano. Apertura: getUserMedia può non rispondere mai (microfono
 * conteso), ma lascia il tempo di toccare "Consenti" la prima volta.
 */
export const APERTURA_MASSIMA_MS = 10_000;
/**
 * Pensa: da fine parlato all'audio della risposta. Più corto dei 60 s della
 * chat: a voce nessuno aspetta un minuto davanti al pannello, e intanto il
 * tocco su "ferma" annulla subito.
 */
export const PENSA_MASSIMO_MS = 30_000;
/**
 * Audio tenuto da parte prima che HA dia l'id: al massimo ~25 s. Con «Jarvis»
 * ci sono fino a 10 s di frase PRIMA della parola (v0.5.2), più l'audio dal
 * vivo che arriva mentre HA risponde: con il vecchio limite (~10 s) si
 * sarebbe buttato proprio l'audio dopo la parola.
 */
const CODA_MASSIMA = 400;
/** Seguito in attesa di parlato: si tiene solo l'ultimo mezzo secondo. */
const CODA_SEGUITO = PRIMA_DEL_PARLATO;

/** Domanda nata dalla parola «Jarvis» (v0.5.0). */
interface OpzioniVoce extends OpzioniParla {
  /**
   * La frase fino allo scatto (dalla memoria circolare, 16 kHz): va a HA per
   * prima, così la parola e l'inizio della frase non si perdono.
   */
  preroll?: Int16Array;
  /** Suono breve subito, insieme al segnale a schermo (Impostazioni → Voce, v0.5.3). */
  suono?: boolean;
  /**
   * Tempi della parola (performance.now()): quando è arrivato il pezzo con la
   * fine della parola e quando è scattata. Il resto lo misura la voce e va
   * nel registro in una riga (v0.5.3, "reattività come Alexa").
   */
  tempi?: { finePezzo: number; scatto: number };
  /**
   * Com'è andata la domanda nata da «Jarvis» (v0.5.4): il testo trascritto,
   * o null se HA non ha sentito parole (falso scatto). Chiamata una volta
   * sola; non per il doppione (ha risposto un altro pannello).
   */
  dopoScatto?: (testo: string | null) => void;
  /**
   * Domanda partita senza «Jarvis» ma da un segnale che può sbagliare
   * (v0.6.0: guarda e parla): se HA non sente parole si chiude in silenzio,
   * come dopo un falso scatto, invece di «Non ho capito».
   */
  silenziosoSeVuoto?: boolean;
}

/** Le misure di reattività di una domanda nata da «Jarvis». */
interface Misura {
  finePezzo: number;
  scatto: number;
  segnale: number | null;
  runStart: number | null;
  primoAudio: number | null;
}

interface DipendenzeVoce {
  assistente: Assistente;
  collegato: () => boolean;
  microfono?: SorgenteMicrofono;
  riproduttore?: Riproduttore;
  bip?: Bip;
}

export class Voce {
  private statoFase: FaseVoce = "spenta";
  private luogo: DoveVoce = "chat";
  private idTurno: number | null = null;
  private problemaMic: MessaggioMicrofono | null = null;
  private riquadro = false;
  private sessione = 0;
  private seguito = false;
  /** Domanda nata da «Jarvis» (non dal tocco): se nessuno parla si chiude in silenzio. */
  private daParola = false;
  private riproduzioneAvviata = false;
  private coda: ArrayBuffer[] = [];
  /** Seguito aperto dopo la risposta, finché qui non si sente parlare. */
  private attesaSeguito: RilevaParlato | null = null;
  /** Il seguito aperto è la finestra breve dopo un'azione (v0.5.8): niente "Ti ascolto ancora". */
  private seguitoBreve = false;
  /** Il prossimo seguito: quanto dura e se è breve (lo decide rispondi()). */
  private prossimoSeguito: { ms: number; breve: boolean } | null = null;
  private frequenza = 16000;
  private misura: Misura | null = null;
  private dopoScatto: ((testo: string | null) => void) | null = null;
  /** Dopo la risposta si riascolta (v0.5.3); un annuncio con ascolta=false no (v0.5.4). */
  private riascoltaDopo = true;
  /** Annuncio che aspetta risposta (ascolta=true): conta come una domanda di Jarvis (v0.5.8). */
  private annuncioDomanda = false;
  /** Volume della risposta in corso (annunci: il loro volume). */
  private volume = 1;
  private timerSeguito: ReturnType<typeof setTimeout> | undefined;
  private pref: PreferenzeVoce = caricaPreferenzeVoce();
  private timerAscolto: ReturnType<typeof setTimeout> | undefined;
  private timerRiquadro: ReturnType<typeof setTimeout> | undefined;
  /** Limite di "apertura" e "pensa": si riarma a ogni cambio di fase. */
  private timerFase: ReturnType<typeof setTimeout> | undefined;
  private readonly microfono: SorgenteMicrofono;
  private readonly riproduttore: Riproduttore;
  private readonly bip: Bip;
  private readonly ascoltatori = new Set<() => void>();
  private readonly ascoltatoriLivello = new Set<(l: number) => void>();

  constructor(private readonly dip: DipendenzeVoce) {
    this.microfono = dip.microfono ?? new Microfono();
    this.riproduttore = dip.riproduttore ?? new Riproduttore();
    this.bip = dip.bip ?? new Bip();
    dip.assistente.ascolta(() => this.allinea());
  }

  get fase(): FaseVoce {
    return this.statoFase;
  }
  get dove(): DoveVoce {
    return this.luogo;
  }
  /** Il turno di questa voce (domanda sentita, risposta, errore). */
  get turno(): Turno | undefined {
    return this.idTurno === null ? undefined : this.dip.assistente.turno(this.idTurno);
  }
  /** Il microfono non si è aperto: perché, in parole semplici. */
  get erroreMicrofono(): MessaggioMicrofono | null {
    return this.problemaMic;
  }
  get riquadroVisibile(): boolean {
    return this.riquadro;
  }
  get attiva(): boolean {
    return this.statoFase !== "spenta";
  }
  get preferenze(): PreferenzeVoce {
    return { ...this.pref };
  }

  /** Impostazioni → Voce; `null` = valore di serie. */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeVoce]?: PreferenzeVoce[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi)) {
      if (v === undefined) continue;
      unito[k] = v === null ? PREFERENZE_VOCE_DI_SERIE[k as keyof PreferenzeVoce] : v;
    }
    this.pref = leggiPreferenzeVoce(JSON.stringify(unito));
    salvaPreferenzeVoce(this.pref);
    const p = this.pref;
    log.info(
      `Voce: riascolto dopo una domanda ${p.riascoltoSecondi ? `${p.riascoltoSecondi} s` : "spento"}, ` +
        `dopo un'azione ${p.riascoltoAzioneSecondi ? `${p.riascoltoAzioneSecondi} s` : "spento"}, ` +
        `sensibilità ${p.sensibilitaParlato}`,
    );
    this.notifica();
  }

  /** "Ti ascolto ancora": riascolto dopo una domanda di Jarvis, senza «Jarvis» (v0.5.3). */
  get ascoltoAncora(): boolean {
    return this.statoFase === "ascolto" && this.attesaSeguito !== null && !this.seguitoBreve;
  }
  /** Finestra breve dopo un'azione (v0.5.8): si ascolta, ma senza scritte né anello. */
  get ascoltoBreve(): boolean {
    return this.statoFase === "ascolto" && this.attesaSeguito !== null && this.seguitoBreve;
  }
  /** Il browser permette il microfono su questo indirizzo. */
  get disponibile(): boolean {
    return Microfono.disponibile();
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Livello del microfono (0..1), ~16 volte al secondo: canale a parte per non ridisegnare la chat. */
  ascoltaLivello(f: (l: number) => void): () => void {
    this.ascoltatoriLivello.add(f);
    return () => this.ascoltatoriLivello.delete(f);
  }

  /** Tocco sul microfono, o «Jarvis» sentito (con `opzioni`). */
  async parla(dove: DoveVoce, seguito = false, opzioni: OpzioniVoce = {}): Promise<void> {
    if (this.statoFase !== "spenta" && this.statoFase !== "errore") return;
    // segnale subito (v0.5.3): il suono prima di tutto, lo schermo con "apertura" qui sotto
    if (opzioni.suono) this.bip.suona("apri");
    this.misura = opzioni.tempi
      ? { ...opzioni.tempi, segnale: null, runStart: null, primoAudio: null }
      : null;
    this.dopoScatto = opzioni.dopoScatto ?? null;
    this.riascoltaDopo = true;
    this.annuncioDomanda = false;
    const prossimo = this.prossimoSeguito;
    this.prossimoSeguito = null;
    this.volume = 1;
    clearTimeout(this.timerRiquadro);
    this.luogo = dove;
    this.riquadro = dove === "riquadro";
    this.problemaMic = null;
    this.seguito = seguito;
    this.daParola = opzioni.parola !== undefined || opzioni.silenziosoSeVuoto === true;
    if (!seguito) this.idTurno = null;
    if (!this.dip.collegato() || this.dip.assistente.occupato) {
      this.imposta("spenta");
      return;
    }
    const sessione = ++this.sessione;
    this.imposta("apertura");
    const misura = this.misura;
    if (misura)
      requestAnimationFrame(() => {
        misura.segnale = performance.now();
      });
    let frequenza: number;
    try {
      frequenza = await this.microfono.avvia({
        pezzo: (pcm) => this.suPezzo(pcm),
        livello: (l) => {
          for (const f of this.ascoltatoriLivello) f(l);
        },
        interrotto: () => {
          // il sistema ha chiuso il microfono: HA risponde a quello che ha già sentito
          if (sessione === this.sessione && this.statoFase === "ascolto") this.chiudiMicrofono();
        },
      });
    } catch (errore) {
      if (sessione !== this.sessione) return;
      const problema = errore instanceof MicrofonoNonDisponibile ? "https" : problemaDaErrore(errore);
      log.avviso(`Voce: microfono non aperto (${problema}): ${descriviErrore(errore)}`);
      this.problemaMic = messaggioMicrofono(problema);
      this.imposta("errore");
      return;
    }
    if (sessione !== this.sessione) {
      this.microfono.ferma();
      return;
    }
    this.frequenza = frequenza;
    if (seguito) {
      // conversazione continua: si ascolta qui, la domanda a HA parte solo se qualcuno parla
      this.attesaSeguito = new RilevaParlato(this.pref.sensibilitaParlato);
      this.seguitoBreve = prossimo?.breve ?? false;
      this.coda = [];
      const ms = prossimo?.ms ?? this.pref.riascoltoSecondi * 1000;
      this.timerSeguito = setTimeout(() => this.seguitoSenzaParlato(sessione), ms);
      log.info(
        this.seguitoBreve
          ? `Voce: risposta chiusa, ascolto ancora ${ms / 1000} s in silenzio se qualcuno continua`
          : `Voce: ti ascolto ancora per ${ms / 1000} s, senza «Jarvis»`,
      );
      this.imposta("ascolto");
      return;
    }
    const perAssistente: OpzioniParla = {
      ...(opzioni.parola !== undefined ? { parola: opzioni.parola } : {}),
      ...(opzioni.dopoTrascrizione ? { dopoTrascrizione: opzioni.dopoTrascrizione } : {}),
    };
    if (!this.avviaDomanda(perAssistente, opzioni.preroll ? aPezzi(opzioni.preroll) : [])) return;
    // con «Jarvis» il suono (se acceso) è già partito allo scatto; il tocco ha il suo bip
    if (opzioni.parola === undefined) this.bip.suona("apri");
    this.imposta("ascolto");
  }

  /** La domanda parte verso HA: pipeline, audio tenuto da parte, limite dell'ascolto. */
  private avviaDomanda(opzioni: OpzioniParla, coda: ArrayBuffer[]): boolean {
    const id = this.dip.assistente.parla(this.frequenza, opzioni);
    if (id === null) {
      // HA perso mentre il microfono si apriva (o una domanda scritta in corso)
      this.microfono.ferma();
      this.coda = [];
      this.finito();
      return false;
    }
    this.idTurno = id;
    // prima l'audio della parola, poi quello dal vivo (tenuti da parte fino all'id di HA)
    this.coda = coda;
    this.riproduzioneAvviata = false;
    this.timerAscolto = setTimeout(() => {
      log.avviso("Voce: ascolto oltre il tempo massimo, lo chiudo");
      this.chiudiMicrofono();
    }, ASCOLTO_MASSIMO_MS);
    return true;
  }

  /** Seguito: qualcuno ha cominciato a parlare, la domanda parte (stessa conversazione). */
  private parlatoNelSeguito(): void {
    clearTimeout(this.timerSeguito);
    this.attesaSeguito = null;
    this.seguitoBreve = false;
    log.info("Voce: parlato dopo la risposta, la domanda continua");
    // il turno della risposta finita non va più seguito (allinea lo leggerebbe come "pensa")
    this.idTurno = null;
    if (!this.avviaDomanda({}, this.coda.splice(0))) return;
    this.notifica();
  }

  /** Seguito senza parlato (8 s o la finestra breve). Si chiude in silenzio, a HA non è andato niente. */
  private seguitoSenzaParlato(sessione: number): void {
    if (sessione !== this.sessione || !this.attesaSeguito) return;
    this.chiudiSeguito("nessuno ha parlato dopo la risposta, chiudo in silenzio");
  }

  private chiudiSeguito(motivo: string): void {
    clearTimeout(this.timerSeguito);
    this.attesaSeguito = null;
    this.seguitoBreve = false;
    this.sessione += 1;
    this.microfono.ferma();
    this.coda = [];
    log.info(`Voce: ${motivo}`);
    this.finito();
  }

  /**
   * Jarvis parla per primo (v0.5.4): il turno dell'annuncio (già scritto,
   * `Assistente.annuncia`) si dice come una risposta, `dove` si vede; poi, se
   * `ascolta`, il riascolto come dopo una domanda di Jarvis. False se la
   * voce è occupata (chi chiama lo rimette in coda).
   */
  annuncia(id: number, dove: DoveVoce, opzioni: { ascolta: boolean; volume: number }): boolean {
    if (this.statoFase !== "spenta" && this.statoFase !== "errore") return false;
    clearTimeout(this.timerRiquadro);
    this.sessione += 1;
    this.luogo = dove;
    this.riquadro = dove === "riquadro";
    this.problemaMic = null;
    this.seguito = false;
    this.daParola = false;
    this.misura = null;
    this.dopoScatto = null;
    this.riascoltaDopo = opzioni.ascolta;
    this.annuncioDomanda = opzioni.ascolta;
    this.prossimoSeguito = null;
    this.volume = opzioni.volume;
    this.idTurno = id;
    this.riproduzioneAvviata = false;
    this.imposta("pensa");
    this.allinea();
    return true;
  }

  /** Tocco su "ferma"/"interrompi"/"chiudi", a seconda del momento. */
  ferma(): void {
    switch (this.statoFase) {
      case "apertura":
        this.sessione += 1;
        this.microfono.ferma();
        this.imposta("spenta");
        break;
      case "pensa":
        // prima il tocco qui non faceva niente fino a 60 s: pulsante bloccato
        this.interrompi("annullata", "domanda annullata dall'utente");
        break;
      case "ascolto":
        // riascolto dopo la risposta, nessuno ha ancora parlato: si chiude e basta
        if (this.attesaSeguito) this.chiudiSeguito("riascolto chiuso col tocco");
        // HA riceve la fine dell'audio e risponde a quello che ha sentito
        else this.chiudiMicrofono();
        break;
      case "risponde":
        // interrotta: niente seguito (rispondi() lo apre solo se l'audio è "finito")
        this.riproduttore.ferma();
        break;
      case "errore":
        this.problemaMic = null;
        this.nascondiRiquadro();
        this.imposta("spenta");
        break;
      default:
        break;
    }
  }

  /** Il riquadro è stato toccato: la conversazione continua nella chat. */
  spostaInChat(): void {
    this.luogo = "chat";
    this.nascondiRiquadro();
    this.notifica();
  }

  nascondiRiquadro(): void {
    clearTimeout(this.timerRiquadro);
    if (!this.riquadro) return;
    this.riquadro = false;
    this.notifica();
  }

  private suPezzo(pcm: ArrayBuffer): void {
    if (this.statoFase !== "ascolto") return;
    const attesa = this.attesaSeguito;
    if (attesa) {
      // seguito: niente verso HA finché qui non si sente parlare
      this.coda.push(pcm);
      if (this.coda.length > CODA_SEGUITO) this.coda.shift();
      if (attesa.pezzo(new Int16Array(pcm))) this.parlatoNelSeguito();
      return;
    }
    const id = this.idTurno;
    if (id === null) return;
    const t = this.dip.assistente.turno(id);
    if (t?.idAudio == null) {
      // HA non ha ancora dato l'id (run-start): si tiene da parte
      if (this.coda.length < CODA_MASSIMA) this.coda.push(pcm);
      return;
    }
    this.svuotaCoda(id);
    this.dip.assistente.inviaAudio(id, pcm);
  }

  /** L'audio tenuto da parte va a HA appena c'è l'id (run-start), senza aspettare il pezzo dopo. */
  private svuotaCoda(id: number): void {
    const misura = this.misura;
    if (misura && misura.primoAudio === null) {
      misura.primoAudio = performance.now();
      this.scriviMisura(misura);
    }
    for (const vecchio of this.coda.splice(0)) this.dip.assistente.inviaAudio(id, vecchio);
  }

  /**
   * Reattività di «Jarvis» nel registro (v0.5.3): dalla fine della parola
   * (il pezzo di microfono che la contiene) allo scatto del modello, al
   * segnale a schermo, alla risposta di HA (run-start) e al primo audio.
   */
  private scriviMisura(m: Misura): void {
    this.misura = null;
    const ms = (t: number | null): string => (t === null ? "?" : `${Math.round(t - m.finePezzo)} ms`);
    log.info(
      `Reattività «Jarvis»: scatto ${ms(m.scatto)}, segnale ${ms(m.segnale)}, ` +
        `run-start ${ms(m.runStart)}, primo audio ${ms(m.primoAudio)} (dalla fine della parola)`,
    );
  }

  private chiudiMicrofono(): void {
    if (this.attesaSeguito) return;
    clearTimeout(this.timerAscolto);
    this.timerAscolto = undefined;
    if (!this.microfono.attivo) return;
    this.microfono.ferma();
    this.coda = [];
    if (this.idTurno !== null) this.dip.assistente.fineAudio(this.idTurno);
    this.bip.suona("chiudi");
    if (this.statoFase === "ascolto") this.imposta("pensa");
  }

  /** Segue il turno nel motore dell'assistente. */
  private allinea(): void {
    const t = this.turno;
    // nel riascolto il turno è ancora quello della risposta appena data
    if (!t || this.statoFase === "spenta" || this.statoFase === "apertura" || this.attesaSeguito) return;
    if (t.domanda) this.esitoScatto(t.domanda);
    if (this.statoFase === "ascolto" && t.idAudio != null && t.fase === "ascolto") {
      if (this.misura && this.misura.runStart === null) this.misura.runStart = performance.now();
      if (this.coda.length) this.svuotaCoda(t.id);
    }
    if (this.statoFase === "ascolto" && (t.fineParlato || t.fase !== "ascolto")) this.chiudiMicrofono();
    if (t.fase === "errore") {
      this.chiudiMicrofono();
      this.riproduttore.ferma();
      if (t.errore?.tipo === "doppione") {
        // un altro pannello ha sentito la stessa «Jarvis» e risponde lui: qui niente
        log.info("Voce: «Jarvis» sentito anche da un altro pannello, risponde lui");
        this.dopoScatto = null;
        this.dip.assistente.scarta(t.id);
        this.idTurno = null;
        this.problemaMic = null;
        this.nascondiRiquadro();
        this.imposta("spenta");
        return;
      }
      if ((this.seguito || this.daParola) && t.errore?.tipo === "nonSentito" && !t.domanda) {
        // seguito senza risposta, o «Jarvis» sentito per sbaglio e nessuno parla:
        // come un Echo, si chiude in silenzio (niente "Non ho capito" a ogni falso scatto)
        if (this.daParola) log.info("Voce: dopo «Jarvis» nessuna domanda, chiudo in silenzio");
        this.esitoScatto(null);
        this.dip.assistente.scarta(t.id);
        this.idTurno = null;
        this.finito();
        return;
      }
      if (this.statoFase !== "errore") {
        // v0.5.8: Google non risponde (trascrizione o Gemini): un suono breve, mai la voce
        if (erroreDiGoogle(t.errore)) {
          log.avviso(`Voce: Google non risponde (${t.errore?.dettaglio ?? "?"})`);
          this.bip.suona("errore");
        }
        this.imposta("errore");
      }
      return;
    }
    if (t.fase === "fatto" && t.audioPronto && !t.urlAudio && t.concluso && !this.riproduzioneAvviata) {
      // risposta senza audio (es. «Jarvis, stop» gestito sul pannello): finita così
      this.chiudiMicrofono();
      this.riproduzioneAvviata = true;
      this.finito();
      return;
    }
    if (t.fase === "fatto" && t.audioPronto && t.urlAudio && !this.riproduzioneAvviata) {
      this.riproduzioneAvviata = true;
      void this.rispondi(t.urlAudio);
      return;
    }
    if (this.statoFase === "risponde") return;
    const nuova: FaseVoce = t.fase === "ascolto" ? "ascolto" : "pensa";
    if (nuova !== this.statoFase) this.imposta(nuova);
  }

  /** Una volta sola per scatto: com'è andata (testo o niente). */
  private esitoScatto(testo: string | null): void {
    const f = this.dopoScatto;
    this.dopoScatto = null;
    if (!f) return;
    try {
      f(testo);
    } catch (errore) {
      log.errore(`Voce: esito dello scatto in errore: ${descriviErrore(errore)}`);
    }
  }

  private async rispondi(url: string): Promise<void> {
    const sessione = this.sessione;
    this.imposta("risponde");
    const esito = await this.riproduttore.riproduci(new URL(url, location.href).href, this.volume);
    if (sessione !== this.sessione || this.statoFase !== "risponde") return;
    // conversazione continua, se l'audio è finito da solo (non interrotto). v0.5.8: dopo una
    // domanda di Jarvis il riascolto lungo, dopo un'azione o una risposta chiusa quello breve
    const domanda = this.annuncioDomanda || this.turno?.continua === true;
    const secondi = domanda ? this.pref.riascoltoSecondi : this.pref.riascoltoAzioneSecondi;
    if (esito === "finito" && this.riascoltaDopo && secondi > 0 && this.dip.collegato()) {
      this.imposta("spenta");
      this.prossimoSeguito = { ms: secondi * 1000, breve: !domanda };
      await this.parla(this.luogo, true);
      return;
    }
    this.finito();
  }

  private finito(): void {
    this.imposta("spenta");
    if (this.riquadro) {
      clearTimeout(this.timerRiquadro);
      this.timerRiquadro = setTimeout(() => this.nascondiRiquadro(), this.pref.riquadroSecondi * 1000);
    }
  }

  private imposta(fase: FaseVoce): void {
    if (fase !== this.statoFase) {
      clearTimeout(this.timerFase);
      this.timerFase = undefined;
      if (fase === "apertura") {
        const sessione = this.sessione;
        this.timerFase = setTimeout(() => this.aperturaScaduta(sessione), APERTURA_MASSIMA_MS);
      } else if (fase === "pensa")
        this.timerFase = setTimeout(
          () => this.interrompi("tempo", `nessuna risposta a voce entro ${PENSA_MASSIMO_MS / 1000} s`),
          PENSA_MASSIMO_MS,
        );
    }
    this.statoFase = fase;
    this.notifica();
  }

  /** Il microfono non si è aperto in tempo: si lascia perdere e il pulsante torna attivo. */
  private aperturaScaduta(sessione: number): void {
    if (sessione !== this.sessione || this.statoFase !== "apertura") return;
    log.avviso(`Voce: il microfono non si è aperto entro ${APERTURA_MASSIMA_MS / 1000} s`);
    this.sessione += 1;
    this.microfono.ferma();
    this.problemaMic = messaggioMicrofono("altro");
    this.imposta("errore");
  }

  /**
   * Chiude la domanda in corso da qui ("ferma" o tempo scaduto). Se il testo
   * della risposta è già arrivato e manca solo l'audio, resta la risposta
   * scritta: la voce si chiude senza errore.
   */
  private interrompi(tipo: "annullata" | "tempo", dettaglio: string): void {
    const id = this.idTurno;
    if (id === null || this.statoFase !== "pensa") return;
    this.sessione += 1;
    this.dip.assistente.interrompi(id, tipo, dettaglio);
    if (this.turno?.fase !== "errore") this.finito();
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Voce: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

/** L'audio della memoria in pezzi come quelli del microfono (1024 campioni). */
function aPezzi(pcm: Int16Array): ArrayBuffer[] {
  const pezzi: ArrayBuffer[] = [];
  for (let i = 0; i < pcm.length; i += CAMPIONI_PER_PEZZO)
    pezzi.push(pcm.slice(i, i + CAMPIONI_PER_PEZZO).buffer);
  return pezzi;
}
