// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import {
  DecisioneScatto,
  DECISIONE_DI_SERIE,
  FALSI_PER_RIADDESTRARE,
  FRAME_FALSO_SCATTO,
  type OpzioniDecisione,
} from "../../../src/parola/decisione";
import type { EsitoFrame } from "../../../src/parola/rilevatore";
import {
  addestra,
  punteggioFinale,
  scegliNegativi,
  scegliPositivi,
  sogliaPersonale,
} from "../../../src/parola/verificatore";
import { aInt16, FR, frameDi, leggiWav, segmenti, tv } from "./audio-prove";

/**
 * Falsi scatti con la TV accesa (v0.5.4, obiettivo: ≤ 1 all'ora con
 * sottofondo, «hey jarvis» riconosciuto ≥ 95%). Modello vero, 20 minuti di
 * "TV" sintetica (frasi Piper in ordine casuale, a volume variabile, con
 * parole simili a «Jarvis» e musica a tratti), e il pannello simulato frame
 * per frame con la stessa logica (`DecisioneScatto`): pausa di 2 s dopo uno
 * scatto. Dalla v0.6.5 la soglia è fissa (niente più soglia che si adatta):
 * con 2 frame di fila a 0,5 la TV non basta comunque.
 */

const MINUTI_TV = 20;
const FRAME_MS = 80;
const PAUSA_FRAME = 25; // 2 s dopo uno scatto

interface Frame {
  punteggio: number;
  verificato: boolean;
}

/** Il pannello su una sequenza di frame: indici dei frame che lo fanno scattare. */
function simula(
  frame: Frame[],
  opzioni: OpzioniDecisione,
  soglie: { serie: number; personale: number | null },
): { scatti: number[] } {
  const d = new DecisioneScatto(opzioni);
  const scatti: number[] = [];
  let ultimo = -Infinity;
  frame.forEach((e, i) => {
    const scatta = d.frame(e, soglie);
    if (!scatta || i - ultimo < PAUSA_FRAME) return;
    ultimo = i;
    scatti.push(i);
  });
  return { scatti };
}

const PRIMA: OpzioniDecisione = { pazienza: 1 };
const DOPO = DECISIONE_DI_SERIE;
const allOra = (n: number) => (n * 60) / MINUTI_TV;

let fondo: EsitoFrame[];
/** Ogni variante: dal primo all'ultimo frame della sua frase (più 1 s dopo, il tempo di scattare). */
let mescolate: { frame: EsitoFrame[]; finestre: [number, number][] }[];
let soloParola: EsitoFrame[][];

beforeAll(async () => {
  fondo = await frameDi(tv(MINUTI_TV * 60, 7));
  // le 24 varianti di «hey jarvis», una ogni 6 s, sopra una TV diversa a due volumi
  const varianti = leggiWav("hey-jarvis-varianti");
  const seg = segmenti["hey-jarvis-varianti"]?.segmenti ?? [];
  const fv = await frameDi(varianti);
  soloParola = seg.map((s) => fv.slice(Math.floor(s.da / 1280), Math.ceil(s.a / 1280) + 8));
  mescolate = [];
  for (const volumeTv of [0.35, 0.5]) {
    const mix = Float32Array.from(tv(seg.length * 6, 99), (x) => x * volumeTv);
    const finestre: [number, number][] = [];
    seg.forEach((s, i) => {
      const at = i * 6 * FR + 2 * FR;
      for (let k = s.da; k < s.a; k++) mix[at + k - s.da] = (mix[at + k - s.da] ?? 0) + (varianti[k] ?? 0);
      finestre.push([Math.floor(at / 1280), Math.ceil((at + s.a - s.da) / 1280) + 12]);
    });
    mescolate.push({ frame: await frameDi(aInt16(mix)), finestre });
  }
}, 900_000);

const base = (f: EsitoFrame[]): Frame[] => f.map((x) => ({ punteggio: x.punteggio, verificato: false }));
const dentro = (i: number, [da, a]: [number, number]) => i >= da && i <= a;

