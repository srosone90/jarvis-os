import { connessione } from "./connessione/connessione";
import { descriviErrore, log } from "./diagnostica/log";
import { avviaRicaricaNotturna, registraServiceWorker } from "./pwa/aggiornamenti";
import { passaAllOrigineVeloce, sorvegliaRitorno } from "./pwa/origine";
import "./ui/jarvis-app";

// Nessun errore deve sparire in silenzio: tutto finisce nel log diagnostico.
window.addEventListener("error", (e) => log.errore(`Errore: ${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) =>
  log.errore(`Promessa rifiutata: ${descriviErrore(e.reason)}`),
);

log.info(`Avvio Jarvis OS ${__VERSIONE__} su ${location.origin}`);
// In parallelo all'avvio, mai bloccante: dalla riserva si passa alla veloce se risponde.
passaAllOrigineVeloce();
document.body.append(document.createElement("jarvis-app"));

if (import.meta.env.PROD) void registraServiceWorker();
avviaRicaricaNotturna();
void connessione.avvia();
sorvegliaRitorno(() => connessione.stato);
