import { describe, expect, it, vi } from "vitest";

import { LogCircolare } from "../../../src/diagnostica/log";

describe("log circolare", () => {
  const archivioFinto = () => {
    const dati = new Map<string, string>();
    return {
      getItem: (k: string) => dati.get(k) ?? null,
      setItem: (k: string, v: string) => void dati.set(k, v),
    };
  };

  it("tiene solo le ultime N voci, dalla più recente", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = new LogCircolare(3);
    for (let i = 1; i <= 5; i++) log.aggiungi("errore", `e${i}`, i);
    expect(log.voci().map((v) => v.messaggio)).toEqual(["e5", "e4", "e3"]);
  });

  it("sopravvive alla ricarica tramite l'archivio", () => {
    const archivio = archivioFinto();
    new LogCircolare(10, archivio).aggiungi("info", "prima della ricarica");
    expect(new LogCircolare(10, archivio).voci()[0]?.messaggio).toBe("prima della ricarica");
  });

  it("un archivio corrotto non blocca l'avvio (e lo segnala)", () => {
    const avviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = new LogCircolare(10, { getItem: () => "{rotto", setItem: () => undefined });
    expect(log.voci()).toEqual([]);
    expect(avviso).toHaveBeenCalled();
  });
});
