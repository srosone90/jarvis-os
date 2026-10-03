import { descriviErrore, log } from "../diagnostica";
import { grigioPiccolo, Movimento } from "./movimento";
import {
  caricaPreferenzeFotocamera,
  fuoriOrario,
  PREFERENZE_FOTOCAMERA_DI_SERIE,
  salvaPreferenzeFotocamera,
  leggiPreferenzeFotocamera,
  SOGLIA_VOLTO,
  type PreferenzeFotocamera,
} from "./preferenze";
import { distanza, volti, type Volto } from "./volto";
import { virgola } from "../comune";

/**
 * Presenza dalla fotocamera frontale (v0.6.0, punto 7 del piano; v0.6.5).
 *
 * Chi si avvicina (entro `distanza`) dopo almeno un minuto di assenza
 * "arriva":
 * - con «Sveglia schermo con presenza» (`presenza`) il pannello a riposo si
 *   riaccende (`alArrivo`; se è già acceso non succede niente);
 * - con `avvisaCasa`, al massimo una volta ogni 5 minuti, manda
 *   `jarvis_presenza {pannello}` (via `script.jarvis_presenza`), per il
 *   buongiorno lato server.
 *
 * Nient'altro (v0.6.5, richiesta di Salvatore del 03/10): la fotocamera NON
 * tocca «Jarvis». Niente soglia più bassa con qualcuno vicino, niente «guarda
 * e parla»: l'attivazione a voce è la stessa con la fotocamera coperta, e
 * muoversi in silenzio davanti al tablet non fa partire l'ascolto.
 *
 * Le immagini restano in memoria per il solo fotogramma in corso: niente si
 * salva, niente esce dal tablet. Il modello del volto gira solo quando
 * qualcosa si muove, quando qualcuno è già lì, e comunque ogni 2 s.
 */

export interface Fotogramma {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
}

/** La fotocamera vera (src/fotocamera/occhio.ts), o una finta nelle prove. */
export interface Occhio {
  apri(fps: number): Promise<void>;
  chiudi(): void;
  /** Il fotogramma di adesso, 320×240; null se non c'è ancora. */
  fotogramma(): Fotogramma | null;
  readonly aperto: boolean;
}

export interface MotoreVolto {
  rileva(
    rgba: Uint8ClampedArray,
  ): Promise<{ scores: ArrayLike<number>; boxes: ArrayLike<number>; ms: number }>;
}

interface DipendenzePresenza {
  occhio: Occhio;
  caricaMotore: () => Promise<MotoreVolto>;
  /** `script.jarvis_presenza {pannello}`. */
  invia: (pannello: string) => Promise<void>;
  /** device_id di questo pannello; null senza stanza (niente evento). */
  pannello: () => string | null;
  adesso?: () => number;
  ora?: () => Date;
  archivio?: Pick<Storage, "getItem" | "setItem"> | null;
}

/** Senza nessuno vicino per tanto, chi arriva "arriva" di nuovo. */
export const ASSENZA_MS = 60_000;
/** Al massimo un evento jarvis_presenza ogni tanto (punto 7.2). */
export const INVIO_OGNI_MS = 5 * 60_000;
/** Il modello del volto gira comunque almeno così spesso (una persona ferma non si muove). */
const MODELLO_ALMENO_OGNI_MS = 2000;
/** Movimento che fa girare subito il modello: frazione dei punti cambiati. */
const MOVIMENTO_MINIMO = 0.02;
/** Con qualcuno visto negli ultimi 10 s il modello del volto gira a ogni fotogramma. */
const VICINO_VALE_MS = 10_000;
/** Ogni quanto il carico va nel registro. */
const CARICO_OGNI_MS = 10 * 60_000;
/** Controllo dell'orario (spenta di notte) e dei tentativi dopo un errore. */
export const CONTROLLO_OGNI_MS = 60_000;

const CHIAVE_FOTOCAMERA = "jarvis-fotocamera";

export type StatoFotocamera = "spenta" | "notte" | "apertura" | "attiva" | "errore";

export class Presenza {
  private pref: PreferenzeFotocamera;
  private statoFoto: StatoFotocamera = "spenta";
  private problemaFoto: string | null = null;
  private avviata = false;
  private motore: MotoreVolto | null = null;
  private caricamento: Promise<MotoreVolto> | null = null;
  private occupato = false;
  private readonly movimento = new Movimento();
  private ultimoModello = -Infinity;
  private ultimoVicino = -Infinity;
  private ultimoInvio = -Infinity;
  private ultimoVolto: (Volto & { metri: number }) | null = null;
  private timerFoto: ReturnType<typeof setTimeout> | undefined;
  private timerControllo: ReturnType<typeof setInterval> | undefined;
  private carico = { da: 0, fotogrammi: 0, modello: 0, ms: 0, volti: 0, arrivi: 0 };
  private readonly adesso: () => number;
  private readonly ora: () => Date;
  private readonly ascoltatori = new Set<() => void>();
  /** Qualcuno è arrivato e «Sveglia schermo con presenza» è accesa: l'interfaccia riaccende lo schermo, se dorme. */
  alArrivo: () => void = () => undefined;

