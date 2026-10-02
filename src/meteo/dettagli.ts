import { descriviErrore, log } from "../diagnostica";
import { condizione, gradiInteri, numero, type PrevisioneGiorno } from "./testi";

/**
 * Schermata Meteo (v0.5.5): solo dati veri di Home Assistant
 * (`weather.forecast_casa`, previsione oraria e giornaliera; alba e tramonto
 * da `sun.sun` se c'è). Quello che l'integrazione non manda non si mostra.
 * Tutto personalizzabile (localStorage `jarvis-meteo`).
 */
export type UnitaVento = "ha" | "kmh" | "ms";

export interface PreferenzeMeteo {
  /** Ore della previsione oraria (0 = niente). */
  ore: number;
  /** Giorni della previsione giornaliera (0 = niente). */
  giorni: number;
  umidita: boolean;
  vento: boolean;
  unitaVento: UnitaVento;
  pressione: boolean;
  pioggia: boolean;
  alba: boolean;
}

export const PREFERENZE_METEO_DI_SERIE: PreferenzeMeteo = {
  ore: 12,
  giorni: 5,
  umidita: true,
  vento: true,
  unitaVento: "ha",
  pressione: false,
  pioggia: true,
  alba: true,
};
export const LIMITI_METEO = { ore: [0, 24], giorni: [0, 7] } as const;
const CHIAVE = "jarvis-meteo";

export function leggiPreferenzeMeteo(grezzo: string | null): PreferenzeMeteo {
  const p = { ...PREFERENZE_METEO_DI_SERIE };
  if (grezzo === null) return p;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
  } catch {
    return p;
  }
  for (const k of ["umidita", "vento", "pressione", "pioggia", "alba"] as const)
    if (typeof d[k] === "boolean") p[k] = d[k];
  for (const k of ["ore", "giorni"] as const) {
    const v = d[k];
    if (typeof v === "number" && Number.isFinite(v))
      p[k] = Math.round(Math.min(LIMITI_METEO[k][1], Math.max(LIMITI_METEO[k][0], v)));
  }
  if (d["unitaVento"] === "ha" || d["unitaVento"] === "kmh" || d["unitaVento"] === "ms")
    p.unitaVento = d["unitaVento"];
  return p;
}

export function caricaPreferenzeMeteo(): PreferenzeMeteo {
  try {
    return leggiPreferenzeMeteo(localStorage.getItem(CHIAVE));
  } catch (errore) {
    log.avviso(`Meteo: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    return { ...PREFERENZE_METEO_DI_SERIE };
  }
}

export function salvaPreferenzeMeteo(p: PreferenzeMeteo): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(p));
  } catch (errore) {
    log.avviso(`Meteo: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`);
  }
}

interface OraMostrata {
  ora: string;
  temperatura: string | null;
  condizione: { testo: string; icona: string };
  /** "40%" se c'è la probabilità, "1,2 mm" se c'è solo la quantità, null se non piove. */
  pioggia: string | null;
}

/** Le prossime `quante` ore dalla previsione oraria (le ore passate si scartano). */
export function prossimeOre(
  previsione: readonly PrevisioneGiorno[],
  adesso: Date,
  quante: number,
): OraMostrata[] {
  const inizioOra = new Date(adesso);
  inizioOra.setMinutes(0, 0, 0);
  const uscita: OraMostrata[] = [];
  for (const p of previsione) {
    const d = new Date(p.datetime);
    if (Number.isNaN(d.getTime()) || d < inizioOra) continue;
    if (uscita.length >= quante) break;
    uscita.push({
      ora: String(d.getHours()).padStart(2, "0"),
      temperatura: gradiInteri(p.temperature),
      condizione: condizione(p.condition),
      pioggia: pioggiaDi(p),
    });
  }
  return uscita;
}

export function pioggiaDi(
  p: Pick<PrevisioneGiorno, "precipitation" | "precipitation_probability">,
): string | null {
  // solo se piove: "0 mm" su ogni ora è rumore
  if (typeof p.precipitation_probability === "number")
    return p.precipitation_probability > 0 ? `${Math.round(p.precipitation_probability)}%` : null;
  if (typeof p.precipitation === "number" && p.precipitation > 0) return `${numero(p.precipitation, 1)} mm`;
  return null;
}

/** Vento nell'unità scelta. `unitaHA` è `wind_speed_unit` dell'entità ("km/h", "m/s", …). */
export function vento(valore: unknown, unitaHA: unknown, scelta: UnitaVento): string | null {
  const n = typeof valore === "number" ? valore : Number(valore);
  if (!Number.isFinite(n)) return null;
  const u = typeof unitaHA === "string" ? unitaHA : "km/h";
  if (scelta === "ha" || (scelta === "kmh" && u === "km/h") || (scelta === "ms" && u === "m/s"))
    return `${numero(n, 0)} ${u}`;
  // conversione solo tra km/h e m/s: altre unità si mostrano come le manda HA
  if (scelta === "kmh" && u === "m/s") return `${numero(n * 3.6, 0)} km/h`;
  if (scelta === "ms" && u === "km/h") return `${numero(n / 3.6, 1)} m/s`;
  return `${numero(n, 0)} ${u}`;
}

const DIREZIONI = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
/** Da dove soffia, da `wind_bearing` in gradi. */
export function direzione(gradi: unknown): string | null {
  const n = typeof gradi === "number" ? gradi : Number(gradi);
  if (!Number.isFinite(n)) return null;
  return DIREZIONI[Math.round((((n % 360) + 360) % 360) / 45) % 8] ?? null;
}

/** "07:08" da un'ora ISO (sun.sun next_rising/next_setting). */
export function oraDi(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
