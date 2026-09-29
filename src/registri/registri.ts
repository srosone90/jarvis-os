import type { Connection } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica/log";
import type { Area, Dispositivo, EntitaRegistro } from "./modello";

const EVENTI = ["area_registry_updated", "device_registry_updated", "entity_registry_updated"] as const;
/** Più modifiche ravvicinate (es. un'integrazione che aggiunge 10 entità) = una sola rilettura. */
const ATTESA_RILETTURA_MS = 1000;

/**
 * Aree, dispositivi ed entità dai registri di Home Assistant.
 *
 * Si leggono all'avvio e dopo ogni riconnessione (mentre il pannello era
 * offline qualcosa può essere cambiato), e si rileggono quando HA avvisa che un
 * registro è cambiato. Nessun polling: sul Redmi ogni richiesta inutile pesa.
 */
export class Registri {
  aree: Area[] = [];
  dispositivi: Dispositivo[] = [];
  entita: EntitaRegistro[] = [];
  caricati = false;
  private readonly ascoltatori = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private connIscritta: Connection | null = null;

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Da chiamare a ogni (ri)connessione. */
  async collega(conn: Connection): Promise<void> {
    if (this.connIscritta !== conn) {
      this.connIscritta = conn;
      for (const tipo of EVENTI) {
        try {
          // la libreria rinnova da sola le iscrizioni dopo ogni riconnessione
          await conn.subscribeEvents(() => this.rileggiTraPoco(conn), tipo);
        } catch (errore) {
          log.errore(`Impossibile ascoltare ${tipo}: ${descriviErrore(errore)}`);
        }
      }
    }
    await this.carica(conn);
  }

  private rileggiTraPoco(conn: Connection): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.carica(conn), ATTESA_RILETTURA_MS);
  }

  async carica(conn: Connection): Promise<void> {
    try {
      const [aree, dispositivi, entita] = await Promise.all([
        conn.sendMessagePromise<Area[]>({ type: "config/area_registry/list" }),
        conn.sendMessagePromise<Dispositivo[]>({ type: "config/device_registry/list" }),
        conn.sendMessagePromise<{ entities: EntitaRegistro[] }>({
          type: "config/entity_registry/list_for_display",
        }),
      ]);
      this.aree = aree;
      this.dispositivi = dispositivi;
      this.entita = entita.entities;
      this.caricati = true;
      for (const f of this.ascoltatori) f();
    } catch (errore) {
      // Si tengono i registri di prima: meglio stanze un po' vecchie che nessuna stanza.
      log.errore(`Lettura dei registri di HA fallita: ${descriviErrore(errore)}`);
    }
  }
}
