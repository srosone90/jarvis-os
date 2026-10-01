import { Navigatore } from "./navigazione";

/**
 * L'unico navigatore del pannello (v0.5.5). L'indirizzo (`#meteo`) e il tasto
 * Indietro passano da qui; senza tocchi si torna alla schermata iniziale.
 */
export const navigatore = new Navigatore({
  cronologia: typeof history === "undefined" ? null : history,
  posizione: () => (typeof location === "undefined" ? "" : location.hash),
});

const CONTROLLO_OGNI_MS = 5_000;

export function avviaNavigatore(): void {
  window.addEventListener("hashchange", () => navigatore.suIndirizzo(location.hash));
  document.addEventListener("pointerdown", () => navigatore.attivita(), { capture: true, passive: true });
  document.addEventListener("keydown", () => navigatore.attivita(), { capture: true, passive: true });
  setInterval(() => navigatore.controlla(), CONTROLLO_OGNI_MS);
}
