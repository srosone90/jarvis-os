import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";

import { CONFERMA_SCENA_MS, ConfermaScena } from "../../../src/scene/attiva";
import { nomeScena, sceneDa, servizioScena } from "../../../src/scene/scene";
import {
  leggiPreferenzeSchermate,
  PREFERENZE_SCHERMATE_DI_SERIE,
} from "../../../src/navigazione/preferenze-schermate";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

const stato = (s: string, a: Record<string, unknown> = {}, last_changed = "2026-10-01T08:00:00Z") => ({
  entity_id: "",
  state: s,
  attributes: a,
  last_changed,
  last_updated: last_changed,
  context: { id: "c", parent_id: null, user_id: null },
});

describe("scene", () => {
  const stati = {
    "script.jarvis_esco": stato("on", { friendly_name: "Jarvis · Esco" }),
    "script.jarvis_rientro": stato("off", { friendly_name: "Jarvis · Rientro" }),
    "input_number.jarvis_clima_soglia_caldo": stato("26"),
    "input_number.jarvis_clima_soglia_freddo": stato("18.5"),
    "scene.cena": stato("2026-10-01T19:00:00", { friendly_name: "Cena" }),
  } as unknown as HassEntities;
  it("le tre del pacchetto: nome, colore del mockup, cosa fanno davvero; in corso se lo script gira", () => {
    const s = sceneDa(["script.jarvis_buonanotte", "script.jarvis_esco", "script.jarvis_rientro"], stati);
    expect(s.map((x) => [x.nome, x.colore, x.esiste, x.inCorso])).toEqual([
      ["Buonanotte", "#8b7cf6", false, false],
      ["Esco", "#3ec9a7", true, true],
      ["Rientro", "#e0a33a", true, false],
    ]);
    expect(s[2]?.descrizione).toBe(
      "Condizionatore della camera secondo la temperatura percepita: raffresca sopra 26°, riscalda sotto 18,5°.",
    );
    // la modalità notte del pannello non c'è ancora (F6): non si promette
    expect(s[0]?.descrizione).not.toMatch(/notte/i);
  });
  it("scene scelte a mano: nome da HA o dall'entità, colori diversi, scene.* con scene.turn_on", () => {
    const s = sceneDa(["scene.cena", "script.cena_fuori"], stati);
    expect(s.map((x) => x.nome)).toEqual(["Cena", "Cena fuori"]);
    expect(s[0]?.colore).not.toBe(s[1]?.colore);
    expect(s[0]?.inCorso).toBe(false);
    expect(servizioScena("scene.cena")).toEqual({ dominio: "scene", servizio: "turn_on" });
    expect(servizioScena("script.jarvis_esco")).toEqual({ dominio: "script", servizio: "turn_on" });
    expect(nomeScena("script.x", "Jarvis - Rientro")).toBe("Rientro");
  });
});

describe("conferma prima delle scene (v0.5.8)", () => {
  it("spenta di serie; si legge solo se è un sì/no", () => {
    expect(PREFERENZE_SCHERMATE_DI_SERIE.sceneConferma).toBe(false);
    expect(leggiPreferenzeSchermate(JSON.stringify({ sceneConferma: true })).sceneConferma).toBe(true);
    expect(leggiPreferenzeSchermate(JSON.stringify({ sceneConferma: "si" })).sceneConferma).toBe(false);
  });
  it("senza conferma il primo tocco avvia; con la conferma serve il secondo entro 4 s", () => {
    vi.useFakeTimers();
    try {
      const ridisegna = vi.fn();
      const c = new ConfermaScena(ridisegna);
      expect(c.tocca("script.jarvis_esco", false)).toBe(true);
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      expect(c.inAttesa("script.jarvis_esco")).toBe(true);
      expect(c.tocca("script.jarvis_esco", true)).toBe(true);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      // controprova: oltre i 4 s il secondo tocco è di nuovo un primo tocco
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      vi.advanceTimersByTime(CONFERMA_SCENA_MS + 1);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      // controprova: un tocco su un'altra scena non avvia la prima, sposta la richiesta
      expect(c.tocca("script.jarvis_rientro", true)).toBe(false);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      expect(c.tocca("script.jarvis_rientro", true)).toBe(true);
      expect(ridisegna).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