  constructor(private readonly dip: DipendenzePresenza) {
    this.adesso = dip.adesso ?? Date.now;
    this.ora = dip.ora ?? (() => new Date(this.adesso()));
    this.pref =
      dip.archivio === undefined
        ? caricaPreferenzeFotocamera()
        : leggiPreferenzeFotocamera(dip.archivio?.getItem(CHIAVE_FOTOCAMERA) ?? null);
  }

  get preferenze(): PreferenzeFotocamera {
    return { ...this.pref };
  }
  get stato(): StatoFotocamera {
    return this.statoFoto;
  }
  /** Perché la fotocamera non lavora, in parole. */
  get problema(): string | null {
    return this.problemaFoto;
  }
  /** La fotocamera sta guardando adesso (la spia è accesa). */
  get attiva(): boolean {
    return this.statoFoto === "attiva";
  }
  /** L'ultimo volto visto (per la diagnostica: punteggio e distanza stimata). */
  get volto(): (Volto & { metri: number }) | null {
    return this.ultimoVolto;
  }
  /** Serve la fotocamera? (una delle due funzioni accesa) */
  private get serve(): boolean {
    return this.pref.presenza || this.pref.avvisaCasa;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Una volta, all'avvio del pannello. */
  avvia(): void {
    if (this.avviata) return;
    this.avviata = true;
    this.carico.da = this.adesso();
    this.timerControllo = setInterval(() => void this.controlla(), CONTROLLO_OGNI_MS);
    void this.controlla();
  }

  ferma(): void {
    this.avviata = false;
    clearInterval(this.timerControllo);
    this.chiudi("spenta", "fermata");
  }

  /** Impostazioni → Fotocamera; `null` = valore di serie. */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeFotocamera]?: PreferenzeFotocamera[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi)) {
      if (v === undefined) continue;
      unito[k] = v === null ? PREFERENZE_FOTOCAMERA_DI_SERIE[k as keyof PreferenzeFotocamera] : v;
    }
    const prima = this.pref;
    this.pref = leggiPreferenzeFotocamera(JSON.stringify(unito));
    if (this.dip.archivio === undefined) salvaPreferenzeFotocamera(this.pref);
    else this.dip.archivio?.setItem(CHIAVE_FOTOCAMERA, JSON.stringify(this.pref));
    const p = this.pref;
    log.info(
      `Fotocamera: sveglia schermo ${p.presenza ? `sì (si rispegne dopo ${p.secondiSveglia} s)` : "no"}, ` +
        `avvisa Home Assistant ${p.avvisaCasa ? "sì" : "no"}, entro ${p.distanza} m, sensibilità ${p.sensibilita}, ` +
        `${p.fps} fotogrammi/s, spenta ${p.spentaDa}-${p.spentaA}`,
    );
    // fps cambiati: si riapre; un errore di prima si riprova subito
    if (this.occhioAperto() && prima.fps !== p.fps) this.chiudi("spenta", "fotogrammi al secondo cambiati");
    if (this.statoFoto === "errore") this.statoFoto = "spenta";
    void this.controlla();
    this.notifica();
  }

  private occhioAperto(): boolean {
    return this.dip.occhio.aperto;
  }

  /** Accende o spegne la fotocamera secondo preferenze e orario. */
  private async controlla(): Promise<void> {
    this.scriviCarico();
    if (!this.avviata) return;
    if (!this.serve) return this.chiudi("spenta", "spenta nelle impostazioni");
    if (fuoriOrario(this.ora(), this.pref.spentaDa, this.pref.spentaA))
      return this.chiudi("notte", "ore di riposo");
    if (this.statoFoto === "attiva" || this.statoFoto === "apertura") return;
    if (this.statoFoto === "errore" && this.problemaFoto?.startsWith("Fotocamera non consentita")) return;
    this.statoFoto = "apertura";
    this.notifica();
    try {
      await this.dip.occhio.apri(this.pref.fps);
    } catch (errore) {
      this.statoFoto = "errore";
      this.problemaFoto = messaggioFotocamera(errore);
      log.avviso(`Fotocamera: non si apre (${descriviErrore(errore)})`);
      this.notifica();
      return;
    }
    if (!this.avviata) return this.dip.occhio.chiudi();
    this.statoFoto = "attiva";
    this.problemaFoto = null;
    this.movimento.azzera();
    log.info(`Fotocamera accesa: ${this.pref.fps} fotogrammi al secondo, le immagini restano sul tablet`);
    this.notifica();
    this.prossimo();
  }

  private chiudi(stato: StatoFotocamera, motivo: string): void {
    clearTimeout(this.timerFoto);
    const era = this.statoFoto === "attiva";
    if (this.dip.occhio.aperto) this.dip.occhio.chiudi();
    this.statoFoto = stato;
    this.ultimoVolto = null;
    if (era) log.info(`Fotocamera spenta (${motivo})`);
    this.notifica();
  }

  private prossimo(): void {
    clearTimeout(this.timerFoto);
    if (this.statoFoto !== "attiva") return;
    this.timerFoto = setTimeout(() => void this.passo(), Math.round(1000 / this.pref.fps));
  }

  /** Un fotogramma: movimento, e se serve il modello del volto. */
  private async passo(): Promise<void> {
    if (this.statoFoto !== "attiva") return;
    if (this.occupato) return this.prossimo();
    const f = this.dip.occhio.fotogramma();
    if (!f) return this.prossimo();
    const adesso = this.adesso();
    this.carico.fotogrammi += 1;
    const mosso = this.movimento.quanto(grigioPiccolo(f.rgba, f.w, f.h));
    const serveModello =
      mosso >= MOVIMENTO_MINIMO ||
      adesso - this.ultimoVicino <= VICINO_VALE_MS ||
      adesso - this.ultimoModello >= MODELLO_ALMENO_OGNI_MS;
    if (!serveModello) return this.prossimo();
    this.occupato = true;
    try {
      const motore = await this.caricaMotore();
      const r = await motore.rileva(f.rgba);
      this.ultimoModello = this.adesso();
      this.carico.modello += 1;
      this.carico.ms += r.ms;
      this.valuta(volti(r.scores, r.boxes, SOGLIA_VOLTO[this.pref.sensibilita]));
    } catch (errore) {
      log.errore(`Fotocamera: modello del volto in errore: ${descriviErrore(errore)}`);
    } finally {
      this.occupato = false;
    }
    this.prossimo();
  }

  private caricaMotore(): Promise<MotoreVolto> {
    if (this.motore) return Promise.resolve(this.motore);
    this.caricamento ??= this.dip.caricaMotore().then(
      (m) => (this.motore = m),
      (errore: unknown) => {
        this.caricamento = null;
        throw errore;
      },
    );
    return this.caricamento;
  }

  private valuta(trovati: Volto[]): void {
    const adesso = this.adesso();
    const vicini = trovati
      .map((v) => ({ ...v, metri: distanza(v) }))
      .filter((v) => v.metri <= this.pref.distanza);
    this.carico.volti += trovati.length;
    const primo = vicini[0] ?? null;
    this.ultimoVolto = primo ?? (trovati[0] ? { ...trovati[0], metri: distanza(trovati[0]) } : null);
    if (!primo) return;
    const arrivo = adesso - this.ultimoVicino > ASSENZA_MS;
    this.ultimoVicino = adesso;
    if (arrivo) this.arrivato(primo.metri);
    this.notifica();
  }

  private arrivato(metri: number): void {
    const adesso = this.adesso();
    this.carico.arrivi += 1;
    log.info(`Fotocamera: qualcuno si è avvicinato (~${virgola(metri, 1)} m)`);
    if (this.pref.presenza)
      try {
        this.alArrivo();
      } catch (errore) {
        log.errore(`Fotocamera: risveglio del pannello in errore: ${descriviErrore(errore)}`);
      }
    if (!this.pref.avvisaCasa) return;
    const pannello = this.dip.pannello();
    if (!pannello) return;
    if (adesso - this.ultimoInvio < INVIO_OGNI_MS) return;
    this.ultimoInvio = adesso;
    void this.dip.invia(pannello).then(
      () => log.info(`Fotocamera: presenza mandata a Home Assistant (${pannello})`),
      (errore: unknown) => log.avviso(`Fotocamera: presenza non mandata (${descriviErrore(errore)})`),
    );
  }

  /** Ogni 10 minuti: quanto lavora la fotocamera (punto 7.5, carico nel registro). */
  private scriviCarico(): void {
    const adesso = this.adesso();
    const c = this.carico;
    if (adesso - c.da < CARICO_OGNI_MS) return;
    if (c.fotogrammi)
      log.info(
        `Fotocamera negli ultimi ${Math.round((adesso - c.da) / 60_000)} min: ${c.fotogrammi} fotogrammi, ` +
          `modello del volto ${c.modello} volte${c.modello ? ` (${Math.round(c.ms / c.modello)} ms in media)` : ""}, ` +
          `${c.volti} volti, ${c.arrivi} arrivi`,
      );
    this.carico = { da: adesso, fotogrammi: 0, modello: 0, ms: 0, volti: 0, arrivi: 0 };
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Fotocamera: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

/** Perché la fotocamera non si apre, in parole. */
export function messaggioFotocamera(errore: unknown): string {
  const nome = errore instanceof Error || errore instanceof DOMException ? errore.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError")
    return "Fotocamera non consentita: tocca il lucchetto accanto all'indirizzo → Autorizzazioni → Fotocamera → Consenti.";
  if (nome === "NotFoundError" || nome === "OverconstrainedError")
    return "Questo dispositivo non ha una fotocamera frontale.";
  if (nome === "NotReadableError" || nome === "AbortError")
    return "La fotocamera è occupata da un'altra app (videochiamata?).";
  if (nome === "TypeError" || nome === "MediaNonDisponibile")
    return "La fotocamera funziona solo sull'indirizzo sicuro (https).";
  return `La fotocamera non si è aperta (${descriviErrore(errore)}).`;
}
