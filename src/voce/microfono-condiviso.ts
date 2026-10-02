import { descriviErrore, log } from "../diagnostica";
import { Ricampionatore } from "./ricampiona";
import { Microfono, type Ascoltatori, type Elaborazione } from "./microfono";

/**
 * Un solo microfono per tutto il pannello (v0.5.0). Con «Jarvis» sempre in
 * ascolto il microfono resta aperto, e la domanda a voce prende l'audio dallo
 * stesso flusso: niente secondo getUserMedia, niente buco tra la parola e la
 * domanda. Tutto esce a 16 kHz (si ricampiona se il browser non li concede),
 * quindi a HA si dichiara sempre 16000.
 */
const FREQUENZA = 16000;

/** Quello che la voce usa del microfono: la classe Microfono va bene, e anche la faccia condivisa. */
export interface SorgenteMicrofono {
  readonly attivo: boolean;
  /** Apre (o si aggancia al microfono già aperto). Ritorna la frequenza da dichiarare a HA. */
  avvia(ascolta: Ascoltatori): Promise<number>;
  ferma(): void;
}

interface AscoltatoreContinuo {
  pezzo: (pcm: Int16Array) => void;
  /** Il sistema ha chiuso il microfono (Android in secondo piano, schermo spento). */
  interrotto: () => void;
}

const CHIAVE_ELABORAZIONE = "jarvis-microfono";
/** Di serie (v0.5.1): solo la cancellazione dell'eco, niente riduzione del rumore né guadagno automatico. */
const ELABORAZIONE_DI_SERIE: Elaborazione = "solo-eco";

export function leggiElaborazione(grezzo: string | null): Elaborazione {
  if (grezzo === null) return ELABORAZIONE_DI_SERIE;
  try {
    const e = (JSON.parse(grezzo) as { elaborazione?: unknown }).elaborazione;
    return e === "tutta" || e === "solo-eco" || e === "nessuna" ? e : ELABORAZIONE_DI_SERIE;
  } catch (errore) {
    log.avviso(`Microfono: impostazione illeggibile (${descriviErrore(errore)}): uso quella di serie`);
    return ELABORAZIONE_DI_SERIE;
  }
}

export class MicrofonoCondiviso {
  private ricampiona = new Ricampionatore(FREQUENZA);
  private elaborazioneAttuale: Elaborazione = ELABORAZIONE_DI_SERIE;
  private continuo: AscoltatoreContinuo | null = null;
  private voce: Ascoltatori | null = null;
  private apertura: Promise<void> | null = null;

  constructor(private readonly microfono: Pick<Microfono, "attivo" | "avvia" | "ferma"> = new Microfono()) {
    try {
      this.elaborazioneAttuale = leggiElaborazione(localStorage.getItem(CHIAVE_ELABORAZIONE));
    } catch (errore) {
      log.avviso(`Microfono: impostazione non letta (${descriviErrore(errore)}): uso quella di serie`);
    }
  }

  get elaborazione(): Elaborazione {
    return this.elaborazioneAttuale;
  }

  /** Impostazioni → Voce: se il microfono è aperto lo si riapre con la scelta nuova. */
  async impostaElaborazione(e: Elaborazione): Promise<void> {
    this.elaborazioneAttuale = e;
    try {
      localStorage.setItem(CHIAVE_ELABORAZIONE, JSON.stringify({ elaborazione: e }));
    } catch (errore) {
      log.avviso(`Microfono: impostazione non salvata (${descriviErrore(errore)}): vale fino alla ricarica`);
    }
    log.info(`Microfono: elaborazione «${e}»`);
    if (!this.microfono.attivo) return;
    this.microfono.ferma();
    await this.apri();
  }

  /** Livello del microfono adesso (0..1), per l'indicatore dal vivo delle impostazioni. */
  get livello(): number {
    return this.microfono.attivo ? this.livelloAttuale : 0;
  }
  private livelloAttuale = 0;

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
        const frequenza = await this.microfono.avvia(
          {
            pezzo: (grezzo) => this.suPezzo(new Int16Array(grezzo)),
            livello: (l) => {
              this.livelloAttuale = l;
              this.voce?.livello(l);
            },
            interrotto: () => this.suInterrotto(),
          },
          this.elaborazioneAttuale,
        );
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
