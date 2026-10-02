import { describe, expect, it } from "vitest";

import { ListaSpesa, ordinaSpesa, vociDa } from "../../../src/spesa/spesa";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

describe("lista della spesa", () => {
  const items = {
    items: [
      { uid: "1", summary: "latte", status: "needs_action" },
      { uid: "2", summary: "caffè", status: "completed" },
      { uid: "", summary: "senza uid", status: "needs_action" },
      { uid: "3", summary: "pane", status: "needs_action", due: null },
      "spazzatura",
    ],
  };
  it("dall'evento di todo/item/subscribe: da prendere prima, prese in fondo; senza uid scartate", () => {
    const v = vociDa(items);
    expect(v.map((x) => x.testo)).toEqual(["latte", "caffè", "pane"]);
    expect(ordinaSpesa(v).map((x) => `${x.testo}${x.preso ? "✓" : ""}`)).toEqual(["latte", "pane", "caffè✓"]);
    expect(vociDa(null)).toEqual([]);
  });

  const lista = (opz: { rifiuta?: boolean; manca?: boolean } = {}) => {
    const chiamate: [string, Record<string, unknown>, string][] = [];
    let spingi: (d: unknown) => void = () => undefined;
    const smesse: string[] = [];
    const l = new ListaSpesa({
      iscrivi: (entita, f) => {
        if (opz.manca) return Promise.reject(new Error(`To-do list entity not found: ${entita}`));
        spingi = f;
        f(items);
        return Promise.resolve(() => {
          smesse.push(entita);
          return Promise.resolve();
        });
      },
      servizio: (s, d, e) => {
        chiamate.push([s, d, e]);
        return opz.rifiuta ? Promise.reject(new Error("Unable to find To-do item")) : Promise.resolve();
      },
    });
    return { l, chiamate, spingi: (d: unknown) => spingi(d), smesse };
  };

  it("i comandi passano da Home Assistant con l'uid; la lista cambia solo quando HA lo dice", async () => {
    const { l, chiamate, spingi } = lista();
    await l.apri("todo.shopping_list");
    expect(l.voci?.length).toBe(3);
    expect(await l.aggiungi("  uova ")).toBeNull();
    expect(await l.segna("1", true)).toBeNull();
    expect(await l.segna("2", false)).toBeNull();
    expect(await l.togli("3")).toBeNull();
    expect(await l.togliPresi()).toBeNull();
    expect(chiamate).toEqual([
      ["add_item", { item: "uova" }, "todo.shopping_list"],
      ["update_item", { item: "1", status: "completed" }, "todo.shopping_list"],
      ["update_item", { item: "2", status: "needs_action" }, "todo.shopping_list"],
      ["remove_item", { item: ["3"] }, "todo.shopping_list"],
      ["remove_completed_items", {}, "todo.shopping_list"],
    ]);
    // la lista sullo schermo è sempre quella di HA
    expect(l.voci?.length).toBe(3);
    spingi({ items: [{ uid: "9", summary: "uova", status: "needs_action" }] });
    expect(l.voci?.map((v) => v.testo)).toEqual(["uova"]);
  });
  it("testo vuoto: niente chiamata; errore di HA: in parole, e la lista resta", async () => {
    const { l, chiamate } = lista({ rifiuta: true });
    await l.apri("todo.shopping_list");
    expect(await l.aggiungi("   ")).toBe("Scrivi cosa aggiungere.");
    expect(chiamate).toEqual([]);
    expect(await l.togli("1")).toContain("Unable to find");
    expect(l.occupata).toBe(false);
    expect(l.voci?.length).toBe(3);
  });
  it("lista che non c'è: errore in parole, nessun comando parte", async () => {
    const { l, chiamate } = lista({ manca: true });
    await l.apri("todo.altra");
    expect(l.errore).toContain("not found");
    expect(l.voci).toBeNull();
    expect(chiamate).toEqual([]);
  });
  it("cambiando lista si lascia l'iscrizione di prima", async () => {
    const { l, smesse } = lista();
    await l.apri("todo.shopping_list");
    await l.apri("todo.altra");
    expect(smesse).toEqual(["todo.shopping_list"]);
    await l.chiudi();
    expect(smesse).toEqual(["todo.shopping_list", "todo.altra"]);
  });
});
