import { callService } from "home-assistant-js-websocket";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { servizioScena, type Scena } from "./scene";

/**
 * Attiva una scena (schermata Scene e pulsanti della Casa). Si dice
 * «avviata», non «fatta»: lo script gira in Home Assistant e quello che fa
 * davvero si vede nelle card (e, per Esco, nella notifica sul telefono).
 * Ritorna true se Home Assistant l'ha accettata.
 */
export async function attivaScena(s: Scena): Promise<boolean> {
  const conn = connessione.conn;
  if (!conn?.connected || connessione.stato.stato !== "connesso") {
    avvisi.mostra(`${s.nome}: Home Assistant non è raggiungibile, scena non avviata`, "errore");
    return false;
  }
  if (!s.esiste) {
    avvisi.mostra(`${s.nome}: ${s.entita} non c'è in Home Assistant`, "errore");
    return false;
  }
  const { dominio, servizio } = servizioScena(s.entita);
  try {
    await callService(conn, dominio, servizio, undefined, { entity_id: s.entita });
    log.info(`Scena ${s.nome} avviata (${s.entita})`);
    avvisi.mostra(`${s.nome}: avviata`);
    return true;
  } catch (errore) {
    avvisi.mostra(`${s.nome}: non avviata (${descriviErrore(errore)})`, "errore");
    return false;
  }
}
