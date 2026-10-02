import type { Connection } from "home-assistant-js-websocket";
import type { Assistente } from "../assistente";
import { descriviErrore, log } from "../diagnostica";
import type { DoveVoce, Voce } from "../voce";

/**
 * Jarvis parla per primo (v0.5.4). Lato server `jarvis_voce` 0.2.8: il
 * servizio `jarvis_voce.annuncia {stanza, testo, ascolta}` manda l'evento
 * `jarvis_annuncio {pannello, testo, ascolta}`, e la frase resta contesto per
 * 3 minuti (si può rispondere "no, lascia stare").
 *
 * Sul pannello:
 *  - solo gli eventi con `pannello` = il device_id di questo pannello;
 *  - in coda, uno alla volta, mai sopra una domanda in corso;
 *  - si dice con la voce di Jarvis (pipeline tts→tts) e si vede nell'Hub;
 *    con `ascolta` poi gli 8 s di riascolto senza «Jarvis»;
 *  - di notte, quando HA dice che è l'ora del silenzio
 *    (`binary_sensor.jarvis_annunci_in_silenzio`) o con "solo testo": niente
 *    voce, resta scritto sullo schermo a riposo finché non lo si tocca.
 */
export const EVENTO = "jarvis_annuncio";
export const SENSORE_SILENZIO = "binary_sensor.jarvis_annunci_in_silenzio";
/**
 * Scritti a riposo: al massimo tanti (i più vecchi se ne vanno) e per al
 * massimo tante ore. Di serie 5 e 12 ore; dalla v0.5.10 si cambiano
 * (Impostazioni → Jarvis parla per primo → Solo questo pannello).
 */
export const PROMEMORIA_MASSIMI = 5;
export const PROMEMORIA_DURATA_MS = 12 * 3_600_000;
export const LIMITI_ANNUNCI = { promemoria: [1, 20], promemoriaOre: [1, 48] } as const;

export interface Annuncio {
  pannello: string;
  testo: string;
  ascolta: boolean;
}

interface Promemoria {
  id: number;
  testo: string;
  ora: number;
  /** Perché non è stato detto a voce. */
  motivo: string;
}

/** Evento di HA → annuncio, o null se non è valido. */
export function leggiAnnuncio(dati: unknown): Annuncio | null {
  if (typeof dati !== "object" || dati === null) return null;
  const d = dati as Record<string, unknown>;
  const testo = typeof d["testo"] === "string" ? d["testo"].trim() : "";
  if (typeof d["pannello"] !== "string" || !testo) return null;
  return { pannello: d["pannello"], testo, ascolta: d["ascolta"] === true };
}

// --- preferenze del pannello -------------------------------------------------

interface PreferenzeAnnunci {
  /** Niente voce: gli annunci restano scritti a riposo. */
  soloTesto: boolean;
  /** Volume degli annunci, 0-100 (del volume del tablet). */
  volume: number;
  /** v0.5.10: quanti annunci scritti a riposo, al massimo. */
  promemoria: number;
  /** v0.5.10: per quante ore restano scritti. */
  promemoriaOre: number;
}
export const PREFERENZE_ANNUNCI_DI_SERIE: PreferenzeAnnunci = {
  soloTesto: false,
  volume: 100,
  promemoria: PROMEMORIA_MASSIMI,
  promemoriaOre: PROMEMORIA_DURATA_MS / 3_600_000,
};
const CHIAVE = "jarvis-annunci";

export function leggiPreferenzeAnnunci(grezzo: string | null): PreferenzeAnnunci {
  const p = { ...PREFERENZE_ANNUNCI_DI_SERIE };
  if (grezzo === null) return p;
  try {
    const d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d["soloTesto"] === "boolean") p.soloTesto = d["soloTesto"];
    if (typeof d["volume"] === "number" && Number.isFinite(d["volume"]))
      p.volume = Math.round(Math.min(100, Math.max(0, d["volume"])));
    for (const k of ["promemoria", "promemoriaOre"] as const) {
      const v = d[k];
      const [min, max] = LIMITI_ANNUNCI[k];
      if (typeof v === "number" && Number.isFinite(v)) p[k] = Math.round(Math.min(max, Math.max(min, v)));
    }
  } catch {
    // illeggibile: valori di serie
  }
  return p;
}

interface DipendenzeAnnunci {
  /** device_id di questo pannello (come per i timer: jarvis_<area>, o jarvis_pannello). */
  mio: () => string;
  voce: Pick<Voce, "annuncia" | "attiva" | "ascolta">;
  assistente: Pick<Assistente, "annuncia" | "occupato" | "ascolta">;
  /** Stato di un'entità di HA (per il sensore del silenzio). */
  statoDi: (entita: string) => string | undefined;
  adesso?: () => number;
  archivio?: Pick<Storage, "getItem" | "setItem"> | null;
}

