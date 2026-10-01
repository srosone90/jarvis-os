import { descriviErrore, log } from "../diagnostica/log";
import { Ricampionatore } from "../parola/ricampiona";
import { Microfono, type Ascoltatori } from "./microfono";

/**
 * Un solo microfono per tutto il pannello (v0.5.0). Con «Jarvis» sempre in
 * ascolto il microfono resta aperto, e la domanda a voce prende l'audio dallo
 * stesso flusso: niente secondo getUserMedia, niente buco tra la parola e la
 * domanda. Tutto esce a 16 kHz (si ricampiona se il browser non li concede),
 * quindi a HA si dichiara sempre 16000.
 */
export const FREQUENZA = 16000;

/** Quello che la voce usa del microfono: la classe Microfono va bene, e anche la faccia condivisa. */
export interface SorgenteMicrofono {
  readonly attivo: boolean;
  /** Apre (o si aggancia al microfono già aperto). Ritorna la frequenza da dichiarare a HA. */
  avvia(ascolta: Ascoltatori): Promise<number>;
  ferma(): void;
}

export interface AscoltatoreContinuo {
  pezzo: (pcm: Int16Array) => void;
  /** Il sistema ha chiuso il microfono (Android in secondo piano, schermo spento). */
  interrotto: () => void;
}

export class MicrofonoCondiviso {
  private ricampiona = new Ricampionatore(FREQUENZA);
  private continuo: AscoltatoreContinuo | null = null;
  private voce: Ascoltatori | null = null;
  private apertura: Promise<void> | null = null;

  constructor(private readonly microfono: Pick<Microfono, "attivo" | "avvia" | "ferma"> = new Microfono()) {}

  get aperto(): boolean {
    return this.microfono.attivo;
  }
  /** L'ascolto continuo è agganciato (l'indicatore del microfono va mostrato). */
  get inAscoltoContinuo(): boolean {
    return this.continuo !== null && this.microfono.attivo;
  }

  /** Ascolto continuo della parola: apre il microfono se serve. */
  async apriContinuo(ascoltatore: AscoltatoreContinuo): Promise<void> {
    this.continuo = ascoltatore;
    try {
      await this.apri();
    } catch (errore) {
      this.continuo = null;
      throw errore;
    }
  }

  chiudiContinuo(): void {
    this.continuo = null;
    if (!this.voce) this.chiudi();
  }

  /** La faccia per la voce: si aggancia al microfono aperto, o lo apre per la sola domanda. */
  perVoce(): SorgenteMicrofono {
    const attivo = (): boolean => this.voce !== null && this.microfono.attivo;
    return {
      get attivo() {
        return attivo();
      },
      avvia: async (ascolta: Ascoltatori): Promise<number> => {
        this.voce = ascolta;
        try {
          await this.apri();
        } catch (errore) {
          this.voce = null;
          throw errore;
        }
        return FREQUENZA;
      },
      ferma: (): void => {
        this.voce = null;
        // con l'ascolto continuo il microfono resta aperto: si smette solo di mandare
        if (!this.continuo) this.chiudi();
      },
    };
  }

  private async apri(): Promise<void> {
    if (this.microfono.attivo) return;
    // due richieste insieme (parola e voce): un solo getUserMedia
    this.apertura ??= (async () => {
      try {
        const frequenza = await this.microfono.avvia({
          pezzo: (grezzo) => this.suPezzo(new Int16Array(grezzo)),
          livello: (l) => this.voce?.livello(l),
          interrotto: () => this.suInterrotto(),
        });
        this.ricampiona = new Ricampionatore(frequenza);
        if (this.ricampiona.serve)
          log.info(`Microfono aperto a ${frequenza} Hz: ricampiono a ${FREQUENZA} per Jarvis e per HA`);
      } finally {
        this.apertura = null;
      }
    })();
    await this.apertura;
  }

  private chiudi(): void {
    if (this.microfono.attivo) this.microfono.ferma();
  }

  private suPezzo(grezzo: Int16Array): void {
    const pcm = this.ricampiona.a16k(grezzo);
    if (pcm.length === 0) return;
    const continuo = this.continuo;
    const voce = this.voce;
    try {
      continuo?.pezzo(pcm);
    } catch (errore) {
      log.errore(`Microfono: ascolto della parola in errore: ${descriviErrore(errore)}`);
    }
    // la voce manda il buffer sul WebSocket: una copia sua (la memoria della parola tiene l'originale)
    if (voce) voce.pezzo(pcm.slice().buffer);
  }

  private suInterrotto(): void {
    log.avviso("Microfono chiuso dal sistema (pagina in secondo piano o schermo spento?)");
    this.microfono.ferma();
    const continuo = this.continuo;
    const voce = this.voce;
    continuo?.interrotto();
    voce?.interrotto?.();
  }
}
