import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avvisi } from "../../../src/comune/avvisi";
import { limitaIntero, virgola } from "../../../src/comune/numeri";

/** Riordino del 02/10: il modulo comune non aveva prove sue. */

describe("numeri", () => {
  it("virgola: decimali fissi con la virgola; senza cifre, intero", () => {
    expect(virgola(1.5, 1)).toBe("1,5");
    expect(virgola(0.05, 2)).toBe("0,05");
    expect(virgola(2.4)).toBe("2");
  });
  it("limitaIntero: dentro i limiti e arrotondato", () => {
    expect(limitaIntero(9.6, [0, 15])).toBe(10);
    expect(limitaIntero(-3, [0, 15])).toBe(0);
    expect(limitaIntero(99, [0, 15])).toBe(15);
  });
});

describe("avvisi a schermo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const a of avvisi.attivi) avvisi.chiudi(a.id);
    vi.useRealTimers();
  });

  it("al massimo 3 alla volta, i più recenti; chi ascolta lo sa", () => {
    const ascolto = vi.fn();
    const smetti = avvisi.ascolta(ascolto);
    for (const t of ["uno", "due", "tre", "quattro"]) avvisi.mostra(t);
    expect(avvisi.attivi.map((a) => a.testo)).toEqual(["due", "tre", "quattro"]);
    expect(ascolto).toHaveBeenCalledTimes(4);
    smetti();
  });
  it("le informazioni restano 5 s, gli errori 8 s", () => {
    avvisi.mostra("fatto");
    avvisi.mostra("rifiutato", "errore");
    vi.advanceTimersByTime(5000);
    expect(avvisi.attivi.map((a) => a.testo)).toEqual(["rifiutato"]);
    vi.advanceTimersByTime(3000);
    expect(avvisi.attivi).toEqual([]);
  });
});
