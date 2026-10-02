import type { Connection } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica";

/**
 * Storico dei sensori per la schermata Stanza (v0.5.5): il registro di Home
 * Assistant (`history/history_during_period`, formato compresso: `s` stato,
 * `lu`/`lc` in secondi). Solo numeri veri: uno stato non numerico
 * ("unavailable") è un buco nella linea, non uno zero.
 */
export interface Punto {
  t: number;
  v: number | null;
}

interface StatoCompresso {
  s?: unknown;
  lu?: unknown;
  lc?: unknown;
}

/** Dal risultato di HA ai punti di un'entità, in ordine di tempo. */
export function puntiDa(risultato: unknown, entita: string): Punto[] {
  const elenco = (risultato as Record<string, unknown> | null)?.[entita];
  if (!Array.isArray(elenco)) return [];
  const punti: Punto[] = [];
  for (const x of elenco as StatoCompresso[]) {
    const sec = typeof x.lu === "number" ? x.lu : typeof x.lc === "number" ? x.lc : null;
    if (sec === null) continue;
    const n = typeof x.s === "string" && x.s.trim() !== "" ? Number(x.s) : NaN;
    punti.push({ t: sec * 1000, v: Number.isFinite(n) ? n : null });
  }
  return punti.sort((a, b) => a.t - b.t);
}

export async function leggiStorico(
  conn: Connection,
  entita: string[],
  ore: number,
  adesso = Date.now(),
): Promise<Record<string, Punto[]>> {
  const r = await conn.sendMessagePromise<unknown>({
    type: "history/history_during_period",
    start_time: new Date(adesso - ore * 3_600_000).toISOString(),
    end_time: new Date(adesso).toISOString(),
    entity_ids: entita,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  return Object.fromEntries(entita.map((e) => [e, puntiDa(r, e)]));
}

/** Minimo e massimo, allargati a 1 grado se la linea è quasi piatta (non sembri un'altalena). */
function allarga(valori: readonly number[]): { min: number; max: number } {
  let min = Math.min(...valori);
  let max = Math.max(...valori);
  if (max - min < 1) {
    const centro = (max + min) / 2;
    min = centro - 0.5;
    max = centro + 0.5;
  }
  return { min, max };
}

/** Una scala sola per più linee (v0.5.7, Clima: le stanze si confrontano a occhio). null = meno di 2 valori. */
export function scalaComune(linee: readonly (readonly Punto[])[]): { min: number; max: number } | null {
  const valori = linee.flatMap((l) => l.flatMap((p) => (p.v === null ? [] : [p.v])));
  return valori.length < 2 ? null : allarga(valori);
}

/**
 * Linea per un SVG largo `w` e alto `h`: segmenti separati dove mancano i
 * valori. Con `scala` usa quella (più linee nello stesso grafico).
 */
export function linea(
  punti: readonly Punto[],
  da: number,
  a: number,
  w: number,
  h: number,
  scala?: { min: number; max: number },
): { tratti: string[]; min: number; max: number } | null {
  const validi = punti.filter((p): p is { t: number; v: number } => p.v !== null);
  if (validi.length < 2) return null;
  const { min, max } = scala ?? allarga(validi.map((p) => p.v));
  const x = (t: number) => (((Math.max(da, Math.min(a, t)) - da) / (a - da)) * w).toFixed(1);
  const y = (v: number) => (h - ((v - min) / (max - min)) * h).toFixed(1);
  const tratti: string[] = [];
  let attuale: string[] = [];
  for (const p of punti) {
    if (p.v === null) {
      if (attuale.length > 1) tratti.push(attuale.join(" "));
      attuale = [];
      continue;
    }
    attuale.push(`${x(p.t)},${y(p.v)}`);
  }
  // l'ultimo valore vale fino ad adesso (lo stato non è cambiato)
  const ultimo = validi.at(-1);
  if (ultimo && punti.at(-1)?.v !== null) attuale.push(`${x(a)},${y(ultimo.v)}`);
  if (attuale.length > 1) tratti.push(attuale.join(" "));
  return { tratti, min, max };
}

// --- preferenze -----------------------------------------------------------------

export interface PreferenzeStorico {
  /** Ore del grafico della stanza. */
  ore: number;
  /** Anche l'umidità nel grafico. */
  umidita: boolean;
}
export const PREFERENZE_STORICO_DI_SERIE: PreferenzeStorico = { ore: 24, umidita: false };
export const LIMITI_STORICO = { ore: [6, 72] } as const;
const CHIAVE = "jarvis-storico";

export function leggiPreferenzeStorico(grezzo: string | null): PreferenzeStorico {
  const p = { ...PREFERENZE_STORICO_DI_SERIE };
  if (grezzo === null) return p;
  try {
    const d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d["ore"] === "number" && Number.isFinite(d["ore"]))
      p.ore = Math.round(Math.min(LIMITI_STORICO.ore[1], Math.max(LIMITI_STORICO.ore[0], d["ore"])));
    if (typeof d["umidita"] === "boolean") p.umidita = d["umidita"];
  } catch {
    // illeggibile: di serie
  }
  return p;
}

export function caricaPreferenzeStorico(): PreferenzeStorico {
  try {
    return leggiPreferenzeStorico(localStorage.getItem(CHIAVE));
  } catch (errore) {
    log.avviso(`Storico: preferenze non lette (${descriviErrore(errore)})`);
    return { ...PREFERENZE_STORICO_DI_SERIE };
  }
}

export function salvaPreferenzeStorico(p: PreferenzeStorico): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(p));
  } catch (errore) {
    log.avviso(`Storico: preferenze non salvate (${descriviErrore(errore)})`);
  }
}
