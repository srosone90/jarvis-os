// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { DecisioneScatto, DECISIONE_DI_SERIE } from "../../../src/parola/decisione";
import type { EsitoFrame } from "../../../src/parola/rilevatore";
import { addestra, probabilita, scegliNegativi, scegliPositivi } from "../../../src/parola/verificatore";
import { aDistanza, FR, frameDi, leggiWav, segmenti, tv } from "./audio-prove";

/**
 * Soglia fissa e distanza (v0.6.5, richiesta di Salvatore del 03/10: «Jarvis»
 * da 3-4 m a voce normale, e non con la TV). Modello vero, la stessa voce a
 * 1, 2, 3 e 4 m (`aDistanza`: diretto −6 dB a ogni raddoppio, riverbero e
 * fruscio della stanza costanti), 24 «Jarvis» da solo e 24 «hey jarvis»; per
 * ogni soglia candidata quante ne prende con 2 frame di fila (la conferma di
 * serie) e quanti falsi scatti all'ora fanno 40 minuti di TV sintetica.
 *
 * Misurato il 03/10 (numeri anche in STATO.md):
 *  - la distanza da sola NON toglie scatti: da 1 a 4 m il punteggio mediano
 *    passa da 0,986 a 0,979 («Jarvis») e da 0,997 a 0,993 («hey jarvis»);
 *  - «Jarvis» da solo ne perde 4-7 su 24 a QUALUNQUE distanza: il modello di
 *    serie è addestrato su «hey jarvis», e alcune intonazioni non le prende;
 *  - TV: 15 falsi all'ora a 0,3, 3 a 0,4, 1,5 a 0,45, zero da 0,5 in su.
 * Quindi soglia di serie 0,5, fissa. Le cause dei mancati scatti da lontano
 * sul pannello erano la soglia che saliva da sola con la TV e lo sconto con
 * qualcuno vicino alla fotocamera (vicino più facile che lontano): tolti.
 */

const METRI = [1, 2, 3, 4] as const;
const SOGLIE = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
/** La soglia di serie (`SOGLIA_DI_SERIE` in src/parola/motore.ts). */
const DI_SERIE = 0.5;
const MINUTI_TV = 40;
const CLIP = ["jarvis-varianti", "hey-jarvis-varianti"] as const;

/** Il punteggio più alto che due frame di fila superano insieme (la conferma di serie). */
const picco2 = (f: readonly { punteggio: number }[]) =>
  f.slice(1).reduce((m, x, i) => Math.max(m, Math.min(x.punteggio, f[i]?.punteggio ?? 0)), 0);

/** Falsi scatti con il pannello simulato frame per frame (pausa di 2 s dopo uno scatto). */
function falsi(frame: EsitoFrame[], soglia: number): number {
  const d = new DecisioneScatto(DECISIONE_DI_SERIE);
  let n = 0;
  let ultimo = -Infinity;
  frame.forEach((e, i) => {
    if (!d.frame({ punteggio: e.punteggio, verificato: false }, { serie: soglia, personale: null })) return;
    if (i - ultimo < 25) return;
    ultimo = i;
    n++;
  });
  return n;
}

/** Per clip e distanza: i frame di ogni frase (più 1 s dopo, il tempo di scattare). */
const finestre = new Map<string, EsitoFrame[][]>();
const prese = (clip: string, m: number, soglia: number) =>
  (finestre.get(`${clip}@${m}`) ?? []).filter((f) => picco2(f) >= soglia).length;
let fondo: EsitoFrame[];

beforeAll(async () => {
  for (const clip of CLIP) {
    const pcm = leggiWav(clip);
    const seg = (segmenti[clip]?.segmenti ?? []).filter((s) => s.testo);
    for (const m of METRI) {
      const f = await frameDi(aDistanza(pcm, m, seg));
      finestre.set(
        `${clip}@${m}`,
        seg.map((s) => f.slice(Math.floor(s.da / 1280), Math.ceil(s.a / 1280) + 12)),
      );
    }
  }
  const metà = (MINUTI_TV / 2) * 60;
  fondo = [...(await frameDi(tv(metà, 7))), ...(await frameDi(tv(metà, 11)))];
  // la tabella completa, per chi deve scegliere un'altra soglia
  const righe = CLIP.flatMap((clip) =>
    METRI.map((m) => {
      const p = (finestre.get(`${clip}@${m}`) ?? []).map(picco2).sort((a, b) => a - b);
      return (
        `${clip} a ${m} m: mediana ${p[p.length >> 1]?.toFixed(3)} | ` +
        SOGLIE.map((s) => `${s}: ${prese(clip, m, s)}/${p.length}`).join("  ")
      );
    }),
  );
  righe.push(
    `TV, falsi all'ora: ${SOGLIE.map((s) => `${s}: ${(falsi(fondo, s) * 60) / MINUTI_TV}`).join("  ")}`,
  );
  process.stdout.write(`\n[distanza]\n${righe.join("\n")}\n`);
}, 900_000);

describe("soglia fissa e distanza (modello vero)", () => {
  it(`a ${DI_SERIE}: «hey jarvis» quasi sempre a ogni distanza, e da 4 m al massimo una in meno che da 1 m`, () => {
    for (const m of METRI) expect(prese("hey-jarvis-varianti", m, DI_SERIE)).toBeGreaterThanOrEqual(23);
    for (const clip of CLIP)
      expect(prese(clip, 4, DI_SERIE)).toBeGreaterThanOrEqual(prese(clip, 1, DI_SERIE) - 1);
  });

  it(`a ${DI_SERIE}: «Jarvis» da solo almeno 7 volte su 10 a ogni distanza (limite del modello, non della distanza)`, () => {
    for (const m of METRI) expect(prese("jarvis-varianti", m, DI_SERIE) / 24).toBeGreaterThanOrEqual(0.7);
  });

  it(`a ${DI_SERIE}: con ${MINUTI_TV} minuti di TV al massimo 1 falso scatto all'ora; più in basso la TV passa`, () => {
    expect((falsi(fondo, DI_SERIE) * 60) / MINUTI_TV).toBeLessThanOrEqual(1);
    // controprova: la soglia non è alta "per caso", a 0,3 la TV inganna davvero
    expect((falsi(fondo, 0.3) * 60) / MINUTI_TV).toBeGreaterThan(5);
  });

  it("verificatore addestrato con esempi vicini (1 m): da lontano dice ancora sì", async () => {
    const fr = (x: EsitoFrame) => ({ punteggio: x.punteggio, caratteristiche: x.caratteristiche });
    const disc = await frameDi(leggiWav("discussione-poi-jarvis").subarray(0, 41 * FR));
    const vicine = finestre.get("hey-jarvis-varianti@1") ?? [];
    const positivi = vicine.filter((_, i) => i % 2 === 0).flatMap((f) => scegliPositivi(f.map(fr), 0.1));
    const v = await addestra(positivi, scegliNegativi(disc.map(fr)), {
      modello: "prova",
      persone: ["prova"],
    });
    for (const m of METRI) {
      // le varianti NON usate per addestrare
      const lontane = (finestre.get(`hey-jarvis-varianti@${m}`) ?? []).filter((_, i) => i % 2 === 1);
      const sì = lontane.filter(
        (f) =>
          picco2(f.map((x) => ({ punteggio: x.punteggio >= 0.1 ? probabilita(v, x.caratteristiche) : 0 }))) >=
          DI_SERIE,
      );
      expect(sì.length).toBe(lontane.length);
    }
  }, 120_000);
});
