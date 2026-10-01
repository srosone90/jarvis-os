// @vitest-environment node
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";
import { Ricampionatore } from "../../src/parola/ricampiona";
import { RilevatoreOpenWakeWord } from "../../src/parola/rilevatore";

/**
 * «Jarvis» col modello VERO e audio VERO (v0.5.1). Le prove della v0.5.0
 * usavano un verificatore finto che dice sempre sì, e il percorso vero non era
 * mai stato provato con una voce. Qui: una clip vera di «hey jarvis» deve
 * superare la soglia (0,5), anche registrata a 48 o 44,1 kHz e ricampionata
 * come fa il pannello; il rumore deve restare basso.
 */

ort.env.wasm.numThreads = 1;
const SOGLIA = 0.5;

/** WAV PCM 16 bit mono: i campioni, nella scala int16 che vuole openWakeWord. */
function leggiWav(percorso: string): { campioni: Int16Array; frequenza: number } {
  const b = readFileSync(percorso);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("non è un WAV");
  let pos = 12;
  let frequenza = 0;
  while (pos < b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const n = b.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      if (b.readUInt16LE(pos + 8) !== 1 || b.readUInt16LE(pos + 10) !== 1 || b.readUInt16LE(pos + 22) !== 16)
        throw new Error("serve PCM 16 bit mono");
      frequenza = b.readUInt32LE(pos + 12);
    }
    if (id === "data") {
      const campioni = new Int16Array(n / 2);
      for (let i = 0; i < campioni.length; i++) campioni[i] = b.readInt16LE(pos + 8 + i * 2);
      return { campioni, frequenza };
    }
    pos += 8 + n + (n % 2);
  }
  throw new Error("WAV senza dati");
}

/** Come registrata da un microfono a un'altra frequenza (interpolazione lineare). */
function aFrequenza(pcm: Int16Array, verso: number): Int16Array {
  const passo = 16000 / verso;
  return Int16Array.from({ length: Math.floor((pcm.length - 1) / passo) }, (_, i) => {
    const p = i * passo;
    const k = Math.floor(p);
    return Math.round((pcm[k] ?? 0) * (1 - (p - k)) + (pcm[k + 1] ?? 0) * (p - k));
  });
}

const modello = (f: string) => new Uint8Array(readFileSync(`modelli/openwakeword/${f}`));
const crea = () =>
  RilevatoreOpenWakeWord.crea(
    ort,
    { id: "hey_jarvis_v0.1", parola: "Jarvis", licenza: "CC BY-NC-SA 4.0", commerciale: false },
    {
      melspettrogramma: modello("melspectrogram.onnx"),
      embedding: modello("embedding_model.onnx"),
      classificatore: modello("hey_jarvis_v0.1.onnx"),
    },
  );

/** Il percorso del pannello: pezzi da 1024 campioni come dal microfono, ricampionati a 16 kHz. */
async function punteggioMassimo(pcm: Int16Array, frequenza: number): Promise<number> {
  const r = await crea();
  const ricampiona = new Ricampionatore(frequenza);
  // un secondo di silenzio prima: il pannello ascolta da un pezzo quando arriva la parola
  const tutto = new Int16Array(frequenza + pcm.length + frequenza);
  tutto.set(pcm, frequenza);
  let massimo = 0;
  for (let i = 0; i < tutto.length; i += 1024)
    for (const e of await r.elabora(ricampiona.a16k(tutto.subarray(i, i + 1024))))
      massimo = Math.max(massimo, e.punteggio);
  return massimo;
}

const clip = leggiWav("test/dati/audio/hey-jarvis-piper.wav");
const rumore = leggiWav("test/dati/audio/rumore.wav");

describe("«Jarvis» col modello vero e audio vero", () => {
  it("le clip sono a 16 kHz, in scala int16 (non float tra -1 e 1)", () => {
    expect(clip.frequenza).toBe(16000);
    expect(Math.max(...clip.campioni.map(Math.abs))).toBeGreaterThan(3000);
  });

  it("«hey jarvis» vero supera la soglia", async () => {
    expect(await punteggioMassimo(clip.campioni, 16000)).toBeGreaterThan(SOGLIA);
  }, 60_000);

  it("anche da un microfono a 48 kHz o 44,1 kHz, ricampionato come sul pannello", async () => {
    expect(await punteggioMassimo(aFrequenza(clip.campioni, 48000), 48000)).toBeGreaterThan(SOGLIA);
    expect(await punteggioMassimo(aFrequenza(clip.campioni, 44100), 44100)).toBeGreaterThan(SOGLIA);
  }, 120_000);

  it("il rumore (anche con raffiche simili alla voce) resta basso", async () => {
    expect(await punteggioMassimo(rumore.campioni, 16000)).toBeLessThan(0.1);
  }, 60_000);

  // Nota (01/10): il modello regge il volume. La stessa clip divisa per 32768 IN VIRGOLA MOBILE dà
  // ancora 0,999. Quello che la rompe è la scala float (-1..1) messa in interi: tutto diventa 0 o ±1,
  // cioè silenzio. È l'errore possibile nel worklet del microfono (lo prende parola-audio-vero.spec.ts).
  it("la clip in scala float (-1..1) messa in interi è silenzio: non scatta", async () => {
    const piccola = Int16Array.from(clip.campioni, (v) => Math.round(v / 32768));
    expect(await punteggioMassimo(piccola, 16000)).toBeLessThan(0.1);
  }, 60_000);
});
