import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import { sensoriConsumo } from "../../../src/clima/consumi";

import { linea, scalaComune } from "../../../src/casa/storico";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

const stato = (s: string, a: Record<string, unknown> = {}, last_changed = "2026-10-01T08:00:00Z") => ({
  entity_id: "",
  state: s,
  attributes: a,
  last_changed,
  last_updated: last_changed,
  context: { id: "c", parent_id: null, user_id: null },
});

describe("clima", () => {
  it("consumi solo dai sensori di potenza o energia veri, prima la potenza", () => {
    const stati = {
      "sensor.casa_energia": stato("12.5", {
        device_class: "energy",
        unit_of_measurement: "kWh",
        friendly_name: "Casa oggi",
      }),
      "sensor.casa_potenza": stato("420", {
        device_class: "power",
        unit_of_measurement: "W",
        friendly_name: "Casa",
      }),
      "sensor.guasto": stato("unavailable", { device_class: "power" }),
      "sensor.temperatura": stato("21", { device_class: "temperature" }),
    } as unknown as HassEntities;
    expect(sensoriConsumo(stati).map((s) => `${s.nome} ${s.valore} ${s.unita}`)).toEqual([
      "Casa 420 W",
      "Casa oggi 12.5 kWh",
    ]);
    expect(sensoriConsumo({} as HassEntities)).toEqual([]);
  });
  it("una scala sola per tutte le stanze: le linee si confrontano", () => {
    const a = [
      { t: 0, v: 20 },
      { t: 10, v: 22 },
    ];
    const b = [
      { t: 0, v: 25 },
      { t: 10, v: null },
      { t: 20, v: 26 },
    ];
    const scala = scalaComune([a, b]);
    expect(scala).toEqual({ min: 20, max: 26 });
    if (!scala) throw new Error("scala mancante");
    const la = linea(a, 0, 20, 100, 60, scala);
    const lb = linea(b, 0, 20, 100, 60, scala);
    // 20° in fondo, 26° in cima, con la stessa scala
    expect(la?.tratti[0]?.startsWith("0.0,60.0")).toBe(true);
    expect(lb?.tratti.at(-1)?.endsWith("100.0,0.0")).toBe(true);
    expect(scalaComune([[{ t: 0, v: 21 }]])).toBeNull();
  });
});
