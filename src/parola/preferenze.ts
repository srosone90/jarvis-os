import { DECISIONE_DI_SERIE, type OpzioniDecisione } from "./decisione";

/**
 * Preferenze di «Jarvis» di QUESTO pannello (localStorage `jarvis-parola`).
 * Ogni valore ha il suo di serie e si cambia in Impostazioni → Voce
 * (requisito del 01/10: tutto personalizzabile, con "Ripristina valore di
 * serie"). Valori fuori misura o illeggibili tornano a quelli di serie, uno
 * per uno: un campo rotto non butta via gli altri.
 */
export interface PreferenzeParola {
  acceso: boolean;
  /** Bip allo scatto (v0.5.3). */
  suono: boolean;
  /**
   * Soglia di scatto scelta a mano; null = di serie (0,5 o parola.json,
   * personale col verificatore). Fissa: la stessa vicino e lontano (v0.6.5).
   */
  sogliaManuale: number | null;
  /** Frame di fila sopra soglia (v0.5.4). */
  pazienza: number;
  /** I falsi scatti diventano esempi "non è «Jarvis»" e il verificatore si riaddestra (v0.5.4). */
  impara: boolean;
  /** Il parlato prima della frase va a HA come contesto (v0.5.3). */
  contesto: boolean;
  /** Quanti secondi prima della frase, al massimo (la memoria è di 60). */
  secondiContesto: number;
}

export const PREFERENZE_PAROLA_DI_SERIE: PreferenzeParola = {
  acceso: true,
  suono: true,
  sogliaManuale: null,
  pazienza: DECISIONE_DI_SERIE.pazienza,
  impara: true,
  contesto: true,
  secondiContesto: 60,
};

/** Limiti di ogni numero: [minimo, massimo]. */
export const LIMITI_PAROLA = {
  sogliaManuale: [0.05, 0.95],
  pazienza: [1, 6],
  secondiContesto: [5, 60],
} as const;

type Numerica = keyof typeof LIMITI_PAROLA;

function numero(v: unknown, campo: Numerica, intero = false): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const [min, max] = LIMITI_PAROLA[campo];
  const n = Math.min(max, Math.max(min, v));
  return intero ? Math.round(n) : n;
}

export function leggiPreferenzeParola(grezzo: string | null): PreferenzeParola {
  const p = { ...PREFERENZE_PAROLA_DI_SERIE };
  if (grezzo === null) return p;
  let d: Record<string, unknown>;
  try {
    const letto = JSON.parse(grezzo) as unknown;
    if (typeof letto !== "object" || letto === null) return p;
    d = letto as Record<string, unknown>;
  } catch {
    return p;
  }
  const booleano = (k: "acceso" | "suono" | "impara" | "contesto") => {
    if (typeof d[k] === "boolean") p[k] = d[k];
  };
  booleano("acceso");
  booleano("suono");
  booleano("impara");
  booleano("contesto");
  if (d["sogliaManuale"] === null) p.sogliaManuale = null;
  else p.sogliaManuale = numero(d["sogliaManuale"], "sogliaManuale") ?? null;
  p.pazienza = numero(d["pazienza"], "pazienza", true) ?? p.pazienza;
  p.secondiContesto = numero(d["secondiContesto"], "secondiContesto", true) ?? p.secondiContesto;
  return p;
}

export function opzioniDecisione(p: PreferenzeParola): OpzioniDecisione {
  return { pazienza: p.pazienza };
}
