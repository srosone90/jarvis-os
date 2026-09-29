import type { Assistente } from "../assistente/assistente";
import type { Turno } from "../assistente/eventi";
import { messaggioMicrofono, problemaDaErrore, type MessaggioMicrofono } from "../assistente/messaggi";
import { descriviErrore, log } from "../diagnostica/log";
import { Bip, Riproduttore } from "./audio";
import { Microfono, MicrofonoNonDisponibile } from "./microfono";

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
export type DoveVoce = "chat" | "riquadro";

/** Rete di sicurezza: HA chiude l'ascolto al massimo dopo 15 s (vad.py); noi dopo 20. */
export const ASCOLTO_MASSIMO_MS = 20_000;
/** Il riquadro resta in vista così a lungo dopo la risposta, poi sparisce. */
export const RIQUADRO_DOPO_MS = 6_000;
/** Audio tenuto da parte prima che HA dia l'id: al massimo ~10 s. */
const CODA_MASSIMA = 160;

export interface DipendenzeVoce {
  assistente: Assistente;
  collegato: () => boolean;
  microfono?: Microfono;
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
  private riproduzioneAvviata = false;
  private coda: ArrayBuffer[] = [];
  private timerAscolto: ReturnType<typeof setTimeout> | undefined;
  private timerRiquadro: ReturnType<typeof setTimeout> | undefined;
  private readonly microfono: Microfono;
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

  /** Tocco sul microfono. */
  async parla(dove: DoveVoce, seguito = false): Promise<void> {
    if (this.statoFase !== "spenta" && this.statoFase !== "errore") return;
    clearTimeout(this.timerRiquadro);
    this.luogo = dove;
    this.riquadro = dove === "riquadro";
    this.problemaMic = null;
    this.seguito = seguito;
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
    const id = this.dip.assistente.parla(frequenza);
    if (id === null) {
      // HA perso mentre il microfono si apriva
      this.microfono.ferma();
      this.imposta("spenta");
      return;
    }
    this.idTurno = id;
    this.coda = [];
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
      if (this.seguito && t.errore?.tipo === "nonSentito" && !t.domanda) {
        // seguito senza risposta: come un Echo, si chiude in silenzio
        this.dip.assistente.scarta(t.id);
        this.idTurno = null;
        this.finito();
        return;
      }
      if (this.statoFase !== "errore") this.imposta("errore");
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
    this.statoFase = fase;
    this.notifica();
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
