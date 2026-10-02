import type { HassEntities } from "home-assistant-js-websocket";
import { dominio } from "../casa";

/**
 * Avvisi ed eventi (v0.5.7, mockup N2 "8 · Avvisi ed eventi"): cosa è
 * successo in casa. Tre fonti, tutte vere:
 *  - **dispositivi**: il registro di Home Assistant (`logbook/get_events`,
 *    verificato sul sorgente di HA 2026.9.3: righe `{entity_id, state, when}`
 *    con `when` in secondi, più `context_user_id` / `context_entity_id`
 *    quando il cambio l'ha chiesto qualcuno o qualcosa);
 *  - **batterie**: lo stato di adesso dei sensori di batteria (il registro
 *    salta i sensori che cambiano di continuo, quindi da lì non arriverebbero);
 *  - **connessione**: le interruzioni viste da questo pannello (Home Assistant
 *    irraggiungibile non lo può scrivere nel suo registro).
 */
export type TipoEvento = "dispositivo" | "batteria" | "connessione";

export interface EventoCasa {
  /** Chiave stabile per la lista. */
  chiave: string;
  quando: number;
  tipo: TipoEvento;
  titolo: string;
  /** "accensione", "ventola", "12%"… */
  stato: string;
  /** Chi l'ha chiesto ("da Jarvis · Esco"), o null. */
  da: string | null;
  /** Dominio dell'entità, per l'icona. */
  dominio: string;
}

const CLIMA: Record<string, string> = {
  off: "spegnimento",
  cool: "freddo",
  heat: "caldo",
  fan_only: "ventola",
  dry: "deumidifica",
  heat_cool: "automatico",
  auto: "automatico",
};
const MEDIA: Record<string, string> = {
  on: "accensione",
  idle: "accensione",
  playing: "in riproduzione",
  paused: "in pausa",
  off: "spegnimento",
  standby: "spegnimento",
};
const COPERTURA: Record<string, string> = { open: "apertura", closed: "chiusura" };
const SERRATURA: Record<string, string> = { locked: "chiusura a chiave", unlocked: "apertura" };

/**
 * Lo stato in parole, senza genere ("accensione", non "acceso/accesa": il
 * nome del dispositivo può essere maschile o femminile). null = da non
 * mostrare (stato sconosciuto, passaggi intermedi).
 */
export function testoStato(dom: string, stato: string): string | null {
  if (stato === "unavailable") return "non raggiungibile";
  if (stato === "unknown" || stato === "") return null;
  const tabella =
    dom === "climate"
      ? CLIMA
      : dom === "media_player"
        ? MEDIA
        : dom === "cover"
          ? COPERTURA
          : dom === "lock"
            ? SERRATURA
            : null;
  if (tabella) return tabella[stato] ?? null;
  if (stato === "on") return "accensione";
  if (stato === "off") return "spegnimento";
  return stato;
}

/** Riga di `logbook/get_events` (solo i campi che servono). */
interface RigaRegistro {
  entity_id?: unknown;
  state?: unknown;
  when?: unknown;
  context_user_id?: unknown;
  context_entity_id?: unknown;
}

/**
 * Dalle righe del registro agli eventi dei dispositivi, dal più recente.
 * `nomeDi` dà il nome leggibile di un'entità (il registro non lo manda:
 * `include_entity_name` è spento per le chiamate dal websocket).
 */
export function eventiDaRegistro(righe: unknown, nomeDi: (entita: string) => string): EventoCasa[] {
  if (!Array.isArray(righe)) return [];
  const eventi: EventoCasa[] = [];
  for (const [i, r] of (righe as RigaRegistro[]).entries()) {
    if (typeof r?.entity_id !== "string" || typeof r.state !== "string" || typeof r.when !== "number")
      continue;
    const dom = dominio(r.entity_id);
    const stato = testoStato(dom, r.state);
    if (!stato) continue;
    const ctx = typeof r.context_entity_id === "string" && r.context_entity_id ? r.context_entity_id : null;
    const da = ctx
      ? `da ${nomeDi(ctx)}`
      : typeof r.context_user_id === "string" && r.context_user_id
        ? "da un utente"
        : null;
    eventi.push({
      chiave: `d-${r.entity_id}-${r.when}-${i}`,
      quando: r.when * 1000,
      tipo: "dispositivo",
      titolo: nomeDi(r.entity_id),
      stato,
      da,
      dominio: dom,
    });
  }
  return eventi.sort((a, b) => b.quando - a.quando);
}

export interface BatteriaBassa {
  entita: string;
  nome: string;
  /** Percentuale, o null se il sensore dice solo "bassa" (binary_sensor). */
  livello: number | null;
}

/** Le batterie sotto la soglia adesso (sensori con device_class battery), dalla più scarica. */
export function batterieBasse(stati: HassEntities, soglia: number): BatteriaBassa[] {
  const basse: BatteriaBassa[] = [];
  for (const [entita, s] of Object.entries(stati)) {
    if (s.attributes["device_class"] !== "battery") continue;
    const nome = typeof s.attributes["friendly_name"] === "string" ? s.attributes["friendly_name"] : entita;
    const dom = dominio(entita);
    if (dom === "binary_sensor") {
      if (s.state === "on") basse.push({ entita, nome, livello: null });
      continue;
    }
    if (dom !== "sensor") continue;
    const n = Number(s.state);
    if (s.state.trim() !== "" && Number.isFinite(n) && n < soglia)
      basse.push({ entita, nome, livello: Math.round(n) });
  }
  return basse.sort((a, b) => (a.livello ?? -1) - (b.livello ?? -1));
}

const ora = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** "oggi 13:02", "ieri 02:19", "lun 28, 09:15". */
export function quandoTesto(ms: number, adesso: number): string {
  const d = new Date(ms);
  const oggi = new Date(adesso);
  oggi.setHours(0, 0, 0, 0);
  const giorno = new Date(ms);
  giorno.setHours(0, 0, 0, 0);
  const giorni = Math.round((oggi.getTime() - giorno.getTime()) / 86_400_000);
  if (giorni === 0) return `oggi ${ora(d)}`;
  if (giorni === 1) return `ieri ${ora(d)}`;
  const nome = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
  return `${nome}, ${ora(d)}`;
}

/** "5 min", "1 h 20 min", "meno di 1 min". */
export function durataTesto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "meno di 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}
