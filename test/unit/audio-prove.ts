import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { RilevatoreOpenWakeWord, type EsitoFrame } from "../../src/parola/rilevatore";

/**
 * Aiuti per le prove col modello vero e l'audio delle clip (test/dati/audio):
 * lettura dei WAV, il rilevatore come sul pannello, musica sintetica e un
 * generatore pseudocasuale con seme fisso (le prove danno sempre gli stessi numeri).
 */

ort.env.wasm.numThreads = 1;
export const FR = 16000;

export interface Segmento {
  testo: string | null;
  da: number;
  a: number;
}
export const segmenti = JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8")) as Record<
  string,
  { campioni: number; segmenti: Segmento[] }
>;

export function leggiWav(nome: string): Int16Array {
  const b = readFileSync(`test/dati/audio/${nome}.wav`);
  const dati = b.indexOf("data");
  const n = b.readUInt32LE(dati + 4) / 2;
  return Int16Array.from({ length: n }, (_, i) => b.readInt16LE(dati + 8 + i * 2));
}

const modello = (f: string) => new Uint8Array(readFileSync(`modelli/openwakeword/${f}`));

export function creaRilevatore(): Promise<RilevatoreOpenWakeWord> {
  return RilevatoreOpenWakeWord.crea(
    ort,
    { id: "hey_jarvis_v0.1", parola: "Jarvis", licenza: "CC BY-NC-SA 4.0", commerciale: false },
    {
      melspettrogramma: modello("melspectrogram.onnx"),
      embedding: modello("embedding_model.onnx"),
      classificatore: modello("hey_jarvis_v0.1.onnx"),
    },
  );
}

/** Tutti i frame (80 ms) di un audio, a pezzi da 1024 campioni come il pannello. */
export async function frameDi(pcm: Int16Array): Promise<EsitoFrame[]> {
  const r = await creaRilevatore();
  const tutti: EsitoFrame[] = [];
  for (let i = 0; i < pcm.length; i += 1024) tutti.push(...(await r.elabora(pcm.subarray(i, i + 1024))));
  return tutti;
}

/** mulberry32: pseudocasuale con seme. */
export function casuale(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Musica sintetica: accordi (tre sinusoidi con armoniche), basso, cassa e
 * charleston (rumore corto), tempo 100-130. Ampiezza di picco ~`volume`.
 */
export function musica(secondi: number, seme: number, volume = 4000): Float32Array {
  const r = casuale(seme);
  const n = Math.round(secondi * FR);
  const out = new Float32Array(n);
  const bpm = 100 + r() * 30;
  const battito = Math.round((60 / bpm) * FR);
  const radici = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392];
  for (let inizio = 0; inizio < n; inizio += battito * 4) {
    const f0 = radici[Math.floor(r() * radici.length)] ?? 220;
    const note = [f0, f0 * 1.26, f0 * 1.5];
    for (let i = inizio; i < Math.min(n, inizio + battito * 4); i++) {
      const t = i / FR;
      let v = 0;
      for (const f of note) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t);
      v += 1.5 * Math.sin(Math.PI * f0 * t);
      out[i] = (out[i] ?? 0) + (v / 6) * volume * 0.6;
    }
    for (let b = 0; b < 4; b++) {
      const k = inizio + b * battito;
      for (let i = 0; i < 1600 && k + i < n; i++) {
        const inv = Math.exp(-i / 300);
        out[k + i] = (out[k + i] ?? 0) + Math.sin((2 * Math.PI * 60 * i) / FR) * inv * volume;
        const h = k + Math.round(battito / 2) + i;
        if (i < 400 && h < n) out[h] = (out[h] ?? 0) + (r() * 2 - 1) * Math.exp(-i / 80) * volume * 0.3;
      }
    }
  }
  return out;
}

export function aInt16(f: Float32Array): Int16Array {
  return Int16Array.from(f, (x) => Math.max(-32768, Math.min(32767, Math.round(x))));
}

/**
 * "TV accesa" per `secondi`: le frasi del sottofondo (e della discussione,
 * senza la frase con «hey jarvis») in ordine casuale, a volume variabile, con
 * musica sotto a tratti. Mai «Jarvis» detto davvero.
 */
export function tv(secondi: number, seme: number): Int16Array {
  const r = casuale(seme);
  const sorgenti: Int16Array[] = [];
  const sotto = leggiWav("sottofondo-parlato");
  for (const s of segmenti["sottofondo-parlato"]?.segmenti ?? []) sorgenti.push(sotto.subarray(s.da, s.a));
  const disc = leggiWav("discussione-poi-jarvis");
  for (const s of (segmenti["discussione-poi-jarvis"]?.segmenti ?? []).filter((x) => x.testo).slice(0, -1))
    sorgenti.push(disc.subarray(s.da, s.a));
  const n = Math.round(secondi * FR);
  const voce = new Float32Array(n);
  let pos = 0;
  while (pos < n) {
    const s = sorgenti[Math.floor(r() * sorgenti.length)] ?? new Int16Array(0);
    const g = 0.35 + r() * 0.65;
    for (let i = 0; i < s.length && pos + i < n; i++) voce[pos + i] = (s[i] ?? 0) * g;
    pos += s.length + Math.round((0.1 + r() * 0.6) * FR);
  }
  const m = musica(secondi, seme + 1, 2500);
  // musica a tratti: 20-40 s accesa, 10-30 s spenta
  let acceso = true;
  let cambio = 0;
  for (let i = 0; i < n; i++) {
    if (i >= cambio) {
      acceso = !acceso;
      cambio = i + Math.round((acceso ? 20 + r() * 20 : 10 + r() * 20) * FR);
    }
    if (acceso) voce[i] = (voce[i] ?? 0) + (m[i] ?? 0);
  }
  return aInt16(voce);
}
