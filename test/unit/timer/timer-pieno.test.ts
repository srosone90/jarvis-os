import { describe, expect, it } from "vitest";
import {
  LIMITI_SCHERMATE,
  leggiPreferenzeSchermate,
  PREFERENZE_SCHERMATE_DI_SERIE,
} from "../../../src/pagine/preferenze";
import type { TimerAttivo } from "../../../src/timer/timer";
import {
  grandezzaCifre,
  timerPienoPuoRestare,
  timerPienoSiApre,
  timerPrincipale,
} from "../../../src/timer/jarvis-timer-pieno";

/** Timer a tutto schermo (v0.6.2): quando si apre, quando resta, quale timer in grande. */

const base = {
  acceso: true,
  timerAttivi: 1,
  timerCheSuonano: 0,
  voceAttiva: false,
  fermoDaMs: 20_000,
  secondi: 15,
};
const timer = (id: string, inPausa = false) => ({ id, nome: id, inPausa }) as unknown as TimerAttivo;

describe("timer a tutto schermo", () => {
  it("si apre solo dopo i secondi senza tocchi", () => {
    expect(timerPienoSiApre(base)).toBe(true);
    expect(timerPienoSiApre({ ...base, fermoDaMs: 14_999 })).toBe(false);
    expect(timerPienoSiApre({ ...base, fermoDaMs: 15_000 })).toBe(true);
  });
  it("mai: spento, senza timer, mentre un timer suona, mentre Jarvis ascolta o parla", () => {
    for (const c of [{ acceso: false }, { timerAttivi: 0 }, { timerCheSuonano: 1 }, { voceAttiva: true }]) {
      expect(timerPienoSiApre({ ...base, ...c })).toBe(false);
      // e se era già aperto si chiude
      expect(timerPienoPuoRestare({ ...base, ...c })).toBe(false);
    }
  });
  it("aperto resta anche se è appena successo qualcosa (lo chiude il tocco sul timer)", () => {
    expect(timerPienoPuoRestare({ ...base, fermoDaMs: 0 })).toBe(true);
  });
  it("in grande quello che finisce prima tra quelli che scorrono; tutti in pausa: il primo", () => {
    expect(timerPrincipale([timer("pasta", true), timer("uova")])?.id).toBe("uova");
    expect(timerPrincipale([timer("pasta", true), timer("uova", true)])?.id).toBe("pasta");
    expect(timerPrincipale([])).toBeNull();
  });
  it("cifre: più caratteri, più piccole; mai oltre il 32% della larghezza", () => {
    const vw = (t: string) => Number(grandezzaCifre(t).replace("vw", ""));
    expect(vw("5")).toBe(32);
    expect(vw("3:06")).toBeCloseTo(31.3, 1);
    expect(vw("12:29")).toBeLessThan(vw("3:06"));
    expect(vw("1:58:56")).toBeLessThan(vw("12:29"));
    // 1:58:56 entra nell'80% della larghezza con la stima prudente
    expect(vw("1:58:56") * (5 * 0.72 + 2 * 0.4)).toBeLessThanOrEqual(80.1);
  });
  it("preferenze: acceso e 15 s di serie; secondi nei limiti, interi", () => {
    expect(PREFERENZE_SCHERMATE_DI_SERIE).toMatchObject({ timerPieno: true, timerPienoSecondi: 15 });
    const p = leggiPreferenzeSchermate(JSON.stringify({ timerPieno: false, timerPienoSecondi: 999 }));
    expect(p.timerPieno).toBe(false);
    expect(p.timerPienoSecondi).toBe(LIMITI_SCHERMATE.timerPienoSecondi[1]);
    expect(leggiPreferenzeSchermate(JSON.stringify({ timerPienoSecondi: 1.4 })).timerPienoSecondi).toBe(5);
    expect(leggiPreferenzeSchermate(JSON.stringify({ timerPienoSecondi: "x", timerPieno: 1 }))).toMatchObject(
      {
        timerPieno: true,
        timerPienoSecondi: 15,
      },
    );
  });
});
