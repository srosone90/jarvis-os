import { describe, expect, it } from "vitest";
import type { Preferenze } from "../../../src/comune/configurazione";
import {
  costruisciStanze,
  type Area,
  type Dispositivo,
  type EntitaRegistro,
} from "../../../src/casa/modello";

// La casa vera (elenco del 26/09), come la restituiscono i registri di HA
const aree: Area[] = [
  { area_id: "soggiorno", name: "Soggiorno" },
  { area_id: "cucina", name: "Cucina" },
  { area_id: "camera_da_letto", name: "Camera da letto" },
  { area_id: "veranda", name: "Veranda" },
];
const dispositivi: Dispositivo[] = [
  { id: "d-tv", area_id: "soggiorno", name: "TV Salotto", name_by_user: null, disabled_by: null },
  { id: "d-meter-s", area_id: "soggiorno", name: "Meter salone", name_by_user: null, disabled_by: null },
  {
    id: "d-clima",
    area_id: "camera_da_letto",
    name: "Condizionatore",
    name_by_user: null,
    disabled_by: null,
  },
  {
    id: "d-tvc",
    area_id: "camera_da_letto",
    name: "TV camera da letto",
    name_by_user: null,
    disabled_by: null,
  },
  { id: "d-bot", area_id: "veranda", name: "scaldabagno", name_by_user: "Scaldabagno", disabled_by: null },
  { id: "d-backup", area_id: null, name: "Backup", name_by_user: null, disabled_by: null },
];
const entita: EntitaRegistro[] = [
  { ei: "media_player.soggiorno_tv_salotto", di: "d-tv" },
  { ei: "remote.soggiorno_tv_salotto", di: "d-tv" },
  { ei: "sensor.meter_salone_temperatura", di: "d-meter-s" },
  { ei: "sensor.meter_salone_batteria", di: "d-meter-s", ec: 1 },
  { ei: "switch.condizionatore", di: "d-clima" },
  { ei: "climate.condizionatore", di: "d-clima" },
  { ei: "switch.tv_camera_da_letto", di: "d-tvc" },
  { ei: "switch.scaldabagno", di: "d-bot" },
  { ei: "sensor.scaldabagno_batteria", di: "d-bot", ec: 1 },
  { ei: "sensor.backup_backup_manager_state", di: "d-backup" },
];
const preferenze: Preferenze = {
  meteo: "weather.forecast_casa",
  stanze: [
    {
      area: "Soggiorno",
      zona: "soggiorno",
      clima: { temperatura: "sensor.t", umidita: "sensor.u", percepita: "sensor.p" },
    },
    { area: "Veranda", zona: "veranda" },
    { area: "camera da letto", zona: "camera" },
  ],
  infrarossi: [],
  programmi: {},
  nascoste: [],
};

describe("stanze dai registri di Home Assistant", () => {
  it("la casa vera: 3 stanze nell'ordine del mockup, Cucina vuota nascosta", () => {
    const s = costruisciStanze(aree, dispositivi, entita, {}, preferenze);
    expect(s.map((x) => [x.nome, x.zona])).toEqual([
      ["Soggiorno", "soggiorno"],
      ["Veranda", "veranda"],
      ["Camera da letto", "camera"],
    ]);
  });

  it("una card per dispositivo, con l'entità giusta", () => {
    const s = costruisciStanze(aree, dispositivi, entita, {}, preferenze);
    const card = Object.fromEntries(
      s.map((x) => [x.nome, x.card.map((c) => `${c.nome}=${c.entita}:${c.tipo}`)]),
    );
    expect(card).toEqual({
      Soggiorno: ["TV Salotto=media_player.soggiorno_tv_salotto:media"],
      Veranda: ["Scaldabagno=switch.scaldabagno:interruttore"],
      "Camera da letto": [
        "Condizionatore=climate.condizionatore:clima",
        "TV camera da letto=switch.tv_camera_da_letto:interruttore",
      ],
    });
  });

  it("un dispositivo nuovo in un'area compare da solo; un'area nuova si aggiunge in coda", () => {
    const s = costruisciStanze(
      [...aree, { area_id: "bagno", name: "Bagno" }],
      [
        ...dispositivi,
        { id: "d-luce", area_id: "cucina", name: "Luce cucina", name_by_user: null, disabled_by: null },
      ],
      [
        ...entita,
        { ei: "light.cucina", di: "d-luce" },
        { ei: "fan.bagno", ai: "bagno", en: "Ventola bagno" },
      ],
      {},
      preferenze,
    );
    expect(s.map((x) => x.nome)).toEqual(["Soggiorno", "Veranda", "Camera da letto", "Bagno", "Cucina"]);
    expect(s.find((x) => x.nome === "Cucina")?.card[0]).toMatchObject({
      entita: "light.cucina",
      tipo: "non-supportato",
    });
    expect(s.find((x) => x.nome === "Bagno")?.zona).toBeUndefined();
  });

  it("esclude nascoste in HA, disattivate, nascoste nelle preferenze", () => {
    const s = costruisciStanze(
      aree,
      [
        ...dispositivi,
        { id: "d-off", area_id: "veranda", name: "Spento", name_by_user: null, disabled_by: "user" },
      ],
      [
        ...entita.filter((e) => e.ei !== "switch.tv_camera_da_letto"),
        { ei: "switch.tv_camera_da_letto", di: "d-tvc", hb: true },
        { ei: "switch.x", di: "d-off" },
      ],
      {},
      { ...preferenze, nascoste: ["d-tv"] },
    );
    const tutte = s.flatMap((x) => x.card.map((c) => c.entita));
    expect(tutte).toEqual(["switch.scaldabagno", "climate.condizionatore"]);
    // il Soggiorno resta perché ha il clima nelle preferenze
    expect(s[0]?.nome).toBe("Soggiorno");
    expect(s[0]?.card).toEqual([]);
  });

  it("l'area dell'entità vince su quella del dispositivo", () => {
    const s = costruisciStanze(
      aree,
      dispositivi,
      entita.map((e) => (e.ei === "switch.tv_camera_da_letto" ? { ...e, ai: "soggiorno" } : e)),
      {},
      preferenze,
    );
    expect(s[0]?.card.map((c) => c.entita)).toContain("switch.tv_camera_da_letto");
  });

  it("un'area delle preferenze che non esiste in HA non rompe niente", () => {
    const s = costruisciStanze(
      aree,
      dispositivi,
      entita,
      {},
      {
        ...preferenze,
        stanze: [{ area: "Taverna", zona: "soggiorno" }, ...preferenze.stanze],
      },
    );
    expect(s.map((x) => x.nome)).toEqual(["Soggiorno", "Veranda", "Camera da letto"]);
  });
});
