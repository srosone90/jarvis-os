import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

/**
 * Archivio delle entità con notifiche PER ENTITÀ: a ogni aggiornamento da HA
 * si avvisa solo chi osserva le entità che sono davvero cambiate, così un
 * sensore che cambia non ridisegna l'intera pagina.
 *
 * `subscribeEntities` crea un oggetto nuovo solo per le entità cambiate e
 * riusa gli altri: basta confrontare i riferimenti.
 */
export class Negozio {
  private entita: HassEntities = {};
  private caricato = false;
  private readonly osservatori = new Map<string, Set<() => void>>();
  private readonly osservatoriCarico = new Set<() => void>();

  aggiorna(nuove: HassEntities): string[] {
    const vecchie = this.entita;
    const cambiate: string[] = [];
    for (const id of Object.keys(nuove)) if (nuove[id] !== vecchie[id]) cambiate.push(id);
    for (const id of Object.keys(vecchie)) if (!(id in nuove)) cambiate.push(id);
    this.entita = nuove;
    const primaVolta = !this.caricato;
    this.caricato = true;
    for (const id of cambiate) for (const f of this.osservatori.get(id) ?? []) f();
    if (primaVolta) for (const f of this.osservatoriCarico) f();
    return cambiate;
  }

  /** true dopo il primo elenco completo ricevuto da HA. */
  get pronto(): boolean {
    return this.caricato;
  }

  get tutte(): HassEntities {
    return this.entita;
  }

  get quante(): number {
    return Object.keys(this.entita).length;
  }

  entitaDi(id: string): HassEntity | undefined {
    return this.entita[id];
  }

  osserva(ids: readonly string[], f: () => void): () => void {
    for (const id of ids) {
      let insieme = this.osservatori.get(id);
      if (!insieme) this.osservatori.set(id, (insieme = new Set()));
      insieme.add(f);
    }
    this.osservatoriCarico.add(f);
    return () => {
      for (const id of ids) this.osservatori.get(id)?.delete(f);
      this.osservatoriCarico.delete(f);
    };
  }
}
