import { descriviErrore, log } from "../diagnostica/log";
import { deveRicaricare, giornoDi } from "./ricarica-notturna";

/**
 * Service worker e aggiornamenti controllati.
 *
 * Una versione nuova si scarica in silenzio ma NON si attiva a sorpresa mentre
 * qualcuno usa il pannello: si applica con la ricarica notturna delle 04:00 (o
 * a mano dalla diagnostica, "Aggiorna ora").
 *
 * Eccezione (v0.4.4), perché il pannello non torni MAI a una versione vecchia:
 * all'AVVIO, finché nessuno ha toccato lo schermo (al massimo 2 minuti), una
 * versione nuova in attesa si applica subito. Il 30/09 il tablet si è riaperto
 * su una versione vecchia: con due origini, quella su cui non si resta aveva un
 * aggiornamento in attesa che la ricarica delle 04:00 (fatta sull'altra
 * origine) non applicava mai. Protezione contro i giri: al massimo una volta al
 * minuto per sessione.
 */
let registrazione: ServiceWorkerRegistration | null = null;
const INTERVALLO_CONTROLLO_MS = 6 * 60 * 60_000;
/** Finestra dell'avvio in cui una versione in attesa si applica da sola (se nessuno tocca). */
export const FINESTRA_AVVIO_MS = 2 * 60_000;
const CHIAVE_APPLICATA_ALL_AVVIO = "jarvis-aggiornata-all-avvio";
const avviatoAlle = Date.now();
let toccato = false;
for (const evento of ["pointerdown", "keydown"])
  document.addEventListener(evento, () => (toccato = true), { passive: true, once: true, capture: true });

let versioneServer: string | null = null;
/** Versione dell'app sul server (letta da sw.js), per la diagnostica. */
export function versioneSulServer(): string | null {
  return versioneServer;
}

async function leggiVersioneServer(): Promise<void> {
  try {
    const r = await fetch("./sw.js", { cache: "no-store" });
    const trovata = /const VERSIONE = "([^"]+)"/.exec(await r.text())?.[1] ?? null;
    if (trovata && trovata !== versioneServer && trovata !== __VERSIONE__)
      log.info(`Sul server c'è la versione ${trovata} (qui gira la ${__VERSIONE__})`);
    versioneServer = trovata;
  } catch (errore) {
    log.avviso(`Versione sul server non leggibile: ${descriviErrore(errore)}`);
  }
}

/** All'avvio e senza tocchi: la versione in attesa si applica subito. */
function applicaSeAllAvvio(motivo: string): void {
  if (!registrazione?.waiting) return;
  if (toccato || Date.now() - avviatoAlle > FINESTRA_AVVIO_MS) return;
  try {
    const ultima = Number(sessionStorage.getItem(CHIAVE_APPLICATA_ALL_AVVIO) ?? 0);
    if (Date.now() - ultima < 60_000) {
      log.avviso(
        "Versione in attesa non applicata all'avvio: già fatto meno di un minuto fa (evito un giro)",
      );
      return;
    }
    sessionStorage.setItem(CHIAVE_APPLICATA_ALL_AVVIO, String(Date.now()));
  } catch (errore) {
    log.avviso(`Versione in attesa non applicata all'avvio: ${descriviErrore(errore)}`);
    return;
  }
  log.info(`Versione nuova ${motivo}: la applico subito, nessuno ha ancora toccato il pannello`);
  applicaAggiornamento();
}

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
        if (nuovo.state !== "installed" || !navigator.serviceWorker.controller) return;
        log.info("Nuova versione dell'app scaricata: si applica alle 04:00");
        void leggiVersioneServer();
        applicaSeAllAvvio("scaricata all'avvio");
      });
    });
    applicaSeAllAvvio("già in attesa all'avvio");
    void leggiVersioneServer();
    setInterval(() => {
      registrazione?.update().catch((errore: unknown) => {
        log.avviso(`Controllo aggiornamenti fallito: ${descriviErrore(errore)}`);
      });
      void leggiVersioneServer();
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

/** `occupato`: un timer in corso o che suona. La ricarica lo perderebbe: si aspetta (la finestra dura un'ora). */
export function avviaRicaricaNotturna(occupato: () => boolean = () => false): void {
  const segna = (): void => {
    ultimaInterazione = Date.now();
  };
  document.addEventListener("pointerdown", segna, { passive: true });
  document.addEventListener("keydown", segna, { passive: true });
  setInterval(() => {
    const adesso = new Date();
    if (!deveRicaricare(adesso, ultimaInterazione, leggiUltimaRicarica())) return;
    if (occupato()) {
      log.info("Ricarica notturna rimandata: c'è un timer in corso");
      return;
    }
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
