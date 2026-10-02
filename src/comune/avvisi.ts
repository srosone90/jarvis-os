import { log } from "../diagnostica";

/**
 * Avvisi brevi a schermo ("comando inviato", "HA ha rifiutato…"). Restano 5 s
 * (gli errori 8 s) e finiscono anche nel log diagnostico.
 */
export interface Avviso {
  id: number;
  testo: string;
  tipo: "info" | "errore";
}

const DURATA_MS = { info: 5000, errore: 8000 } as const;
const MASSIMO = 3;

class Avvisi {
  private elenco: Avviso[] = [];
  private prossimoId = 1;
  private readonly ascoltatori = new Set<() => void>();

  get attivi(): readonly Avviso[] {
    return this.elenco;
  }

  mostra(testo: string, tipo: Avviso["tipo"] = "info"): void {
    if (tipo === "errore") log.errore(testo);
    else log.info(testo);
    const avviso = { id: this.prossimoId++, testo, tipo };
    this.elenco = [...this.elenco, avviso].slice(-MASSIMO);
    this.avvisa();
    setTimeout(() => this.chiudi(avviso.id), DURATA_MS[tipo]);
  }

  chiudi(id: number): void {
    const prima = this.elenco.length;
    this.elenco = this.elenco.filter((a) => a.id !== id);
    if (this.elenco.length !== prima) this.avvisa();
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  private avvisa(): void {
    for (const f of this.ascoltatori) f();
  }
}

export const avvisi = new Avvisi();
