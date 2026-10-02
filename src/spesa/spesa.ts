import { descriviErrore, log } from "../diagnostica";

/**
 * Lista della spesa (v0.5.7, mockup N2 "7 · Lista della spesa"): l'entità
 * todo di Home Assistant (`todo.shopping_list` di serie), la stessa che si
 * riempie a voce («aggiungi il latte»).
 *
 * Protocollo verificato sul sorgente di HA 2026.9.3 (components/todo):
 *  - `todo/item/subscribe {entity_id}`: subito la lista, poi a ogni cambio un
 *    evento `{items: [{uid, summary, status, …}]}`; status è `needs_action`
 *    o `completed`;
 *  - servizi con l'entità come target: `todo.add_item {item}`,
 *    `todo.update_item {item: uid, status}`, `todo.remove_item {item: [uid]}`,
 *    `todo.remove_completed_items`.
 */
export interface VoceSpesa {
  uid: string;
  testo: string;
  preso: boolean;
}

/** Dall'evento di `todo/item/subscribe` alle voci (quelle senza uid o testo si scartano). */
export function vociDa(dati: unknown): VoceSpesa[] {
  const items = (dati as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const uid = o["uid"];
    const testo = o["summary"];
    if (typeof uid !== "string" || !uid || typeof testo !== "string") return [];
    return [{ uid, testo, preso: o["status"] === "completed" }];
  });
}

/** Prima le cose da prendere (nell'ordine della lista), poi quelle prese. */
export function ordinaSpesa(voci: readonly VoceSpesa[]): VoceSpesa[] {
  return [...voci.filter((v) => !v.preso), ...voci.filter((v) => v.preso)];
}

export interface DipendenzeSpesa {
  /** `todo/item/subscribe`: chiama `f` a ogni cambio; ritorna la funzione per smettere. */
  iscrivi: (entita: string, f: (dati: unknown) => void) => Promise<() => Promise<void>>;
  /** `todo.<servizio>` con l'entità come target. */
  servizio: (servizio: string, dati: Record<string, unknown>, entita: string) => Promise<void>;
}

export class ListaSpesa {
  private elenco: VoceSpesa[] | null = null;
  private problema: string | null = null;
  private inCorso = 0;
  private smetti: (() => Promise<void>) | null = null;
  private entita = "";
  private readonly ascoltatori = new Set<() => void>();

  constructor(private readonly dip: DipendenzeSpesa) {}

  /** null finché la lista non arriva. */
  get voci(): readonly VoceSpesa[] | null {
    return this.elenco;
  }
  /** Perché la lista non c'è (entità mancante, HA giù), in parole. */
  get errore(): string | null {
    return this.problema;
  }
  /** Un comando aspetta la risposta di Home Assistant. */
  get occupata(): boolean {
    return this.inCorso > 0;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Si iscrive alla lista (e lascia quella di prima). */
  async apri(entita: string): Promise<void> {
    await this.chiudi();
    this.entita = entita;
    this.elenco = null;
    this.problema = null;
    this.notifica();
    try {
      const smetti = await this.dip.iscrivi(entita, (dati) => {
        if (this.entita !== entita) return;
        this.elenco = vociDa(dati);
        this.problema = null;
        this.notifica();
      });
      if (this.entita !== entita) {
        await smetti();
        return;
      }
      this.smetti = smetti;
    } catch (errore) {
      this.problema = descriviErrore(errore);
      log.avviso(`Spesa: ${entita} non letta (${this.problema})`);
      this.notifica();
    }
  }

  async chiudi(): Promise<void> {
    const smetti = this.smetti;
    this.smetti = null;
    this.entita = "";
    if (!smetti) return;
    try {
      await smetti();
    } catch (errore) {
      // la connessione può essere già chiusa: l'iscrizione è morta con lei
      log.info(`Spesa: iscrizione già chiusa (${descriviErrore(errore)})`);
    }
  }

  /** Aggiunge una cosa da prendere. Ritorna l'errore in parole, o null. */
  aggiungi(testo: string): Promise<string | null> {
    const t = testo.trim();
    if (!t) return Promise.resolve("Scrivi cosa aggiungere.");
    return this.esegui("add_item", { item: t }, `aggiunto «${t}»`);
  }

  segna(uid: string, preso: boolean): Promise<string | null> {
    return this.esegui(
      "update_item",
      { item: uid, status: preso ? "completed" : "needs_action" },
      preso ? "preso" : "da prendere",
    );
  }

  togli(uid: string): Promise<string | null> {
    return this.esegui("remove_item", { item: [uid] }, "tolto");
  }

  togliPresi(): Promise<string | null> {
    return this.esegui("remove_completed_items", {}, "tolte le cose prese");
  }

  private async esegui(
    servizio: string,
    dati: Record<string, unknown>,
    cosa: string,
  ): Promise<string | null> {
    if (!this.entita) return "La lista non è aperta.";
    this.inCorso += 1;
    this.notifica();
    try {
      await this.dip.servizio(servizio, dati, this.entita);
      log.info(`Spesa: ${cosa}`);
      return null;
    } catch (errore) {
      const e = descriviErrore(errore);
      log.avviso(`Spesa: ${servizio} non riuscito (${e})`);
      return e;
    } finally {
      this.inCorso -= 1;
      this.notifica();
    }
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Spesa: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
