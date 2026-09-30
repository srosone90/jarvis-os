import { connessione } from "./connessione/connessione";
import { descriviErrore, log } from "./diagnostica/log";
import { avviaRicaricaNotturna, registraServiceWorker } from "./pwa/aggiornamenti";
import { passaAllOrigineVeloce, sorvegliaRitorno } from "./pwa/origine";
import "./ui/jarvis-app";
import { audioSveglio } from "./voce/audio-sveglio";
import { vista } from "./vista/istanza";

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
// fase G: riposo dopo i minuti senza tocchi, Hub, pannello completo
vista.avvia();
// audio impercettibile per l'Echo in Bluetooth (v0.4.5): parte subito o al primo tocco
audioSveglio.avvia();
avviaRicaricaNotturna(() => connessione.timer.occupato);
void connessione.avvia();
sorvegliaRitorno(() => connessione.stato);
