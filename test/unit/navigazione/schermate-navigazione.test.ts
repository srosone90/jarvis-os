import { describe, expect, it, vi } from "vitest";

import {
  cambiaDove,
  leggiPreferenzeNavigazione,
  Navigatore,
  PREFERENZE_NAVIGAZIONE_DI_SERIE,
} from "../../../src/navigazione/navigazione";

import {
  durateDa,
  ImpostazioniSchermate,
  leggiPreferenzeSchermate,
  PREFERENZE_SCHERMATE_DI_SERIE,
  sceneDa as elencoSceneDa,
} from "../../../src/navigazione/preferenze-schermate";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

const archivio = () => {
  const m = new Map<string, string>();
  return {
    m,
    a: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) },
  };
};

describe("navigazione: dove sta ogni schermata", () => {
  it("di serie come il mockup N2: Casa, Musica, Meteo, Timer, Altro; il resto in Altro", () => {
    const n = new Navigatore({ archivio: null });
    expect(n.colonna.map((c) => c.id)).toEqual(["casa", "musica", "meteo", "timer", "altro"]);
    expect(n.altro.map((c) => c.id)).toEqual([
      "casa",
      "musica",
      "meteo",
      "timer",
      "clima",
      "scene",
      "spesa",
      "avvisi",
    ]);
  });
  it("le preferenze della v0.5.6 (visibile) diventano colonna / Altro; le schermate nuove al loro posto di serie", () => {
    const p = leggiPreferenzeNavigazione(
      JSON.stringify({
        voci: [
          { id: "meteo", visibile: true },
          { id: "casa", visibile: false },
          { id: "musica", visibile: false },
        ],
      }),
    );
    expect(p.voci).toEqual([
      { id: "meteo", dove: "colonna" },
      { id: "casa", dove: "colonna" },
      { id: "musica", dove: "altro" },
      { id: "timer", dove: "colonna" },
      { id: "clima", dove: "altro" },
      { id: "scene", dove: "altro" },
      { id: "spesa", dove: "altro" },
      { id: "avvisi", dove: "altro" },
      { id: "altro", dove: "colonna" },
    ]);
  });
  it("Casa e Altro non si spostano né si spengono; una schermata spenta non è iniziale", () => {
    let voci = cambiaDove(PREFERENZE_NAVIGAZIONE_DI_SERIE.voci, "casa", "spenta");
    voci = cambiaDove(voci, "altro", "altro");
    voci = cambiaDove(voci, "meteo", "spenta");
    expect(voci.find((v) => v.id === "casa")?.dove).toBe("colonna");
    expect(voci.find((v) => v.id === "altro")?.dove).toBe("colonna");
    const p = leggiPreferenzeNavigazione(JSON.stringify({ voci, iniziale: "meteo" }));
    expect(p.iniziale).toBe("casa");
    expect(
      leggiPreferenzeNavigazione(JSON.stringify({ voci: [{ id: "spesa", dove: "boh" }] })).voci[0],
    ).toEqual({
      id: "spesa",
      dove: "altro",
    });
  });
  it("spenta: niente colonna, niente Altro, e non si apre (nemmeno dall'indirizzo)", () => {
    const { a } = archivio();
    const n = new Navigatore({ archivio: a, posizione: () => "#spesa" });
    expect(n.pagina).toEqual({ tipo: "spesa" });
    n.cambiaPreferenze({ voci: cambiaDove(n.preferenze.voci, "spesa", "spenta") });
    // era aperta: si torna a Casa
    expect(n.pagina).toEqual({ tipo: "casa" });
    expect(n.altro.some((c) => c.id === "spesa")).toBe(false);
    expect(n.esiste("spesa")).toBe(false);
    n.vai({ tipo: "spesa" });
    expect(n.pagina).toEqual({ tipo: "casa" });
    n.suIndirizzo("#spesa");
    expect(n.pagina).toEqual({ tipo: "casa" });
    const dopo = new Navigatore({ archivio: a, posizione: () => "#spesa" });
    expect(dopo.pagina).toEqual({ tipo: "casa" });
    // nella colonna
    n.cambiaPreferenze({ voci: cambiaDove(n.preferenze.voci, "spesa", "colonna") });
    expect(n.colonna.map((c) => c.id)).toContain("spesa");
  });
});

describe("preferenze delle schermate", () => {
  it("di serie: 6 durate, 24 ore, consumi, le 3 scene del pacchetto, todo.shopping_list, batterie al 20%", () => {
    expect(leggiPreferenzeSchermate(null)).toEqual(PREFERENZE_SCHERMATE_DI_SERIE);
    expect(PREFERENZE_SCHERMATE_DI_SERIE.scene).toEqual([
      "script.jarvis_buonanotte",
      "script.jarvis_esco",
      "script.jarvis_rientro",
    ]);
    expect(leggiPreferenzeSchermate("{rotto")).toEqual(PREFERENZE_SCHERMATE_DI_SERIE);
  });
  it("durate scritte a mano: numeri nei limiti, senza doppioni, in ordine, al massimo 8", () => {
    // la virgola separa (i minuti sono interi): "0" sale a 1, "2000" scende a 720, "x" si scarta
    expect(durateDa("10, 5,5 ; 0 x 2000")).toEqual([1, 5, 10, 720]);
    expect(durateDa("")).toEqual([]);
    expect(durateDa([1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(8);
  });
  it("scene: solo script.* e scene.*, minuscole, senza doppioni, nell'ordine dato", () => {
    expect(elencoSceneDa("script.esco, Scene.Cena light.cucina script.esco")).toEqual([
      "script.esco",
      "scene.cena",
    ]);
  });
  it("valori fuori misura nei limiti; una lista che non è todo.* resta quella di serie", () => {
    const p = leggiPreferenzeSchermate(
      JSON.stringify({ climaOre: 1000, avvisiOre: 0, avvisiSogliaBatteria: 99, spesaLista: "light.cucina" }),
    );
    expect(p.climaOre).toBe(72);
    expect(p.avvisiOre).toBe(1);
    expect(p.avvisiSogliaBatteria).toBe(50);
    expect(p.spesaLista).toBe("todo.shopping_list");
  });
  it("si salvano, si ripristinano (null) e avvisano chi guarda", () => {
    const { m, a } = archivio();
    const s = new ImpostazioniSchermate(a);
    const f = vi.fn();
    s.ascolta(f);
    s.cambia({ timerDurate: [2, 4], spesaPresi: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(new ImpostazioniSchermate(a).valori).toMatchObject({ timerDurate: [2, 4], spesaPresi: false });
    s.cambia({ timerDurate: null });
    expect(s.valori.timerDurate).toEqual([1, 3, 5, 10, 15, 30]);
    expect(JSON.parse(m.get("jarvis-schermate") ?? "{}")).toMatchObject({ spesaPresi: false });
  });
});
