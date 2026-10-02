import {
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherHail,
  mdiWeatherLightning,
  mdiWeatherLightningRainy,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherPouring,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSnowyRainy,
  mdiWeatherSunny,
  mdiWeatherWindy,
  mdiWeatherWindyVariant,
  mdiAlertCircleOutline,
  mdiHelpCircleOutline,
} from "@mdi/js";

/** Condizioni meteo standard di Home Assistant → testo italiano e icona. */
const CONDIZIONI: Record<string, { testo: string; icona: string }> = {
  "clear-night": { testo: "Sereno", icona: mdiWeatherNight },
  cloudy: { testo: "Nuvoloso", icona: mdiWeatherCloudy },
  exceptional: { testo: "Eccezionale", icona: mdiAlertCircleOutline },
  fog: { testo: "Nebbia", icona: mdiWeatherFog },
  hail: { testo: "Grandine", icona: mdiWeatherHail },
  lightning: { testo: "Temporale", icona: mdiWeatherLightning },
  "lightning-rainy": { testo: "Temporale e pioggia", icona: mdiWeatherLightningRainy },
  partlycloudy: { testo: "Parz. nuvoloso", icona: mdiWeatherPartlyCloudy },
  pouring: { testo: "Pioggia forte", icona: mdiWeatherPouring },
  rainy: { testo: "Pioggia", icona: mdiWeatherRainy },
  snowy: { testo: "Neve", icona: mdiWeatherSnowy },
  "snowy-rainy": { testo: "Pioggia e neve", icona: mdiWeatherSnowyRainy },
  sunny: { testo: "Sereno", icona: mdiWeatherSunny },
  windy: { testo: "Vento", icona: mdiWeatherWindy },
  "windy-variant": { testo: "Vento e nuvole", icona: mdiWeatherWindyVariant },
};

export function condizione(stato: string | undefined): { testo: string; icona: string } {
  return (stato && CONDIZIONI[stato]) || { testo: "Non disponibile", icona: mdiHelpCircleOutline };
}

/** "25,7" da un valore di HA (stringa o numero); null se non è un numero. */
export function numero(valore: unknown, decimali = 1): string | null {
  const n = typeof valore === "number" ? valore : typeof valore === "string" ? Number(valore) : NaN;
  if (!Number.isFinite(n) || (typeof valore === "string" && valore.trim() === "")) return null;
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimali }).format(n);
}

export function gradiInteri(valore: unknown): string | null {
  const n = typeof valore === "number" ? valore : Number(valore);
  return Number.isFinite(n) ? `${Math.round(n)}°` : null;
}

export interface PrevisioneGiorno {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  /** mm (met.no e quasi tutte le integrazioni). */
  precipitation?: number;
  /** % (solo alcune integrazioni). */
  precipitation_probability?: number;
}

interface GiornoMostrato {
  etichetta: string;
  massima: string | null;
  minima: string | null;
  condizione: { testo: string; icona: string };
}

/**
 * Da una previsione giornaliera di HA: oggi (per max/min) e i prossimi `quanti` giorni.
 * I giorni passati (la previsione può arrivare prima della mezzanotte) si scartano.
 */
export function prossimiGiorni(
  previsione: readonly PrevisioneGiorno[],
  adesso: Date,
  quanti = 4,
): { oggi: GiornoMostrato | null; prossimi: GiornoMostrato[] } {
  const chiaveOggi = chiaveGiorno(adesso);
  const giorno = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
  const mostra = (p: PrevisioneGiorno): GiornoMostrato => ({
    etichetta: giorno.format(new Date(p.datetime)).replace(".", ""),
    massima: gradiInteri(p.temperature),
    minima: gradiInteri(p.templow),
    condizione: condizione(p.condition),
  });
  let oggi: GiornoMostrato | null = null;
  const prossimi: GiornoMostrato[] = [];
  for (const p of previsione) {
    const d = new Date(p.datetime);
    if (Number.isNaN(d.getTime())) continue;
    const chiave = chiaveGiorno(d);
    if (chiave < chiaveOggi) continue;
    if (chiave === chiaveOggi) oggi = mostra(p);
    else if (prossimi.length < quanti) prossimi.push(mostra(p));
  }
  return { oggi, prossimi };
}

function chiaveGiorno(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
