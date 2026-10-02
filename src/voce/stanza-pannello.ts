import { descriviErrore, log } from "../diagnostica";

/**
 * Stanza di questo pannello, salvata sul dispositivo (ogni tablet o telefono la
 * sua). Oggi serve alla pausa della musica durante la voce; con la fase G e
 * l'Hub diventerà una preferenza del dispositivo. Senza stanza, la musica non
 * si tocca.
 */
const CHIAVE = "jarvis-stanza-pannello";
const ascoltatori = new Set<() => void>();

export function stanzaPannello(): string | null {
  try {
    return localStorage.getItem(CHIAVE) || null;
  } catch (errore) {
    log.avviso(`Stanza del pannello illeggibile: ${descriviErrore(errore)}`);
    return null;
  }
}

export function impostaStanzaPannello(stanza: string | null): void {
  try {
    if (stanza) localStorage.setItem(CHIAVE, stanza);
    else localStorage.removeItem(CHIAVE);
    log.info(`Stanza di questo pannello: ${stanza ?? "nessuna"}`);
  } catch (errore) {
    log.errore(`Stanza del pannello non salvata: ${descriviErrore(errore)}`);
  }
  for (const f of ascoltatori) f();
}

export function ascoltaStanzaPannello(f: () => void): () => void {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}
