import { descriviErrore, log } from "../diagnostica/log";
import { deveRicaricare, giornoDi } from "./ricarica-notturna";

/**
 * Service worker e aggiornamenti controllati.
 *
 * Una versione nuova si scarica in silenzio ma NON si attiva a sorpresa mentre
 * qualcuno usa il pannello: si applica con la ricarica notturna delle 04:00 (o
 * a mano dalla diagnostica, "Aggiorna ora").
 */
let registrazione: ServiceWorkerRegistration | null = null;
const INTERVALLO_CONTROLLO_MS = 6 * 60 * 60_000;

export type StatoAggiornamento = "nessuno" | "in-download" | "pronto" | "non-supportato";

/** Letto a ogni ridisegno della diagnostica (ogni secondo mentre è aperta). */
export function statoAggiornamento(): StatoAggiornamento {
  if (!registrazione) return "non-supportato";
  if (registrazione.waiting) return "pronto";
  // Sull'indirizzo HTTPS scaricare la versione nuova richiede qualche secondo:
  // meglio dirlo che mostrare "nessuno" nel frattempo.
  return registrazione.installing ? "in-download" : "nessuno";
}

export async function registraServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    log.avviso("Service worker non supportato: niente cache offline");
    return;
  }
  try {
    // HA serve /local/ con una cache HTTP di un mese: il controllo degli
    // aggiornamenti deve sempre chiedere sw.js al server.
    registrazione = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
      updateViaCache: "none",
    });
    registrazione.addEventListener("updatefound", () => {
      const nuovo = registrazione?.installing;
      nuovo?.addEventListener("statechange", () => {
        if (nuovo.state === "installed" && navigator.serviceWorker.controller)
          log.info("Nuova versione dell'app scaricata: si applica alle 04:00");
      });
    });
    setInterval(() => {
      registrazione?.update().catch((errore: unknown) => {
        log.avviso(`Controllo aggiornamenti fallito: ${descriviErrore(errore)}`);
      });
    }, INTERVALLO_CONTROLLO_MS);
  } catch (errore) {
    log.errore(`Registrazione del service worker fallita: ${descriviErrore(errore)}`);
  }
}

/** Attiva la versione in attesa (se c'è) e ricarica. */
export function applicaAggiornamento(): void {
  const inAttesa = registrazione?.waiting;
  if (!inAttesa) {
    location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  inAttesa.postMessage({ tipo: "attiva-subito" });
  // Se per qualche motivo il cambio non arriva, si ricarica comunque.
  setTimeout(() => location.reload(), 5000);
}

// --- Ricarica di sicurezza notturna -------------------------------------------

const CHIAVE_ULTIMA_RICARICA = "jarvis-ultima-ricarica";
let ultimaInterazione = Date.now();

function leggiUltimaRicarica(): string | null {
  try {
    return localStorage.getItem(CHIAVE_ULTIMA_RICARICA);
  } catch (errore) {
    log.avviso(`Data dell'ultima ricarica illeggibile: ${descriviErrore(errore)}`);
    return null;
  }
}

export function avviaRicaricaNotturna(): void {
  const segna = (): void => {
    ultimaInterazione = Date.now();
  };
  document.addEventListener("pointerdown", segna, { passive: true });
  document.addEventListener("keydown", segna, { passive: true });
  setInterval(() => {
    const adesso = new Date();
    if (!deveRicaricare(adesso, ultimaInterazione, leggiUltimaRicarica())) return;
    try {
      localStorage.setItem(CHIAVE_ULTIMA_RICARICA, giornoDi(adesso));
    } catch (errore) {
      // Senza la data salvata si rischierebbe di ricaricare in loop: meglio saltare stanotte.
      log.errore(`Ricarica notturna saltata, impossibile salvare la data: ${descriviErrore(errore)}`);
      return;
    }
    log.info("Ricarica notturna di sicurezza");
    applicaAggiornamento();
  }, 60_000);
}
