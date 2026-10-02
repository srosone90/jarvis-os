import { descriviErrore, log } from "../diagnostica";

/**
 * Preferenze della fotocamera di QUESTO pannello (v0.6.0, punto 7.7 del
 * piano): tutto acceso di serie, fotocamera spenta di notte. Chiave
 * `jarvis-fotocamera` (si esporta con le altre).
 */
type SensibilitaVolto = "bassa" | "normale" | "alta";

export interface PreferenzeFotocamera {
  /** Chi si avvicina sveglia il pannello e manda jarvis_presenza (buongiorno). */
  presenza: boolean;
  /** Chi guarda il tablet e parla viene ascoltato senza dire «Jarvis». */
  guardaParla: boolean;
  /**
   * Con qualcuno vicino (o che guarda il tablet) «Jarvis» scatta più
   * facilmente: la soglia scende di `passoVicino` (punto 7.3, decisione del
   * 02/10: la fotocamera aiuta l'attivazione, non la limita mai).
   */
  aiutoVicino: boolean;
  /** Di quanto scende la soglia di «Jarvis» con qualcuno vicino (0,01-0,2). */
  passoVicino: number;
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
  guardaParla: true,
  aiutoVicino: true,
  passoVicino: 0.05,
  distanza: 1.5,
  sensibilita: "normale",
  fps: 3,
  spentaDa: "23:00",
  spentaA: "07:00",
};
export const LIMITI_FOTOCAMERA = { distanza: [0.5, 3], fps: [2, 5], passoVicino: [0.01, 0.2] } as const;
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
    for (const k of ["presenza", "guardaParla", "aiutoVicino"] as const)
      if (typeof d[k] === "boolean") p[k] = d[k];
    if (typeof d["passoVicino"] === "number" && Number.isFinite(d["passoVicino"]))
      p.passoVicino = Math.round(Math.min(0.2, Math.max(0.01, d["passoVicino"])) * 100) / 100;
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
