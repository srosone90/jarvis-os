import { descriviErrore, log } from "../diagnostica/log";

/**
 * Preferenze della voce di QUESTO pannello (localStorage `jarvis-voce`,
 * v0.5.4). Il riascolto dopo la risposta (v0.5.8, dall'uso reale):
 * - `riascoltoSecondi`: dopo una DOMANDA di Jarvis (intent_output
 *   continue_conversation = true, o un annuncio che aspetta risposta),
 *   "Ti ascolto ancora…" per 8 s di serie; 0 = spento;
 * - `riascoltoAzioneSecondi`: dopo un'azione o una risposta chiusa, una
 *   finestra breve (2 s di serie) senza scritte: se qualcuno continua a
 *   parlare la conversazione prosegue, altrimenti si chiude subito; 0 =
 *   chiusura immediata;
 * - `sensibilitaParlato`: quanto poco basta per dire "qualcuno parla" nel
 *   riascolto (`RilevaParlato`).
 */
export type SensibilitaParlato = "bassa" | "normale" | "alta";
export interface PreferenzeVoce {
  riascoltoSecondi: number;
  riascoltoAzioneSecondi: number;
  sensibilitaParlato: SensibilitaParlato;
}
export const PREFERENZE_VOCE_DI_SERIE: PreferenzeVoce = {
  riascoltoSecondi: 8,
  riascoltoAzioneSecondi: 2,
  sensibilitaParlato: "normale",
};
export const LIMITI_VOCE = { riascoltoSecondi: [0, 30], riascoltoAzioneSecondi: [0, 15] } as const;
export const SENSIBILITA_PARLATO: readonly SensibilitaParlato[] = ["bassa", "normale", "alta"];
const CHIAVE = "jarvis-voce";

const limita = (v: number, [min, max]: readonly [number, number]) =>
  Math.round(Math.min(max, Math.max(min, v)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function leggiPreferenzeVoce(grezzo: string | null): PreferenzeVoce {
  const p = { ...PREFERENZE_VOCE_DI_SERIE };
  if (grezzo === null) return p;
  try {
    const d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
    if (numero(d["riascoltoSecondi"]))
      p.riascoltoSecondi = limita(d["riascoltoSecondi"], LIMITI_VOCE.riascoltoSecondi);
    if (numero(d["riascoltoAzioneSecondi"]))
      p.riascoltoAzioneSecondi = limita(d["riascoltoAzioneSecondi"], LIMITI_VOCE.riascoltoAzioneSecondi);
    const s = d["sensibilitaParlato"];
    if (typeof s === "string" && (SENSIBILITA_PARLATO as readonly string[]).includes(s))
      p.sensibilitaParlato = s as SensibilitaParlato;
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
