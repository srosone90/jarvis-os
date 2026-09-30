import { descriviErrore, log } from "../diagnostica/log";
import type { Suona } from "./timer";

/** Ogni quanto si ripete il motivo (tre note). */
const RIPETI_OGNI_MS = 1600;
/** Forte ma non stridente: deve sentirsi dall'altra stanza, anche dall'Echo in Bluetooth. */
const VOLUME = 0.35;

/**
 * Suoneria dei timer con WebAudio: niente file da scaricare, quindi funziona
 * anche offline. Esce dall'uscita audio in uso (Echo in Bluetooth, se c'è).
 *
 * Chrome non lascia suonare una pagina che non è mai stata toccata (autoplay):
 * il contesto audio si prepara al primo tocco sullo schermo, e se al momento
 * della suoneria è ancora bloccato lo si dice nel log e si riprova al primo
 * tocco. Il pannello a muro di solito è già stato toccato.
 */
export class Suoneria implements Suona {
  private contesto: AudioContext | null = null;
  private ripeti: ReturnType<typeof setInterval> | undefined;
  private avvisato = false;

  constructor() {
    const sblocca = (): void => {
      this.prepara();
      if (this.contesto?.state === "running") {
        document.removeEventListener("pointerdown", sblocca, true);
        document.removeEventListener("keydown", sblocca, true);
      }
    };
    document.addEventListener("pointerdown", sblocca, { capture: true, passive: true });
    document.addEventListener("keydown", sblocca, { capture: true, passive: true });
  }

  get suona(): boolean {
    return this.ripeti !== undefined;
  }

  avvia(): void {
    if (this.ripeti !== undefined) return;
    this.prepara();
    this.motivo();
    this.ripeti = setInterval(() => this.motivo(), RIPETI_OGNI_MS);
  }

  ferma(): void {
    clearInterval(this.ripeti);
    this.ripeti = undefined;
  }

  private prepara(): void {
    try {
      this.contesto ??= new AudioContext();
      if (this.contesto.state === "suspended")
        this.contesto.resume().catch((errore: unknown) => {
          log.avviso(`Suoneria: audio non sbloccato: ${descriviErrore(errore)}`);
        });
    } catch (errore) {
      log.avviso(`Suoneria: audio non disponibile: ${descriviErrore(errore)}`);
    }
  }

  /** Tre note brevi a salire. */
  private motivo(): void {
    const c = this.contesto;
    if (!c) return;
    if (c.state !== "running") {
      if (!this.avvisato)
        log.avviso(
          "Suoneria bloccata dal browser (pannello mai toccato da quando si è aperto): suona al primo tocco",
        );
      this.avvisato = true;
      // il blocco è già nel log (una volta sola): qui si riprova e basta
      void c.resume().catch(() => undefined);
      return;
    }
    try {
      const t = c.currentTime + 0.02;
      [880, 1175, 1568].forEach((frequenza, i) => {
        const inizio = t + i * 0.22;
        const osc = c.createOscillator();
        const vol = c.createGain();
        osc.type = "triangle";
        osc.frequency.value = frequenza;
        vol.gain.setValueAtTime(0.0001, inizio);
        vol.gain.exponentialRampToValueAtTime(VOLUME, inizio + 0.02);
        vol.gain.exponentialRampToValueAtTime(0.0001, inizio + 0.18);
        osc.connect(vol).connect(c.destination);
        osc.start(inizio);
        osc.stop(inizio + 0.2);
      });
    } catch (errore) {
      log.avviso(`Suoneria: nota non riprodotta: ${descriviErrore(errore)}`);
    }
  }
}