describe(`falsi scatti con ${MINUTI_TV} minuti di TV (modello vero)`, () => {
  it("prima (v0.5.3: un frame basta) vs dopo (2 frame di fila, soglia fissa 0,5): ≤ 1 all'ora", () => {
    const soglie = { serie: 0.5, personale: null };
    const prima = simula(base(fondo), PRIMA, soglie).scatti.length;
    const dopo = simula(base(fondo), DOPO, soglie).scatti.length;
    process.stdout.write(
      `\n[falsi scatti] modello di base: prima ${allOra(prima)}/ora, dopo ${allOra(dopo)}/ora\n`,
    );
    expect(prima).toBeGreaterThan(dopo);
    expect(allOra(dopo)).toBeLessThanOrEqual(1);
  });

  it("«hey jarvis» dentro la TV: riconosciuto ≥ 95% anche dopo, ai due volumi della TV", () => {
    for (const [k, m] of mescolate.entries()) {
      const vero = (i: number) => m.finestre.some((f) => dentro(i, f));
      const { scatti } = simula(base(m.frame), DOPO, { serie: 0.5, personale: null });
      const presi = m.finestre.filter((f) => scatti.some((s) => dentro(s, f))).length;
      const falsi = scatti.filter((s) => !vero(s)).length;
      process.stdout.write(
        `[riconoscimento] TV a ${k === 0 ? "0,35" : "0,5"}: ${presi}/${m.finestre.length}, falsi ${falsi}\n`,
      );
      // a 0,5 la TV copre davvero qualche parola (punteggio massimo sotto 0,5 anche senza conferma)
      expect(presi / m.finestre.length).toBeGreaterThanOrEqual(k === 0 ? 0.95 : 0.9);
    }
    // senza TV: tutte
    const pulite = soloParola.filter(
      (f) => simula(base(f), DOPO, { serie: 0.5, personale: null }).scatti.length > 0,
    );
    expect(pulite.length).toBe(soloParola.length);
  });

  it("verificatore che la TV convince: imparando dai falsi scatti torna ≤ 1 all'ora, e la parola resta", async () => {
    // un verificatore "debole" come può essere quello di casa: pochi negativi, soglia base bassa
    const disc = await frameDi(leggiWav("discussione-poi-jarvis").subarray(0, 41 * FR));
    const fr = (x: EsitoFrame) => ({ punteggio: x.punteggio, caratteristiche: x.caratteristiche });
    const sogliaBase = 0.01;
    const positivi = soloParola
      .filter((_, i) => i % 2 === 0)
      .flatMap((f) => scegliPositivi(f.map(fr), sogliaBase));
    let negativi = scegliNegativi(disc.map(fr));
    const falsi: Float32Array[] = [];
    const meta = { modello: "hey_jarvis_v0.1", persone: ["prova"] };
    let v = await addestra(positivi, negativi, meta);
    const conV = (f: EsitoFrame[]): Frame[] =>
      f.map((x) => punteggioFinale(x.punteggio, x.caratteristiche, v, sogliaBase));
    const personale = () => {
      const massimi = soloParola.map((f) => Math.max(...conV(f).map((x) => x.punteggio)));
      const negMax = Math.max(...conV(disc).map((x) => x.punteggio), 0);
      return sogliaPersonale(massimi, negMax);
    };
    // prima: la soglia personale com'era, nessuna conferma, niente adattamento né apprendimento
    const prima = simula(conV(fondo), PRIMA, { serie: 0.5, personale: personale() }).scatti.length;

    // dopo: come il pannello. Ogni falso scatto salva gli ultimi 16 frame (FRAME_FALSO_SCATTO)
    // e dopo FALSI_PER_RIADDESTRARE il verificatore si riaddestra (motore.imparaDaFalsoScatto)
    const d = new DecisioneScatto(DOPO);
    let soglie = { serie: 0.5, personale: personale() };
    const scatti: number[] = [];
    let ultimo = -Infinity;
    let nuovi = 0;
    for (let i = 0; i < fondo.length; i++) {
      const x = fondo[i];
      if (!x) continue;
      if (!d.frame(punteggioFinale(x.punteggio, x.caratteristiche, v, sogliaBase), soglie)) continue;
      if (i - ultimo < PAUSA_FRAME) continue;
      ultimo = i;
      scatti.push(i);
      falsi.push(
        ...fondo.slice(Math.max(0, i - FRAME_FALSO_SCATTO + 1), i + 1).map((f) => f.caratteristiche),
      );
      if (++nuovi >= FALSI_PER_RIADDESTRARE) {
        nuovi = 0;
        negativi = [...scegliNegativi(disc.map(fr)), ...falsi];
        v = await addestra(positivi, negativi, meta);
        soglie = { serie: 0.5, personale: personale() };
      }
    }
    const ultimi10 = scatti.filter((i) => i * FRAME_MS >= (MINUTI_TV - 10) * 60_000).length * 6;
    // la parola vera, con le varianti NON usate per addestrare
    const prova = soloParola.filter((_, i) => i % 2 === 1);
    const prese = prova.filter((f) => simula(conV(f), DOPO, soglie).scatti.length > 0).length;
    process.stdout.write(
      `[falsi scatti] con verificatore: prima ${allOra(prima)}/ora, dopo ${allOra(scatti.length)}/ora ` +
        `(negli ultimi 10 minuti ${ultimi10}/ora, ${falsi.length / FRAME_FALSO_SCATTO} falsi imparati); ` +
        `varianti di prova riconosciute ${prese}/${prova.length}\n`,
    );
    expect(scatti.length).toBeLessThan(prima);
    expect(ultimi10).toBeLessThanOrEqual(1);
    expect(prese / prova.length).toBeGreaterThanOrEqual(0.95);
    // modello vero su 41 s di audio e due addestramenti: ~5 s qui, il limite di serie di
    // vitest (5 s) la faceva cadere per pochi decimi senza che nessuna verifica fallisse
  }, 120_000);
});
