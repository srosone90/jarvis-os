import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";

import {
  leggiInterruzioni,
  MASSIMO_INTERRUZIONI,
  RegistroInterruzioni,
} from "../../../src/connessione/interruzioni";
import {
  batterieBasse,
  durataTesto,
  eventiDaRegistro,
  quandoTesto,
  testoStato,
} from "../../../src/avvisi/eventi";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

const stato = (s: string, a: Record<string, unknown> = {}, last_changed = "2026-10-01T08:00:00Z") => ({
  entity_id: "",
  state: s,
  attributes: a,
  last_changed,
  last_updated: last_changed,
  context: { id: "c", parent_id: null, user_id: null },
});

const archivio = () => {
  const m = new Map<string, string>();
  return {
    m,
    a: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) },
  };
};

describe("avvisi ed eventi", () => {
  it("stati in parole, senza genere; sconosciuto e passaggi intermedi non si mostrano", () => {
    expect(testoStato("media_player", "on")).toBe("accensione");
    expect(testoStato("media_player", "standby")).toBe("spegnimento");
    expect(testoStato("climate", "fan_only")).toBe("ventola");
    expect(testoStato("switch", "off")).toBe("spegnimento");
    expect(testoStato("switch", "unavailable")).toBe("non raggiungibile");
    expect(testoStato("switch", "unknown")).toBeNull();
    expect(testoStato("media_player", "buffering")).toBeNull();
    expect(testoStato("cover", "opening")).toBeNull();
  });
  it("dal registro di HA: dal più recente, chi l'ha chiesto, when in secondi", () => {
    const nomi: Record<string, string> = {
      "media_player.tv": "TV Salotto",
      "climate.condizionatore": "Condizionatore",
      "script.jarvis_rientro": "Jarvis · Rientro",
    };
    const e = eventiDaRegistro(
      [
        {
          entity_id: "climate.condizionatore",
          state: "fan_only",
          when: 1000,
          context_entity_id: "script.jarvis_rientro",
        },
        { entity_id: "media_player.tv", state: "on", when: 2000, context_user_id: "abc" },
        { entity_id: "switch.ir", state: "unknown", when: 3000 },
        { entity_id: "media_player.tv", state: "off", when: 500 },
        { message: "senza entità", when: 4000 },
      ],
      (x) => nomi[x] ?? x,
    );
    expect(e.map((x) => [x.titolo, x.stato, x.da, x.quando])).toEqual([
      ["TV Salotto", "accensione", "da un utente", 2_000_000],
      ["Condizionatore", "ventola", "da Jarvis · Rientro", 1_000_000],
      ["TV Salotto", "spegnimento", null, 500_000],
    ]);
    expect(eventiDaRegistro({ non: "un elenco" }, (x) => x)).toEqual([]);
  });
  it("batterie sotto la soglia, dalla più scarica; i binary_sensor dicono solo bassa", () => {
    const stati = {
      "sensor.a": stato("12", { device_class: "battery", friendly_name: "Meter letto batteria" }),
      "sensor.b": stato("19.6", { device_class: "battery" }),
      "sensor.c": stato("100", { device_class: "battery" }),
      "sensor.d": stato("unavailable", { device_class: "battery" }),
      "binary_sensor.e": stato("on", { device_class: "battery", friendly_name: "Sensore porta" }),
      "sensor.temperatura": stato("5", { device_class: "temperature" }),
    } as unknown as HassEntities;
    expect(batterieBasse(stati, 20)).toEqual([
      { entita: "binary_sensor.e", nome: "Sensore porta", livello: null },
      { entita: "sensor.a", nome: "Meter letto batteria", livello: 12 },
      { entita: "sensor.b", nome: "sensor.b", livello: 20 },
    ]);
    expect(batterieBasse(stati, 10).map((b) => b.entita)).toEqual(["binary_sensor.e"]);
  });
  it("quando: oggi, ieri, poi il giorno; durata delle interruzioni", () => {
    const adesso = new Date(2026, 9, 1, 15, 0).getTime();
    expect(quandoTesto(new Date(2026, 9, 1, 13, 2).getTime(), adesso)).toBe("oggi 13:02");
    expect(quandoTesto(new Date(2026, 8, 30, 2, 19).getTime(), adesso)).toBe("ieri 02:19");
    expect(quandoTesto(new Date(2026, 8, 28, 9, 15).getTime(), adesso)).toMatch(/^lun 28, 09:15$/);
    expect(durataTesto(20_000)).toBe("meno di 1 min");
    expect(durataTesto(5 * 60_000)).toBe("5 min");
    expect(durataTesto(80 * 60_000)).toBe("1 h 20 min");
    expect(durataTesto(120 * 60_000)).toBe("2 h");
  });
  it("interruzioni: una aperta alla volta, si chiude al ritorno, al massimo 30, salvate", () => {
    const { a } = archivio();
    const r = new RegistroInterruzioni(a);
    r.inizio(1000);
    r.inizio(2000);
    expect(r.voci).toEqual([{ da: 1000, a: null }]);
    r.fine(5000);
    r.fine(9000);
    expect(r.voci).toEqual([{ da: 1000, a: 5000 }]);
    for (let i = 0; i < 40; i++) {
      r.inizio(10_000 + i * 10);
      r.fine(10_005 + i * 10);
    }
    expect(r.voci).toHaveLength(MASSIMO_INTERRUZIONI);
    expect(new RegistroInterruzioni(a).voci[0]).toEqual({ da: 10_390, a: 10_395 });
    expect(leggiInterruzioni("{rotto")).toEqual([]);
    expect(leggiInterruzioni(JSON.stringify([{ da: 5, a: 2 }, { a: 1 }]))).toEqual([{ da: 5, a: null }]);
  });
});
