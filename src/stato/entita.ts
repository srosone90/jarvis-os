import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

/**
 * Aggiornamenti compressi di `subscribe_entities` (formato di Home Assistant):
 *   a = entità aggiunte/sostituite per intero
 *   c = differenze su entità esistenti ("+" da aggiungere, "-" attributi da togliere)
 *   r = entità rimosse
 */
interface StatoCompresso {
  s: string;
  a: Record<string, unknown>;
  c: string | { id: string; parent_id: string | null; user_id: string | null };
  lc: number;
  lu?: number;
}

interface Differenza {
  "+"?: Partial<StatoCompresso>;
  "-"?: { a?: string[] };
}

export interface AggiornamentoEntita {
  a?: Record<string, StatoCompresso>;
  c?: Record<string, Differenza>;
  r?: string[];
}

function contesto(
  c: StatoCompresso["c"] | undefined,
  precedente?: HassEntity["context"],
): HassEntity["context"] {
  if (c === undefined) return precedente ?? { id: "", parent_id: null, user_id: null };
  return typeof c === "string" ? { ...(precedente ?? { parent_id: null, user_id: null }), id: c } : c;
}

/**
 * Applica un aggiornamento e restituisce il NUOVO elenco. Le entità non toccate
 * mantengono lo stesso oggetto (il negozio lo usa per sapere cosa è cambiato).
 *
 * `completo = true` per il primo messaggio dopo una (ri)sottoscrizione: HA manda
 * lo stato intero di tutte le entità, e quello SOSTITUISCE il precedente. La
 * libreria ufficiale invece lo fonde col vecchio stato, lasciando "fantasmi" le
 * entità cancellate in HA mentre il pannello era offline.
 */
export function applicaAggiornamento(
  precedenti: HassEntities,
  agg: AggiornamentoEntita,
  completo: boolean,
): HassEntities {
  const stato: HassEntities = completo ? {} : { ...precedenti };

  for (const [id, n] of Object.entries(agg.a ?? {})) {
    const lc = new Date(n.lc * 1000).toISOString();
    stato[id] = {
      entity_id: id,
      state: n.s,
      attributes: n.a,
      context: contesto(n.c),
      last_changed: lc,
      last_updated: n.lu ? new Date(n.lu * 1000).toISOString() : lc,
    };
  }

  const rimosse = new Set(agg.r ?? []);

  for (const [id, diff] of Object.entries(agg.c ?? {})) {
    const vecchia = stato[id];
    if (!vecchia) continue; // differenza su un'entità sconosciuta: arriverà per intero alla prossima risincronizzazione
    const piu = diff["+"];
    const meno = diff["-"];
    const nuova: HassEntity = { ...vecchia };
    if (piu?.s !== undefined) nuova.state = piu.s;
    if (piu?.c !== undefined) nuova.context = contesto(piu.c, vecchia.context);
    if (piu?.lc) nuova.last_updated = nuova.last_changed = new Date(piu.lc * 1000).toISOString();
    else if (piu?.lu) nuova.last_updated = new Date(piu.lu * 1000).toISOString();
    if (piu?.a || meno?.a) {
      const togli = new Set(meno?.a ?? []);
      nuova.attributes = Object.fromEntries(
        Object.entries({ ...vecchia.attributes, ...(piu?.a ?? {}) }).filter(([chiave]) => !togli.has(chiave)),
      );
    }
    stato[id] = nuova;
  }
  if (rimosse.size === 0) return stato;
  return Object.fromEntries(Object.entries(stato).filter(([id]) => !rimosse.has(id)));
}
