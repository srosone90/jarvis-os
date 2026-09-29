import type { HassEntities } from "home-assistant-js-websocket";
import type { ClimaStanza, Preferenze } from "../configurazione";

/** Dai registri di Home Assistant (formati di config/*_registry/list*). */
export interface Area {
  area_id: string;
  name: string;
}

export interface Dispositivo {
  id: string;
  area_id: string | null;
  name: string | null;
  name_by_user: string | null;
  disabled_by: string | null;
}

/** Voce di config/entity_registry/list_for_display (chiavi compatte di HA). */
export interface EntitaRegistro {
  ei: string; // entity_id
  pl?: string; // integrazione
  di?: string; // device_id
  ai?: string; // area_id (se diversa da quella del dispositivo)
  ec?: number; // categoria (config/diagnostica): non si mostra
  hb?: boolean; // nascosta in HA
  en?: string; // nome
}

export type TipoCard = "clima" | "media" | "interruttore" | "non-supportato";

export interface Card {
  /** device_id, o entity_id per le entità senza dispositivo. */
  id: string;
  nome: string;
  /** L'entità che la card comanda (una per dispositivo). */
  entita: string;
  tipo: TipoCard;
}

export interface StanzaVista {
  areaId: string;
  nome: string;
  /** Zona della griglia (mockup approvato); assente per le stanze nuove. */
  zona?: string;
  clima?: ClimaStanza;
  card: Card[];
}

/**
 * Domini che diventano una card, in ordine di priorità: per ogni dispositivo si
 * sceglie l'entità col dominio più in alto. Così il condizionatore (climate +
 * switch) e la TV (media_player + remote) diventano UNA card ciascuno.
 * Tutto il resto (sensori, remote, pulsanti, aggiornamenti…) non fa una card.
 */
const PRIORITA: Record<string, number> = {
  climate: 1,
  media_player: 2,
  cover: 3,
  fan: 4,
  light: 5,
  lock: 6,
  vacuum: 7,
  switch: 8,
};

const TIPO: Record<string, TipoCard> = {
  climate: "clima",
  media_player: "media",
  switch: "interruttore",
};

export function dominio(entityId: string): string {
  return entityId.slice(0, entityId.indexOf("."));
}

function normalizza(testo: string): string {
  return testo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Una stanza delle preferenze corrisponde a un'area se coincide l'id o il nome. */
function stessaArea(area: Area, nomePreferenza: string): boolean {
  const n = normalizza(nomePreferenza);
  return area.area_id === n || normalizza(area.name) === n;
}

/**
 * Costruisce le stanze del pannello dai registri. Funzione pura: stessi
 * ingressi, stessa uscita, provata con Vitest.
 *
 * - Una card per dispositivo, con l'entità di dominio più importante.
 * - Esclusi: entità nascoste in HA, di configurazione/diagnostica, dispositivi
 *   disattivati, entità nascoste nelle preferenze.
 * - L'area di un'entità è la sua (se impostata) o quella del suo dispositivo.
 * - Le stanze delle preferenze vengono prima, nel loro ordine e con la loro zona;
 *   le aree nuove si aggiungono in coda da sole.
 * - Una stanza senza card e senza clima (es. Cucina vuota) non si mostra.
 */
export function costruisciStanze(
  aree: readonly Area[],
  dispositivi: readonly Dispositivo[],
  entita: readonly EntitaRegistro[],
  stati: HassEntities,
  preferenze: Preferenze,
): StanzaVista[] {
  const perDispositivo = new Map(dispositivi.map((d) => [d.id, d]));
  const nascoste = new Set(preferenze.nascoste);
  // chiave (area|dispositivo o entità) → migliore entità
  const scelte = new Map<string, { areaId: string; card: Card; priorita: number }>();

  for (const e of entita) {
    const dom = dominio(e.ei);
    const priorita = PRIORITA[dom];
    if (priorita === undefined) continue;
    if (e.hb || e.ec !== undefined || nascoste.has(e.ei)) continue;
    const disp = e.di ? perDispositivo.get(e.di) : undefined;
    if (disp?.disabled_by) continue;
    if (disp && nascoste.has(disp.id)) continue;
    const areaId = e.ai ?? disp?.area_id ?? null;
    if (!areaId) continue;
    const id = disp?.id ?? e.ei;
    const nomeStato = stati[e.ei]?.attributes["friendly_name"];
    const nome =
      disp?.name_by_user ??
      disp?.name ??
      e.en ??
      (typeof nomeStato === "string" ? nomeStato : undefined) ??
      e.ei;
    const chiave = `${areaId}|${id}`;
    const attuale = scelte.get(chiave);
    if (attuale && attuale.priorita <= priorita) continue;
    scelte.set(chiave, {
      areaId,
      priorita,
      card: { id, nome, entita: e.ei, tipo: TIPO[dom] ?? "non-supportato" },
    });
  }

  const cardPerArea = new Map<string, { card: Card; priorita: number }[]>();
  for (const { areaId, card, priorita } of scelte.values()) {
    const elenco = cardPerArea.get(areaId) ?? [];
    elenco.push({ card, priorita });
    cardPerArea.set(areaId, elenco);
  }

  const ordinate = (areaId: string): Card[] =>
    (cardPerArea.get(areaId) ?? [])
      .sort((a, b) => a.priorita - b.priorita || a.card.nome.localeCompare(b.card.nome, "it"))
      .map((x) => x.card);

  const usate = new Set<string>();
  const risultato: StanzaVista[] = [];
  for (const pref of preferenze.stanze) {
    const area = aree.find((a) => !usate.has(a.area_id) && stessaArea(a, pref.area));
    if (!area) continue;
    usate.add(area.area_id);
    const card = ordinate(area.area_id);
    if (card.length === 0 && !pref.clima) continue;
    risultato.push({
      areaId: area.area_id,
      nome: area.name,
      zona: pref.zona,
      ...(pref.clima ? { clima: pref.clima } : {}),
      card,
    });
  }
  for (const area of [...aree].sort((a, b) => a.name.localeCompare(b.name, "it"))) {
    if (usate.has(area.area_id)) continue;
    const card = ordinate(area.area_id);
    if (card.length === 0) continue;
    risultato.push({ areaId: area.area_id, nome: area.name, card });
  }
  return risultato;
}
