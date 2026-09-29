import { descriviErrore, log } from "../diagnostica/log";

/**
 * Microfono: PCM 16 bit mono, 16 kHz se il browser lo concede, a pezzi da
 * 1024 campioni (64 ms a 16 kHz), più il livello (0..1) per l'anello a schermo.
 *
 *  - Il ritmo lo dà l'AudioWorklet, mai un `setTimeout`: nelle schede in
 *    secondo piano i timer vengono rallentati e l'audio arriverebbe a scatti.
 *  - Il worklet è una stringa caricata da un Blob URL: il build resta un solo
 *    file JS (scripts/dopo-build.mjs lo controlla).
 *  - Se il browser non accetta un AudioContext a 16 kHz si usa la sua
 *    frequenza e la si dichiara a HA, che ricampiona da solo (audioop.ratecv).
 */

export const CAMPIONI_PER_PEZZO = 1024;
const FREQUENZA_VOLUTA = 16_000;
const NOME_PROCESSORE = "jarvis-cattura";

const SORGENTE_WORKLET = `
class Cattura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pezzo = new Int16Array(${CAMPIONI_PER_PEZZO});
    this.n = 0;
    this.somma = 0;
  }
  process(ingressi) {
    const canale = ingressi[0] && ingressi[0][0];
    if (!canale) return true;
    for (let i = 0; i < canale.length; i++) {
      const s = Math.max(-1, Math.min(1, canale[i]));
      this.somma += s * s;
      this.pezzo[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.pezzo.length) {
        const livello = Math.min(1, Math.sqrt(this.somma / this.n) * 4);
        this.port.postMessage({ pcm: this.pezzo.buffer, livello }, [this.pezzo.buffer]);
        this.pezzo = new Int16Array(${CAMPIONI_PER_PEZZO});
        this.n = 0;
        this.somma = 0;
      }
    }
    return true;
  }
}
registerProcessor("${NOME_PROCESSORE}", Cattura);
`;

/** Il microfono non si può usare qui (manca HTTPS): niente getUserMedia. */
export class MicrofonoNonDisponibile extends Error {
  override name = "MicrofonoNonDisponibile";
}

export interface Ascoltatori {
  pezzo: (pcm: ArrayBuffer) => void;
  livello: (livello: number) => void;
}

export class Microfono {
  private flusso: MediaStream | null = null;
  private contesto: AudioContext | null = null;
  private nodo: AudioWorkletNode | null = null;

  /** Il browser permette il microfono su questo indirizzo (HTTPS o localhost). */
  static disponibile(): boolean {
    return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function";
  }

  get attivo(): boolean {
    return this.flusso !== null;
  }

  /** Apre il microfono. Ritorna la frequenza vera da dichiarare a HA. */
  async avvia(ascolta: Ascoltatori): Promise<number> {
    if (!Microfono.disponibile()) throw new MicrofonoNonDisponibile("Serve un indirizzo sicuro (HTTPS)");
    this.ferma();
    const flusso = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.flusso = flusso;
    try {
      let contesto: AudioContext;
      try {
        contesto = new AudioContext({ sampleRate: FREQUENZA_VOLUTA });
      } catch (errore) {
        // alcuni browser non accettano la frequenza: HA ricampiona
        log.info(`Microfono: 16 kHz non accettati (${descriviErrore(errore)}), uso la frequenza del browser`);
        contesto = new AudioContext();
      }
      this.contesto = contesto;
      await contesto.resume();
      const url = URL.createObjectURL(new Blob([SORGENTE_WORKLET], { type: "application/javascript" }));
      try {
        await contesto.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const nodo = new AudioWorkletNode(contesto, NOME_PROCESSORE, { numberOfOutputs: 1 });
      nodo.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; livello: number }>) => {
        ascolta.pezzo(e.data.pcm);
        ascolta.livello(e.data.livello);
      };
      // Un nodo non collegato all'uscita può non essere elaborato: si collega a
      // un guadagno zero, che non fa uscire nessun suono.
      const muto = contesto.createGain();
      muto.gain.value = 0;
      contesto.createMediaStreamSource(flusso).connect(nodo);
      nodo.connect(muto).connect(contesto.destination);
      this.nodo = nodo;
      return contesto.sampleRate;
    } catch (errore) {
      this.ferma();
      throw errore;
    }
  }

  /** Chiude tutto: tracce (spegne l'indicatore del microfono), nodo e contesto. */
  ferma(): void {
    if (this.nodo) {
      this.nodo.port.onmessage = null;
      this.nodo.disconnect();
      this.nodo = null;
    }
    for (const traccia of this.flusso?.getTracks() ?? []) traccia.stop();
    this.flusso = null;
    const contesto = this.contesto;
    this.contesto = null;
    if (contesto && contesto.state !== "closed")
      contesto.close().catch((errore: unknown) => {
        log.avviso(`Microfono: chiusura dell'audio non riuscita: ${descriviErrore(errore)}`);
      });
  }
}
