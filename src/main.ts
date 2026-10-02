import { connessione } from "./connessione";
import { descriviErrore, log } from "./diagnostica";
import { avviaRicaricaNotturna, passaAllOrigineVeloce, registraServiceWorker, sorvegliaRitorno } from "./pwa";
import "./ui/jarvis-app";
import "./ui/jarvis-spia-fotocamera";
import { audioSveglio } from "./voce/audio-sveglio";
import { avviaNavigatore } from "./navigazione/istanza";
import { vista } from "./vista/istanza";

// Nessun errore deve sparire in silenzio: tutto finisce nel log diagnostico.
window.addEventListener("error", (e) => log.errore(`Errore: ${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) =>
  log.errore(`Promessa rifiutata: ${descriviErrore(e.reason)}`),
);

log.info(`Avvio Jarvis OS ${__VERSIONE__} su ${location.origin}`);
// In parallelo all'avvio, mai bloccante: dalla riserva si passa alla veloce se risponde.
passaAllOrigineVeloce();
document.body.append(document.createElement("jarvis-app"), document.createElement("jarvis-spia-fotocamera"));

if (import.meta.env.PROD) void registraServiceWorker();
// fase G: riposo dopo i minuti senza tocchi, Hub, pannello completo
vista.avvia();
avviaNavigatore();
// audio impercettibile per l'Echo in Bluetooth (v0.4.5): parte subito o al primo tocco
audioSveglio.avvia();
// «Jarvis» sempre in ascolto (v0.5.0): acceso di serie, si spegne in Impostazioni → Voce
connessione.parola.avvia();
// fotocamera (v0.6.0): chi si avvicina sveglia il pannello (se dorme); spenta di notte
connessione.presenza.alArrivo = () => {
  if (vista.vista === "riposo") vista.vai("completo", "qualcuno si è avvicinato");
  else vista.attivita();
};
connessione.presenza.avvia();
avviaRicaricaNotturna(() => connessione.timer.occupato);
void connessione.avvia();
sorvegliaRitorno(() => connessione.stato);
