import { descriviErrore, log } from "../diagnostica";

/**
 * Preferenze della fotocamera di QUESTO pannello (v0.6.0, punto 7.7 del
 * piano; v0.6.5): tutto acceso di serie, fotocamera spenta di notte. Chiave
 * `jarvis-fotocamera` (si esporta con le altre). Dalla v0.6.5 la fotocamera
 * non tocca più «Jarvis»: niente soglia più bassa da vicino, niente «guarda e
 * parla» (le loro chiavi vecchie si ignorano).
 */
type SensibilitaVolto = "bassa" | "normale" | "alta";

export interface PreferenzeFotocamera {
  /** Sveglia schermo con presenza: chi arriva riaccende lo schermo a riposo, e basta. */
  presenza: boolean;
  /** Dopo una sveglia da presenza, secondi senza tocchi né voce prima che torni a riposo (5-600). */
  secondiSveglia: number;
  /** Chi arriva lo sa anche Home Assistant (`jarvis_presenza`, per il buongiorno). */
  avvisaCasa: boolean;
  /** Fino a quanti metri «vicino» (0,5-3). */
  distanza: number;
  /** Quanto deve essere sicuro il modello che è un volto. */
  sensibilita: SensibilitaVolto;
  /** Fotogrammi al secondo (2-5). */
  fps: number;
  /** Orari in cui la fotocamera è spenta del tutto ("HH:MM"; uguali = mai spenta). */
  spentaDa: string;
  spentaA: string;
}

export const PREFERENZE_FOTOCAMERA_DI_SERIE: PreferenzeFotocamera = {
  presenza: true,
  secondiSveglia: 30,
  avvisaCasa: true,
  distanza: 1.5,
  sensibilita: "normale",
  fps: 3,
  spentaDa: "23:00",
  spentaA: "07:00",
};
export const LIMITI_FOTOCAMERA = { distanza: [0.5, 3], fps: [2, 5], secondiSveglia: [5, 600] } as const;
/** Punteggio minimo del volto per sensibilità: alta = prende anche volti meno sicuri. */
export const SOGLIA_VOLTO: Record<SensibilitaVolto, number> = { bassa: 0.95, normale: 0.85, alta: 0.7 };
const SENSIBILITA: readonly SensibilitaVolto[] = ["bassa", "normale", "alta"];
const CHIAVE = "jarvis-fotocamera";
const ORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

export function leggiPreferenzeFotocamera(grezzo: string | null): PreferenzeFotocamera {
  const p = { ...PREFERENZE_FOTOCAMERA_DI_SERIE };
  if (grezzo === null) return p;
  try {
    const d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
    for (const k of ["presenza", "avvisaCasa"] as const) if (typeof d[k] === "boolean") p[k] = d[k];
    // fino alla v0.6.4 «presenza» decideva anche l'avviso a Home Assistant: chi l'aveva spenta lo ritrova spento
    if (typeof d["avvisaCasa"] !== "boolean" && typeof d["presenza"] === "boolean")
      p.avvisaCasa = d["presenza"];
    if (typeof d["secondiSveglia"] === "number" && Number.isFinite(d["secondiSveglia"]))
      p.secondiSveglia = Math.round(Math.min(600, Math.max(5, d["secondiSveglia"])));
    if (typeof d["distanza"] === "number" && Number.isFinite(d["distanza"]))
      p.distanza = Math.round(Math.min(3, Math.max(0.5, d["distanza"])) * 10) / 10;
    if (typeof d["fps"] === "number" && Number.isFinite(d["fps"]))
      p.fps = Math.round(Math.min(5, Math.max(2, d["fps"])));
    const s = d["sensibilita"];
    if (typeof s === "string" && (SENSIBILITA as readonly string[]).includes(s))
      p.sensibilita = s as SensibilitaVolto;
    for (const k of ["spentaDa", "spentaA"] as const) {
      const v = d[k];
      if (typeof v === "string" && ORARIO.test(v)) p[k] = v;
    }
  } catch {
    // illeggibile: valori di serie
  }
  return p;
}

export function caricaPreferenzeFotocamera(): PreferenzeFotocamera {
  try {
    return leggiPreferenzeFotocamera(localStorage.getItem(CHIAVE));
  } catch (errore) {
    log.avviso(`Fotocamera: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    return { ...PREFERENZE_FOTOCAMERA_DI_SERIE };
  }
}

export function salvaPreferenzeFotocamera(p: PreferenzeFotocamera): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(p));
  } catch (errore) {
    log.avviso(`Fotocamera: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`);
  }
}

/** Siamo nelle ore in cui la fotocamera è spenta? (anche a cavallo della mezzanotte) */
export function fuoriOrario(adesso: Date, da: string, a: string): boolean {
  const minuti = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const t = adesso.getHours() * 60 + adesso.getMinutes();
  const inizio = minuti(da);
  const fine = minuti(a);
  if (inizio === fine) return false;
  return inizio < fine ? t >= inizio && t < fine : t >= inizio || t < fine;
}
