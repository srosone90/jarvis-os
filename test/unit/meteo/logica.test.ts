import { describe, expect, it } from "vitest";

import { condizione, numero, prossimiGiorni } from "../../../src/meteo/testi";

describe("testi del meteo", () => {
  it("condizioni in italiano, e una sconosciuta non rompe niente", () => {
    expect(condizione("partlycloudy").testo).toBe("Parz. nuvoloso");
    expect(condizione("clear-night").testo).toBe("Sereno");
    expect(condizione("boh").testo).toBe("Non disponibile");
    expect(condizione(undefined).testo).toBe("Non disponibile");
  });

  it("numeri con la virgola, e i non-numeri diventano null", () => {
    expect(numero("25.7")).toBe("25,7");
    expect(numero(44, 0)).toBe("44");
    expect(numero("unavailable")).toBeNull();
    expect(numero("")).toBeNull();
  });

  it("oggi per max/min, poi i prossimi 4 giorni; i giorni passati si scartano", () => {
    const adesso = new Date(2026, 8, 29, 10, 0);
    const giorno = (d: number, t: number) => ({
      datetime: new Date(2026, 8, d, 12).toISOString(),
      condition: "sunny",
      temperature: t,
      templow: t - 8,
    });
    const { oggi, prossimi } = prossimiGiorni(
      [28, 29, 30, 31, 32, 33, 34].map((d) => giorno(d, d)),
      adesso,
    );
    expect(oggi?.massima).toBe("29°");
    expect(prossimi.map((g) => g.massima)).toEqual(["30°", "31°", "32°", "33°"]);
    expect(prossimi[0]?.etichetta).toBe("mer");
  });
});