export class Annunci {
  private coda: Annuncio[] = [];
  private scritti: Promemoria[] = [];
  private pref: PreferenzeAnnunci;
  private contatore = 0;
  private dentro = false;
  private connIscritta: Connection | null = null;
  private readonly adesso: () => number;
  private readonly ascoltatori = new Set<() => void>();
  /** Dove si vede l'annuncio: la decide l'interfaccia (porta l'Hub in primo piano). */
  mostra: () => DoveVoce = () => "hub";
  /** Notte dello schermo a riposo: la decide l'interfaccia. */
  notte: () => boolean = () => false;

  constructor(private readonly dip: DipendenzeAnnunci) {
    this.adesso = dip.adesso ?? Date.now;
    let letto: string | null = null;
    try {
      letto =
        dip.archivio === undefined ? localStorage.getItem(CHIAVE) : (dip.archivio?.getItem(CHIAVE) ?? null);
    } catch (errore) {
      log.avviso(`Annunci: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    }
    this.pref = leggiPreferenzeAnnunci(letto);
    dip.voce.ascolta(() => this.prova());
    dip.assistente.ascolta(() => this.prova());
  }

  get preferenze(): PreferenzeAnnunci {
    return { ...this.pref };
  }
  /** Annunci da leggere a schermo (non detti a voce), dal più recente. */
  get promemoria(): readonly Promemoria[] {
    const limite = this.adesso() - this.pref.promemoriaOre * 3_600_000;
    return this.scritti
      .slice(-this.pref.promemoria)
      .filter((p) => p.ora >= limite)
      .slice()
      .reverse();
  }
  get inCoda(): number {
    return this.coda.length;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** `null` = valore di serie. */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeAnnunci]?: PreferenzeAnnunci[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi))
      unito[k] = v === null ? PREFERENZE_ANNUNCI_DI_SERIE[k as keyof PreferenzeAnnunci] : v;
    this.pref = leggiPreferenzeAnnunci(JSON.stringify(unito));
    try {
      (this.dip.archivio === undefined ? localStorage : this.dip.archivio)?.setItem(
        CHIAVE,
        JSON.stringify(this.pref),
      );
    } catch (errore) {
      log.avviso(`Annunci: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`);
    }
    log.info(`Annunci: ${this.pref.soloTesto ? "solo testo" : `a voce, volume ${this.pref.volume}%`}`);
    this.notifica();
  }

  /** Da chiamare a ogni connessione nuova. */
  async collega(conn: Connection): Promise<void> {
    if (this.connIscritta === conn) return;
    this.connIscritta = conn;
    try {
      await conn.subscribeEvents<{ data?: unknown }>((e) => this.ricevi(e.data), EVENTO);
    } catch (errore) {
      log.errore(`Impossibile ascoltare ${EVENTO}: ${descriviErrore(errore)}`);
    }
  }

  /** Un evento jarvis_annuncio. */
  ricevi(dati: unknown): void {
    const a = leggiAnnuncio(dati);
    if (!a) {
      log.avviso("Annunci: evento jarvis_annuncio senza pannello o testo, ignorato");
      return;
    }
    if (a.pannello !== this.dip.mio()) return;
    log.info(`Annuncio ricevuto (${a.testo.length} caratteri${a.ascolta ? ", poi ascolta" : ""})`);
    this.coda.push(a);
    this.prova();
  }

  /** Toglie un annuncio scritto (tocco). */
  togli(id: number): void {
    this.scritti = this.scritti.filter((p) => p.id !== id);
    this.notifica();
  }

  /** Perché adesso non si parla: null = si può parlare. */
  private silenzio(): string | null {
    if (this.pref.soloTesto) return "solo testo";
    if (this.notte()) return "notte";
    if (this.dip.statoDi(SENSORE_SILENZIO) === "on") return "ora del silenzio";
    return null;
  }

  /** Il prossimo della coda, se si può. */
  private prova(): void {
    if (this.dentro) return;
    this.dentro = true;
    try {
      while (this.coda.length) {
        const a = this.coda[0];
        if (!a) break;
        const motivo = this.silenzio();
        if (motivo) {
          this.coda.shift();
          this.scrivi(a, motivo);
          continue;
        }
        // mai sopra una domanda o un'altra risposta: si aspetta che la voce torni libera
        if (this.dip.voce.attiva || this.dip.assistente.occupato) break;
        const id = this.dip.assistente.annuncia(a.testo);
        if (id === null) {
          // HA non collegato: lo si scrive, la voce non potrebbe dirlo
          this.coda.shift();
          this.scrivi(a, "Home Assistant non collegato");
          continue;
        }
        this.coda.shift();
        const dove = this.mostra();
        if (!this.dip.voce.annuncia(id, dove, { ascolta: a.ascolta, volume: this.pref.volume / 100 }))
          log.avviso("Annunci: la voce non era libera, annuncio solo scritto in chat");
        break;
      }
    } finally {
      this.dentro = false;
    }
    this.notifica();
  }

  private scrivi(a: Annuncio, motivo: string): void {
    this.contatore += 1;
    this.scritti = [
      ...this.scritti.slice(-(this.pref.promemoria - 1)),
      { id: this.contatore, testo: a.testo, ora: this.adesso(), motivo },
    ];
    log.info(`Annuncio non detto a voce (${motivo}): resta scritto sullo schermo`);
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Annunci: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
