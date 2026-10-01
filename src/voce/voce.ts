import type { Assistente, OpzioniParla } from "../assistente/assistente";
import type { Turno } from "../assistente/eventi";
import { messaggioMicrofono, problemaDaErrore, type MessaggioMicrofono } from "../assistente/messaggi";
import { descriviErrore, log } from "../diagnostica/log";
import { Bip, Riproduttore } from "./audio";
import { CAMPIONI_PER_PEZZO, Microfono, MicrofonoNonDisponibile } from "./microfono";
import type { SorgenteMicrofono } from "./microfono-condiviso";

/**
 * Voce "tocca per parlare" (F5). Una faccia del motore dell'assistente: la
 * domanda e la risposta sono turni come quelli scritti, e finiscono nella chat.
 *
 * Flusso: tocco → bip → microfono → assist_pipeline/run da stt a tts. L'audio
 * va a HA appena HA dà l'id (prima si tiene da parte). HA chiude l'ascolto da
 * solo dopo 0,7 s di silenzio (VAD); il tocco su "ferma" lo chiude prima.
 * L'audio della risposta parte SUBITO a tts-end (o tts-start in streaming),
 * mai aspettando run-end: per le risposte locali HA non chiude la pipeline
 * finché qualcuno non consuma l'audio. Se HA vuole un seguito
 * (continue_conversation), finito l'audio il microfono si riapre da solo.
 */
export type FaseVoce = "spenta" | "apertura" | "ascolto" | "pensa" | "risponde" | "errore";
/** Dove si vede la voce: nella chat, nel riquadro piccolo o nell'Hub (fase G). */
export type DoveVoce = "chat" | "riquadro" | "hub";

/** Rete di sicurezza: HA chiude l'ascolto al massimo dopo 15 s (vad.py); noi dopo 20. */
export const ASCOLTO_MASSIMO_MS = 20_000;
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
/** Il riquadro resta in vista così a lungo dopo la risposta, poi sparisce. */
export const RIQUADRO_DOPO_MS = 6_000;
/** Audio tenuto da parte prima che HA dia l'id: al massimo ~10 s. */
const CODA_MASSIMA = 160;

/** Domanda nata dalla parola «Jarvis» (v0.5.0). */
export interface OpzioniVoce extends OpzioniParla {
  /**
   * Audio di poco prima dello scatto (la memoria circolare, ~1 s, 16 kHz):
   * va a HA per primo, così la parola e l'inizio della frase non si perdono.
   */
  preroll?: Int16Array;
}

export interface DipendenzeVoce {
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
    clearTimeout(this.timerRiquadro);
    this.luogo = dove;
    this.riquadro = dove === "riquadro";
    this.problemaMic = null;
    this.seguito = seguito;
    this.daParola = opzioni.parola !== undefined;
    if (!seguito) this.idTurno = null;
    if (!this.dip.collegato() || this.dip.assistente.occupato) {
      this.imposta("spenta");
      return;
    }
    const sessione = ++this.sessione;
    this.imposta("apertura");
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
    const { preroll, ...perAssistente } = opzioni;
    const id = this.dip.assistente.parla(frequenza, perAssistente);
    if (id === null) {
      // HA perso mentre il microfono si apriva
      this.microfono.ferma();
      this.imposta("spenta");
      return;
    }
    this.idTurno = id;
    // prima l'audio della parola, poi quello dal vivo (tenuti da parte fino all'id di HA)
    this.coda = preroll ? aPezzi(preroll) : [];
    this.riproduzioneAvviata = false;
    this.bip.suona("apri");
    this.timerAscolto = setTimeout(() => {
      log.avviso("Voce: ascolto oltre il tempo massimo, lo chiudo");
      this.chiudiMicrofono();
    }, ASCOLTO_MASSIMO_MS);
    this.imposta("ascolto");
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
        // HA riceve la fine dell'audio e risponde a quello che ha sentito
        this.chiudiMicrofono();
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
    const id = this.idTurno;
    if (id === null || this.statoFase !== "ascolto") return;
    const t = this.dip.assistente.turno(id);
    if (t?.idAudio == null) {
      // HA non ha ancora dato l'id (run-start): si tiene da parte
      if (this.coda.length < CODA_MASSIMA) this.coda.push(pcm);
      return;
    }
    for (const vecchio of this.coda.splice(0)) this.dip.assistente.inviaAudio(id, vecchio);
    this.dip.assistente.inviaAudio(id, pcm);
  }

  private chiudiMicrofono(): void {
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
    if (!t || this.statoFase === "spenta" || this.statoFase === "apertura") return;
    if (this.statoFase === "ascolto" && (t.fineParlato || t.fase !== "ascolto")) this.chiudiMicrofono();
    if (t.fase === "errore") {
      this.chiudiMicrofono();
      this.riproduttore.ferma();
      if (t.errore?.tipo === "doppione") {
        // un altro pannello ha sentito la stessa «Jarvis» e risponde lui: qui niente
        log.info("Voce: «Jarvis» sentito anche da un altro pannello, risponde lui");
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
        this.dip.assistente.scarta(t.id);
        this.idTurno = null;
        this.finito();
        return;
      }
      if (this.statoFase !== "errore") this.imposta("errore");
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

  private async rispondi(url: string): Promise<void> {
    const sessione = this.sessione;
    this.imposta("risponde");
    const esito = await this.riproduttore.riproduci(new URL(url, location.href).href);
    if (sessione !== this.sessione || this.statoFase !== "risponde") return;
    // seguito come un Echo: solo se l'audio è finito da solo (non interrotto) e HA lo chiede
    if (esito === "finito" && this.turno?.continua && this.dip.collegato()) {
      this.imposta("spenta");
      await this.parla(this.luogo, true);
      return;
    }
    this.finito();
  }

  private finito(): void {
    this.imposta("spenta");
    if (this.riquadro) {
      clearTimeout(this.timerRiquadro);
      this.timerRiquadro = setTimeout(() => this.nascondiRiquadro(), RIQUADRO_DOPO_MS);
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
