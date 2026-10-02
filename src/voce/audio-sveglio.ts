import { descriviErrore, log } from "../diagnostica";

/**
 * Audio "sveglio" per l'altoparlante Bluetooth (v0.4.5). Il tablet della
 * cucina esce dall'Echo Pop in Bluetooth: se il tablet tace per un po',
 * all'audio successivo l'Echo annuncia "In riproduzione da Tab90" sopra
 * l'inizio della risposta (sessione server, 30/09). Qui si fa suonare di
 * continuo un rumore a -80 dB (ampiezza 1/10000): non si sente, ma il
 * collegamento audio resta attivo e l'Echo non lo annuncia più.
 *
 * - Acceso di serie, spegnibile dalla diagnostica (deciso da Salvatore, 30/09).
 * - Contesto audio SUO: non tocca il microfono (getUserMedia) né la voce di
 *   Jarvis (elemento <audio>), che hanno i loro.
 * - Chrome lo lascia partire solo dopo un tocco: si prova subito e poi al
 *   primo tocco. Se il sistema lo sospende (chiamata, altra app) lo si annota
 *   nel log e si riprende al tocco successivo.
 */
export const CHIAVE = "jarvis-audio-sveglio";
/** -80 dB rispetto al massimo. */
const AMPIEZZA = 10 ** (-80 / 20);

export type StatoAudioSveglio = "spento" | "attesa-tocco" | "attivo" | "sospeso" | "non-disponibile";

/** Letto una volta: "0" = spento; qualunque altra cosa (o niente) = acceso. */
function accesoNelleImpostazioni(): boolean {
  try {
    return localStorage.getItem(CHIAVE) !== "0";
  } catch (errore) {
    log.avviso(`Impostazione dell'audio sveglio illeggibile, resta acceso: ${descriviErrore(errore)}`);
    return true;
  }
}

class AudioSveglio {
  private contesto: AudioContext | null = null;
  private sorgente: AudioBufferSourceNode | null = null;
  private acceso = true;
  private sospesoDalSistema = false;
  private guasto = false;
  private readonly ascoltatori = new Set<() => void>();

  get stato(): StatoAudioSveglio {
    if (!this.acceso) return "spento";
    if (this.guasto) return "non-disponibile";
    if (this.contesto?.state === "running" && this.sorgente) return "attivo";
    return this.sospesoDalSistema ? "sospeso" : "attesa-tocco";
  }

  get attivo(): boolean {
    return this.acceso;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Da main.ts, una volta. */
  avvia(): void {
    this.acceso = accesoNelleImpostazioni();
    const tocco = (): void => {
      if (this.acceso && this.stato !== "attivo") this.accendi();
    };
    document.addEventListener("pointerdown", tocco, { capture: true, passive: true });
    document.addEventListener("keydown", tocco, { capture: true, passive: true });
    if (this.acceso) this.accendi();
    else log.info("Audio sveglio spento dalla diagnostica");
  }

  /** Interruttore della diagnostica: vale anche dopo le ricariche. */
  imposta(acceso: boolean): void {
    this.acceso = acceso;
    try {
      localStorage.setItem(CHIAVE, acceso ? "1" : "0");
    } catch (errore) {
      log.avviso(`Impostazione dell'audio sveglio non salvata: ${descriviErrore(errore)}`);
    }
    log.info(`Audio sveglio ${acceso ? "acceso" : "spento"} dalla diagnostica`);
    if (acceso) this.accendi();
    else this.spegni();
    this.notifica();
  }

  private accendi(): void {
    try {
      if (!this.contesto) {
        const c = new AudioContext();
        this.contesto = c;
        c.addEventListener("statechange", () => this.suStato(c));
      }
      const c = this.contesto;
      if (!this.sorgente) {
        // 2 s di rumore bianco a -80 dB, in loop: un tono fisso potrebbe essere
        // "ottimizzato via" o fischiare su qualche altoparlante
        const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const dati = buffer.getChannelData(0);
        for (let i = 0; i < dati.length; i++) dati[i] = (Math.random() * 2 - 1) * AMPIEZZA;
        const s = c.createBufferSource();
        s.buffer = buffer;
        s.loop = true;
        s.connect(c.destination);
        s.start();
        this.sorgente = s;
      }
      if (c.state !== "running")
        c.resume().catch((errore: unknown) => {
          log.avviso(`Audio sveglio non partito: ${descriviErrore(errore)}`);
        });
    } catch (errore) {
      this.guasto = true;
      log.avviso(`Audio sveglio non disponibile: ${descriviErrore(errore)}`);
    }
    this.notifica();
  }

  private spegni(): void {
    try {
      this.sorgente?.stop();
    } catch (errore) {
      log.avviso(`Audio sveglio: arresto non riuscito: ${descriviErrore(errore)}`);
    }
    this.sorgente?.disconnect();
    this.sorgente = null;
    // il contesto si sospende e non si chiude: riaccendere non chiede un altro tocco
    this.contesto?.suspend().catch((errore: unknown) => {
      log.avviso(`Audio sveglio: sospensione non riuscita: ${descriviErrore(errore)}`);
    });
  }

  private suStato(c: AudioContext): void {
    const stato: string = c.state;
    if (stato === "running") {
      if (this.sospesoDalSistema) log.info("Audio sveglio ripreso");
      else log.info("Audio sveglio attivo: il collegamento Bluetooth resta aperto");
      this.sospesoDalSistema = false;
    } else if (this.acceso && this.sorgente) {
      // sospeso o "interrupted" (chiamata, altra app): non l'abbiamo chiesto noi
      this.sospesoDalSistema = true;
      log.avviso(`Audio sveglio sospeso dal sistema (${stato}): riprende al prossimo tocco`);
    }
    this.notifica();
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Audio sveglio: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

export const audioSveglio = new AudioSveglio();
