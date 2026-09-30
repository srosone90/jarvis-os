// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addestra,
  probabilita,
  punteggioFinale,
  scegliNegativi,
  scegliPositivi,
  sogliaBaseConsigliata,
  type Verificatore,
} from "../../src/parola/verificatore";

/**
 * Il verificatore deve dare gli stessi numeri di scikit-learn 1.9.1, che è ciò
 * che usa openWakeWord. Riferimento: scripts/riferimento-verificatore.py (dati
 * Park-Miller, rigenerati identici qui).
 */
interface Caso {
  nome: string;
  positivi: number;
  negativi: number;
  d: number;
  seme: number;
  C: number;
  media: number[];
  scala: number[];
  pesi: number[];
  intercetta: number;
  probabilita: number[];
}
const riferimento = JSON.parse(readFileSync("test/unit/dati/verificatore-sklearn.json", "utf8")) as {
  sklearn: string;
  casi: Caso[];
};

function dati(c: Caso): { positivi: number[][]; negativi: number[][]; tutte: number[][] } {
  let s = c.seme;
  const caso = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const tutte: number[][] = [];
  for (let i = 0; i < c.positivi + c.negativi; i++) {
    const positivo = i < c.positivi;
    const riga: number[] = [];
    for (let j = 0; j < c.d; j++) {
      let v = caso() * 2 - 1;
      if (j === c.d - 1) v = 0.25;
      else if (positivo && j % 3 === 0) v += 0.6;
      riga.push(v);
    }
    tutte.push(riga);
  }
  return { positivi: tutte.slice(0, c.positivi), negativi: tutte.slice(c.positivi), tutte };
}

describe(`verificatore = scikit-learn ${riferimento.sklearn} (StandardScaler + LogisticRegression)`, () => {
  for (const c of riferimento.casi) {
    it(c.nome, async () => {
      const { positivi, negativi, tutte } = dati(c);
      const v = await addestra(positivi, negativi, { modello: "prova", persone: [] }, { C: c.C });
      v.media.forEach((m, j) => expect(m).toBeCloseTo(c.media[j] ?? NaN, 12));
      // colonna costante: scala 1, come StandardScaler
      expect(v.scala.at(-1)).toBe(1);
      v.scala.forEach((m, j) => expect(m).toBeCloseTo(c.scala[j] ?? NaN, 12));
      const scarto = Math.max(...v.pesi.map((w, j) => Math.abs(w - (c.pesi[j] ?? NaN))));
      const grandezza = Math.max(...c.pesi.map(Math.abs));
      expect(scarto / grandezza).toBeLessThan(1e-5);
      expect(v.intercetta).toBeCloseTo(c.intercetta, 5);
      const campioni = tutte.filter((_, i) => i % 15 === 0);
      campioni.forEach((x, i) => expect(probabilita(v, x)).toBeCloseTo(c.probabilita[i] ?? NaN, 6));
    });
  }
});

describe("scelta degli esempi e punteggio finale", () => {
  const f = (punteggio: number, id: number) => ({ punteggio, caratteristiche: Float32Array.of(id) });

  it("positivi: i frame sopra la soglia base; se nessuno, i 3 attorno al massimo", () => {
    expect(scegliPositivi([f(0.02, 1), f(0.3, 2), f(0.12, 3), f(0.01, 4)], 0.1).map((c) => c[0])).toEqual([
      2, 3,
    ]);
    // "Giàrvis": il modello base resta basso, si prende il momento più "Jarvis"
    expect(
      scegliPositivi([f(0.001, 1), f(0.004, 2), f(0.03, 3), f(0.02, 4), f(0, 5)], 0.1).map((c) => c[0]),
    ).toEqual([2, 3, 4]);
    expect(scegliPositivi([f(0.05, 1), f(0.01, 2)], 0.1).map((c) => c[0])).toEqual([1, 2]);
    expect(scegliPositivi([], 0.1)).toEqual([]);
  });

  it("negativi: tutti, oppure al massimo N presi a intervalli regolari", () => {
    const tanti = Array.from({ length: 10 }, (_, i) => f(0, i));
    expect(scegliNegativi(tanti).length).toBe(10);
    expect(scegliNegativi(tanti, 4).map((c) => c[0])).toEqual([0, 2, 5, 7]);
  });

  it("soglia base consigliata: sotto il più basso dei massimi, mai oltre 0,1 né sotto 0,005", () => {
    expect(sogliaBaseConsigliata([0.6, 0.9])).toBe(0.1);
    expect(sogliaBaseConsigliata([0.05, 0.4])).toBe(0.04);
    expect(sogliaBaseConsigliata([0.001])).toBe(0.005);
    expect(sogliaBaseConsigliata([])).toBe(0.1);
  });

  it("punteggio finale come Model.predict: il verificatore decide solo sopra la soglia base", () => {
    const v: Verificatore = {
      versione: 1,
      modello: "m",
      media: [0],
      scala: [1],
      pesi: [10],
      intercetta: 0,
      info: { positivi: 1, negativi: 1, persone: [], creato: "", iterazioni: 0, accuratezza: 1 },
    };
    expect(punteggioFinale(0.05, [1], v, 0.1)).toEqual({ punteggio: 0.05, verificato: false });
    const sopra = punteggioFinale(0.2, [1], v, 0.1);
    expect(sopra.verificato).toBe(true);
    expect(sopra.punteggio).toBeCloseTo(1 / (1 + Math.exp(-10)), 12);
    expect(punteggioFinale(0.9, [-1], v, 0.1).punteggio).toBeLessThan(0.001);
    expect(punteggioFinale(0.9, [1], null, 0.1)).toEqual({ punteggio: 0.9, verificato: false });
  });

  it("senza esempi di una delle due classi non addestra (e lo dice)", async () => {
    await expect(addestra([[1]], [], { modello: "m", persone: [] })).rejects.toThrow(/sia della parola sia/);
  });
});

describe("parola.json (impostazioni senza release)", async () => {
  const { leggiImpostazioni } = await import("../../src/parola/impostazioni");
  it("tiene ciò che è valido e dice cosa scarta", () => {
    const { impostazioni, avvisi } = leggiImpostazioni({
      modello: {
        id: "jarvis_it",
        url: "./m.onnx",
        parola: "Jarvis",
        licenza: "Apache-2.0",
        commerciale: true,
      },
      soglia: 0.35,
      sogliaBase: 2,
      verificatore: "./v.json",
      colore: "blu",
    });
    expect(impostazioni).toEqual({
      modello: {
        id: "jarvis_it",
        url: "./m.onnx",
        parola: "Jarvis",
        licenza: "Apache-2.0",
        commerciale: true,
      },
      soglia: 0.35,
      verificatore: "./v.json",
    });
    expect(avvisi).toEqual([
      "«sogliaBase» ignorata: deve essere un numero tra 0 e 1",
      "chiavi sconosciute ignorate: colore",
    ]);
    expect(leggiImpostazioni({ modello: { id: "x" } }).avvisi[0]).toMatch(/modello» ignorato/);
    expect(leggiImpostazioni([1, 2]).avvisi).toEqual(["il file non contiene un oggetto JSON"]);
  });
});
