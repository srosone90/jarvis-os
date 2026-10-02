// @vitest-environment node
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { diFronte, distanza, ingresso, volti } from "../../../src/fotocamera/volto";

/**
 * v0.6.0: il modello del volto VERO (modelli/volto) sui video di prova
 * (test/dati/video, foto NASA di dominio pubblico): stesso ingresso e stessa
 * soglia del pannello.
 */

/** Un fotogramma y4m 320×240 4:2:0 → RGBA. */
function daY4m(file: string): Uint8ClampedArray {
  const b = readFileSync(`test/dati/video/${file}`);
  const inizio = b.indexOf("FRAME\n") + 6;
  const w = 320;
  const h = 240;
  const Y = b.subarray(inizio, inizio + w * h);
  const U = b.subarray(inizio + w * h, inizio + w * h + (w * h) / 4);
  const V = b.subarray(inizio + w * h + (w * h) / 4, inizio + w * h + (w * h) / 2);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const yy = Y[y * w + x] ?? 0;
      const u = (U[(y >> 1) * (w / 2) + (x >> 1)] ?? 128) - 128;
      const v = (V[(y >> 1) * (w / 2) + (x >> 1)] ?? 128) - 128;
      const i = (y * w + x) * 4;
      rgba[i] = yy + 1.402 * v;
      rgba[i + 1] = yy - 0.344136 * u - 0.714136 * v;
      rgba[i + 2] = yy + 1.772 * u;
      rgba[i + 3] = 255;
    }
  return rgba;
}

let sessione: ort.InferenceSession;
async function rileva(file: string) {
  const r = await sessione.run({
    input: new ort.Tensor("float32", ingresso(daY4m(file)), [1, 3, 240, 320]),
  });
  return volti(r["scores"]?.data as Float32Array, r["boxes"]?.data as Float32Array, 0.85);
}

describe("modello del volto vero", () => {
  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    sessione = await ort.InferenceSession.create(readFileSync("modelli/volto/version-RFB-320.onnx"), {
      logSeverityLevel: 3,
    });
  }, 30_000);

  it("volto vicino: uno solo, di fronte, a meno di 1 m", async () => {
    const v = await rileva("volto-vicino.y4m");
    expect(v).toHaveLength(1);
    const primo = v[0];
    if (!primo) throw new Error("nessun volto");
    expect(primo.punteggio).toBeGreaterThan(0.95);
    expect(distanza(primo)).toBeLessThan(1);
    expect(diFronte(primo)).toBe(true);
  });
  it("volto lontano: c'è, ma a circa 2 m", async () => {
    const v = await rileva("volto-lontano.y4m");
    expect(v).toHaveLength(1);
    expect(distanza(v[0] ?? { x1: 0, y1: 0, x2: 0, y2: 0, punteggio: 0 })).toBeGreaterThan(1.7);
  });
  it("controprova: stanza vuota, nessun volto", async () => {
    expect(await rileva("vuota.y4m")).toEqual([]);
  });
});
