/**
 * Log circolare degli errori, consultabile dalla schermata diagnostica.
 *
 * Tiene le ultime N voci e le salva nel localStorage, così sopravvivono alla
 * ricarica notturna delle 04:00 (è proprio lì che serve rileggerle).
 */
export type Livello = "errore" | "avviso" | "info";

export interface VoceLog {
  t: number;
  livello: Livello;
  messaggio: string;
}

const CHIAVE = "jarvis-log";

export class LogCircolare {
  private elenco: VoceLog[] = [];
  private readonly ascoltatori = new Set<() => void>();

  constructor(
    private readonly capacita = 200,
    private readonly archivio: Pick<Storage, "getItem" | "setItem"> | null = null,
  ) {
    if (!archivio) return;
    try {
      const salvato = archivio.getItem(CHIAVE);
      if (salvato) this.elenco = (JSON.parse(salvato) as VoceLog[]).slice(-capacita);
    } catch (errore) {
      // Archivio illeggibile (privacy mode, dati corrotti): si riparte vuoti, ma lo si dice.
      this.elenco = [];
      console.warn("[jarvis] log salvato illeggibile, riparto vuoto", errore);
    }
  }

  aggiungi(livello: Livello, messaggio: string, t = Date.now()): void {
    this.elenco.push({ t, livello, messaggio: messaggio.slice(0, 500) });
    if (this.elenco.length > this.capacita) this.elenco.splice(0, this.elenco.length - this.capacita);
    if (livello === "errore") console.error("[jarvis]", messaggio);
    else if (livello === "avviso") console.warn("[jarvis]", messaggio);
    this.salva();
    for (const f of this.ascoltatori) f();
  }

  errore(messaggio: string): void {
    this.aggiungi("errore", messaggio);
  }
  avviso(messaggio: string): void {
    this.aggiungi("avviso", messaggio);
  }
  info(messaggio: string): void {
    this.aggiungi("info", messaggio);
  }

  /** Dalla più recente alla più vecchia. */
  voci(): VoceLog[] {
    return [...this.elenco].reverse();
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  private salva(): void {
    if (!this.archivio) return;
    try {
      this.archivio.setItem(CHIAVE, JSON.stringify(this.elenco));
    } catch (errore) {
      // Spazio pieno o storage bloccato: il log resta in memoria.
      console.warn("[jarvis] impossibile salvare il log", errore);
    }
  }
}

export function descriviErrore(errore: unknown): string {
  if (errore instanceof Error) return `${errore.name}: ${errore.message}`;
  if (typeof errore === "number") return `codice ${errore}`;
  try {
    return typeof errore === "string" ? errore : JSON.stringify(errore);
  } catch {
    return String(errore);
  }
}

function archivioLocale(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (errore) {
    console.warn("[jarvis] localStorage non disponibile", errore);
    return null;
  }
}

export const log = new LogCircolare(200, archivioLocale());
