// @vitest-environment node
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";
import { SECONDI_MEMORIA } from "../../src/parola/ascolto";
import { inizioFrase, MARGINE_PRIMA_S } from "../../src/parola/inizio-frase";
import { MemoriaCircolare } from "../../src/parola/memoria";
import { RilevatoreOpenWakeWord } from "../../src/parola/rilevatore";

/**
 * Il contesto PRIMA di «Jarvis» (v0.5.2, requisito di Salvatore): con voci
 * vere (Piper) e il modello vero, nel punto esatto in cui il pannello scatta,
 * l'audio mandato a HA deve cominciare all'inizio della frase. Non 1 s prima
 * della parola, non 10 s fissi: dopo l'ultima pausa di almeno 1 s.
 * Le clip sono montate con pause di durata nota (test/dati/audio/segmenti.json).
 */

ort.env.wasm.numThreads = 1;
const FR = 16000;

interface Segmento {
  testo: string | null;
  da: number;
  a: number;
}
const segmenti = JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8")) as Record<
  string,
  { campioni: number; segmenti: Segmento[] }
>;

function leggiWav(nome: string): Int16Array {
  const b = readFileSync(`test/dati/audio/${nome}.wav`);
  const dati = b.indexOf("data");
  const n = b.readUInt32LE(dati + 4) / 2;
  return Int16Array.from({ length: n }, (_, i) => b.readInt16LE(dati + 8 + i * 2));
}

const modello = (f: string) => new Uint8Array(readFileSync(`modelli/openwakeword/${f}`));

/**
 * Come il pannello: pezzi da 1024 campioni nella memoria da 10 s e nel
 * rilevatore; al primo punteggio ≥ 0,5 si prende la memoria dall'inizio della
 * frase. Ritorna da quale campione della clip parte l'audio mandato, e dove
 * era lo scatto.
 */
async function scatto(nome: string): Promise<{ da: number; scatto: number }> {
  const r = await RilevatoreOpenWakeWord.crea(
    ort,
    { id: "hey_jarvis_v0.1", parola: "Jarvis", licenza: "CC BY-NC-SA 4.0", commerciale: false },
    {
      melspettrogramma: modello("melspectrogram.onnx"),
      embedding: modello("embedding_model.onnx"),
      classificatore: modello("hey_jarvis_v0.1.onnx"),
    },
  );
  const memoria = new MemoriaCircolare(SECONDI_MEMORIA);
  const pcm = leggiWav(nome);
  for (let i = 0; i < pcm.length; i += 1024) {
    const pezzo = pcm.subarray(i, i + 1024);
    memoria.scrivi(pezzo);
    for (const e of await r.elabora(pezzo))
      if (e.punteggio >= 0.5) {
        const fine = Math.min(pcm.length, i + 1024);
        const m = memoria.ultimi();
        const inviati = m.length - inizioFrase(m);
        return { da: fine - inviati, scatto: fine };
      }
  }
  throw new Error(`«Jarvis» non scattato in ${nome}`);
}

const parlato = (nome: string) => segmenti[nome]?.segmenti.filter((s) => s.testo !== null) ?? [];
const s = (n: number) => (n / FR).toFixed(2);

describe("contesto prima di «Jarvis» (modello vero, clip vere)", () => {
  it("«Jarvis» alla FINE: arriva tutta la frase, dall'inizio (non solo «…pensi, Jarvis»)", async () => {
    const [frase] = parlato("contesto-fine");
    if (!frase) throw new Error("segmenti mancanti");
    const { da, scatto: fine } = await scatto("contesto-fine");
    // scatta dopo la parola, in fondo alla frase di 3,4 s
    expect(fine).toBeGreaterThan(frase.a - 0.5 * FR);
    // l'audio inviato comincia poco prima della frase (margine 0,25 s), mai dopo il suo inizio
    expect(da, `inizio ${s(da)} s, frase da ${s(frase.da)} s`).toBeLessThanOrEqual(frase.da);
    expect(da).toBeGreaterThanOrEqual(frase.da - MARGINE_PRIMA_S * FR - 0.1 * FR);
  }, 60_000);

  it("con una pausa di 1,6 s prima: si parte DOPO la pausa (il server ci vedrebbe una fine frase)", async () => {
    const [prima, seconda] = parlato("pausa-prima");
    if (!prima || !seconda) throw new Error("segmenti mancanti");
    const { da } = await scatto("pausa-prima");
    expect(da, `inizio ${s(da)} s, seconda frase da ${s(seconda.da)} s`).toBeGreaterThan(prima.a + FR);
    expect(da).toBeLessThanOrEqual(seconda.da);
    expect(da).toBeGreaterThanOrEqual(seconda.da - MARGINE_PRIMA_S * FR - 0.1 * FR);
  }, 60_000);

  it("«Jarvis» IN MEZZO: scatta subito dopo la parola e parte da lì; il resto arriva dal vivo", async () => {
    const [parola, resto] = parlato("jarvis-in-mezzo");
    if (!parola || !resto) throw new Error("segmenti mancanti");
    const { da, scatto: fine } = await scatto("jarvis-in-mezzo");
    expect(fine).toBeLessThan(resto.a);
    expect(da).toBeLessThanOrEqual(parola.da);
    expect(da).toBeGreaterThanOrEqual(parola.da - MARGINE_PRIMA_S * FR - 0.1 * FR);
  }, 60_000);
});

describe("inizio della frase (energia a finestre da 20 ms)", () => {
  const voce = (sec: number) =>
    Int16Array.from({ length: sec * FR }, (_, i) => Math.round(4000 * Math.sin(i / 3) * Math.sin(i / 900)));
  const silenzio = (sec: number, livello = 40) =>
    Int16Array.from({ length: sec * FR }, (_, i) => ((i * 7919) % (2 * livello)) - livello);
  const unisci = (...p: Int16Array[]) => {
    const t = new Int16Array(p.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of p) {
      t.set(x, o);
      o += x.length;
    }
    return t;
  };

  it("nessuna pausa di 1 s: tutta la memoria", () => {
    expect(inizioFrase(unisci(voce(3), silenzio(0.6), voce(2)))).toBe(0);
  });
  it("pausa di 1,2 s: dopo la pausa, col margine", () => {
    const m = unisci(voce(2), silenzio(1.2), voce(3), silenzio(0.3));
    expect(inizioFrase(m)).toBe(Math.round((2 + 1.2) * FR - MARGINE_PRIMA_S * FR));
  });
  it("il silenzio dopo la parola, anche lungo, non conta come pausa", () => {
    const m = unisci(voce(2), silenzio(1.5), voce(2), silenzio(1.5));
    expect(inizioFrase(m)).toBe(Math.round(3.5 * FR - MARGINE_PRIMA_S * FR));
  });
  it("con la TV accesa (fondo alto) la soglia sale con il fondo", () => {
    const tv = (sec: number) => silenzio(sec, 600);
    const m = unisci(voce(2), tv(1.2), voce(2));
    expect(inizioFrase(m)).toBeGreaterThan(2 * FR);
  });
  it("memoria vuota: dall'inizio", () => {
    expect(inizioFrase(new Int16Array(0))).toBe(0);
  });
});
