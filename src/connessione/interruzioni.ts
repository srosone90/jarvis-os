import { descriviErrore, log } from "../diagnostica";

/**
 * Le volte che Home Assistant non era raggiungibile da questo pannello
 * (v0.5.7, Avvisi → Connessione). HA non le può scrivere nel suo registro,
 * quindi le tiene il pannello, salvate (sopravvivono alla ricarica delle
 * 04:00). Un'interruzione ancora aperta alla ricarica si chiude al primo
 * collegamento riuscito.
 */
interface Interruzione {
  da: number;
  /** null = ancora in corso. */
  a: number | null;
}

const CHIAVE = "jarvis-interruzioni";
export const MASSIMO_INTERRUZIONI = 30;

export function leggiInterruzioni(grezzo: string | null): Interruzione[] {
  if (grezzo === null) return [];
  try {
    const d = JSON.parse(grezzo) as unknown;
    if (!Array.isArray(d)) return [];
    return d
      .map((x) => x as { da?: unknown; a?: unknown })
      .filter((x): x is { da: number; a: unknown } => typeof x.da === "number" && Number.isFinite(x.da))
      .map((x) => ({
        da: x.da,
        a: typeof x.a === "number" && Number.isFinite(x.a) && x.a >= x.da ? x.a : null,
      }))
      .slice(-MASSIMO_INTERRUZIONI);
  } catch {
    return [];
  }
}

export class RegistroInterruzioni {
  private elenco: Interruzione[];

  constructor(
    private readonly archivio: Pick<Storage, "getItem" | "setItem"> | null | undefined = undefined,
  ) {
    let letto: string | null = null;
    try {
      letto =
        archivio === undefined
          ? typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(CHIAVE)
          : (archivio?.getItem(CHIAVE) ?? null);
    } catch (errore) {
      log.avviso(`Interruzioni: elenco non letto (${descriviErrore(errore)})`);
    }
    this.elenco = leggiInterruzioni(letto);
  }

  /** Dalla più recente. */
  get voci(): readonly Interruzione[] {
    return [...this.elenco].reverse();
  }

  /** Connessione persa. Due perdite di fila (senza ritorno in mezzo) contano una volta. */
  inizio(t: number): void {
    if (this.elenco.at(-1)?.a === null) return;
    this.elenco.push({ da: t, a: null });
    if (this.elenco.length > MASSIMO_INTERRUZIONI)
      this.elenco.splice(0, this.elenco.length - MASSIMO_INTERRUZIONI);
    this.salva();
  }

  /** Collegati di nuovo: si chiude quella aperta, se c'è. */
  fine(t: number): void {
    const ultima = this.elenco.at(-1);
    if (!ultima || ultima.a !== null) return;
    ultima.a = Math.max(t, ultima.da);
    this.salva();
  }

  private salva(): void {
    try {
      (this.archivio === undefined ? localStorage : this.archivio)?.setItem(
        CHIAVE,
        JSON.stringify(this.elenco),
      );
    } catch (errore) {
      log.avviso(`Interruzioni: elenco non salvato (${descriviErrore(errore)})`);
    }
  }
}
