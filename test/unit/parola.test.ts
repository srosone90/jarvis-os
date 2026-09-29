// @vitest-environment node
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";
import { MemoriaCircolare } from "../../src/parola/memoria";
import { CAMPIONI_FRAME, RilevatoreOpenWakeWord } from "../../src/parola/rilevatore";

describe("memoria circolare (solo RAM)", () => {
  const seq = (da: number, n: number) => Int16Array.from({ length: n }, (_, i) => da + i);

  it("tiene gli ultimi N campioni, dal più vecchio al più recente, anche dopo il giro", () => {
    const m = new MemoriaCircolare(1, 10); // 10 campioni
    m.scrivi(seq(0, 4));
    expect(Array.from(m.ultimi())).toEqual([0, 1, 2, 3]);
    m.scrivi(seq(4, 8)); // 12 scritti: restano gli ultimi 10
    expect(Array.from(m.ultimi())).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("un pezzo più lungo della memoria lascia solo i suoi ultimi campioni", () => {
    const m = new MemoriaCircolare(1, 5);
    m.scrivi(seq(0, 12));
    expect(Array.from(m.ultimi())).toEqual([7, 8, 9, 10, 11]);
  });

  it("svuota azzera davvero l'audio; ridimensiona riparte vuota", () => {
    const m = new MemoriaCircolare(1, 5);
    m.scrivi(seq(100, 5));
    m.svuota();
    expect(m.ultimi()).toHaveLength(0);
    const interno = (m as unknown as { dati: Int16Array }).dati;
    expect(Array.from(interno).every((v) => v === 0)).toBe(true);
    m.scrivi(seq(1, 3));
    m.ridimensiona(2);
    expect(m.ultimi()).toHaveLength(0);
    expect(m.secondi).toBe(2);
  });
});

describe("rilevatore openWakeWord (modelli veri)", () => {
  ort.env.wasm.numThreads = 1;
  const modello = (f: string) => new Uint8Array(readFileSync(`modelli/openwakeword/${f}`));
  // generatore ripetibile per il rumore iniziale (come np.random in openWakeWord)
  const semeFisso = () => {
    let s = 42;
    return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  };
  const crea = () =>
    RilevatoreOpenWakeWord.crea(
      ort,
      { id: "hey_jarvis_v0.1", parola: "Ehi Jarvis", licenza: "CC BY-NC-SA 4.0", commerciale: false },
      {
        melspettrogramma: modello("melspectrogram.onnx"),
        embedding: modello("embedding_model.onnx"),
        classificatore: modello("hey_jarvis_v0.1.onnx"),
      },
      semeFisso(),
    );
  const rumore = (n: number) => {
    let s = 7;
    return Int16Array.from({ length: n }, () => ((s = (s * 48271) % 2147483647) % 600) - 300);
  };

  it("un esito per ogni frame da 80 ms; le prime 5 previsioni valgono 0; rumore lontano dalla soglia", async () => {
    const r = await crea();
    const esiti = await r.elabora(rumore(CAMPIONI_FRAME * 20 + 500));
    expect(esiti).toHaveLength(20);
    expect(esiti.slice(0, 5).every((e) => e.punteggio === 0)).toBe(true);
    // rumore sintetico: resta ben sotto la soglia consigliata (0,5)
    expect(Math.max(...esiti.map((e) => e.punteggio))).toBeLessThan(0.5);
    expect(esiti.every((e) => e.msCalcolo > 0)).toBe(true);
    expect(r.parola).toBe("Ehi Jarvis");
  }, 30_000);

  it("stesso audio a pezzi diversi → stessi punteggi (il ritmo del microfono non conta)", async () => {
    const audio = rumore(CAMPIONI_FRAME * 15);
    const a = await crea();
    const b = await crea();
    const pa: number[] = [];
    for (let i = 0; i < audio.length; i += 1024)
      pa.push(...(await a.elabora(audio.slice(i, i + 1024))).map((e) => e.punteggio));
    const pb: number[] = [];
    for (let i = 0; i < audio.length; i += 4000)
      pb.push(...(await b.elabora(audio.slice(i, i + 4000))).map((e) => e.punteggio));
    expect(pb).toHaveLength(pa.length);
    pb.forEach((v, i) => expect(v).toBeCloseTo(pa[i] ?? -1, 6));
  }, 30_000);
});
