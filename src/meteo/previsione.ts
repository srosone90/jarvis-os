import type { Connection } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica";
import type { PrevisioneGiorno } from "./testi";

interface EventoPrevisione {
  type: string;
  forecast: PrevisioneGiorno[] | null;
}

/**
 * Previsione giornaliera in push (`weather/subscribe_forecast`): niente
 * interrogazioni periodiche al server. La libreria la risottoscrive da sola
 * dopo ogni riconnessione.
 */
export async function osservaPrevisione(
  conn: Connection,
  entita: string,
  f: (previsione: PrevisioneGiorno[]) => void,
  tipo: "daily" | "hourly" = "daily",
): Promise<(() => Promise<void>) | null> {
  try {
    return await conn.subscribeMessage<EventoPrevisione>((evento) => f(evento.forecast ?? []), {
      type: "weather/subscribe_forecast",
      entity_id: entita,
      forecast_type: tipo,
    });
  } catch (errore) {
    log.errore(`Previsione meteo (${tipo}) non disponibile per ${entita}: ${descriviErrore(errore)}`);
    return null;
  }
}
