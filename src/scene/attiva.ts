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

/** Quanto resta valido il primo tocco quando le scene chiedono conferma (v0.5.8; di serie, si cambia dalla v0.5.10). */
export const CONFERMA_SCENA_MS = 4000;

/**
 * Conferma prima delle scene (v0.5.8, Impostazioni → Schermate → Scene,
 * spenta di serie): il primo tocco chiede «Tocca ancora», il secondo entro
 * 4 s avvia. Toccare un'altra scena sposta la richiesta su quella. Uguale
 * nella schermata Scene e nei pulsanti della Casa.
 */
export class ConfermaScena {
  private attesa: string | null = null;
  private scadenza: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly ridisegna: () => void) {}

  /** true = avviala adesso; false = primo tocco, aspetta il secondo (per `ms`, v0.5.10). */
  tocca(entita: string, chiedi: boolean, ms = CONFERMA_SCENA_MS): boolean {
    if (!chiedi || this.attesa === entita) {
      this.annulla();
      return true;
    }
    clearTimeout(this.scadenza);
    this.attesa = entita;
    this.scadenza = setTimeout(() => this.annulla(), ms);
    this.ridisegna();
    return false;
  }

  inAttesa(entita: string): boolean {
    return this.attesa === entita;
  }

  annulla(): void {
    clearTimeout(this.scadenza);
    if (this.attesa === null) return;
    this.attesa = null;
    this.ridisegna();
  }
}
