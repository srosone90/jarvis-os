import { descriviErrore, log } from "../diagnostica/log";

/**
 * Preferenze della voce di QUESTO pannello (localStorage `jarvis-voce`,
 * v0.5.4). Per ora il riascolto dopo la risposta (v0.5.3, 8 s di serie;
 * 0 = spento).
 */
export interface PreferenzeVoce {
  riascoltoSecondi: number;
}
export const PREFERENZE_VOCE_DI_SERIE: PreferenzeVoce = { riascoltoSecondi: 8 };
export const LIMITI_VOCE = { riascoltoSecondi: [0, 30] } as const;
const CHIAVE = "jarvis-voce";

export function leggiPreferenzeVoce(grezzo: string | null): PreferenzeVoce {
  const p = { ...PREFERENZE_VOCE_DI_SERIE };
  if (grezzo === null) return p;
  try {
    const v = (JSON.parse(grezzo) as Record<string, unknown>)["riascoltoSecondi"];
    if (typeof v === "number" && Number.isFinite(v))
      p.riascoltoSecondi = Math.round(Math.min(LIMITI_VOCE.riascoltoSecondi[1], Math.max(0, v)));
  } catch {
    // illeggibile: valori di serie
  }
  return p;
}

export function caricaPreferenzeVoce(): PreferenzeVoce {
  try {
    return leggiPreferenzeVoce(localStorage.getItem(CHIAVE));
  } catch (errore) {
    log.avviso(`Voce: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    return { ...PREFERENZE_VOCE_DI_SERIE };
  }
}

export function salvaPreferenzeVoce(p: PreferenzeVoce): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(p));
  } catch (errore) {
    log.avviso(`Voce: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`);
  }
}
