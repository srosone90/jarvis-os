import { describe, expect, it } from "vitest";

import { deveRicaricare, giornoDi } from "../../../src/pwa/ricarica-notturna";

describe("ricarica notturna", () => {
  const alle = (h: number, m = 0) => new Date(2026, 8, 29, h, m);
  const unOraFa = (d: Date) => d.getTime() - 3_600_000;

  it("solo tra le 04:00 e le 04:59", () => {
    expect(deveRicaricare(alle(4, 0), unOraFa(alle(4)), null)).toBe(true);
    expect(deveRicaricare(alle(3, 59), unOraFa(alle(3, 59)), null)).toBe(false);
    expect(deveRicaricare(alle(5, 0), unOraFa(alle(5)), null)).toBe(false);
  });
  it("mai se qualcuno ha toccato lo schermo negli ultimi 10 minuti", () => {
    expect(deveRicaricare(alle(4, 30), alle(4, 25).getTime(), null)).toBe(false);
  });
  it("una volta sola per notte", () => {
    expect(deveRicaricare(alle(4, 10), unOraFa(alle(4, 10)), giornoDi(alle(4, 1)))).toBe(false);
  });
});
