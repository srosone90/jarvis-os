import { describe, expect, it, vi } from "vitest";

import { durataParlata, etichettaDurata } from "../../../src/timer/frasi";
import { esitoServizioTimer, Timer } from "../../../src/timer/timer";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

describe("timer dalla schermata (v0.5.8: servizi di jarvis_voce 0.3.0)", () => {
  it("durate in parole e sui pulsanti", () => {
    expect(durataParlata(45)).toBe("45 secondi");
    expect(durataParlata(5400)).toBe("1 ora e 30 minuti");
    expect(durataParlata(7200)).toBe("2 ore");
    expect(etichettaDurata(5)).toBe("5 min");
    expect(etichettaDurata(60)).toBe("1 h");
    expect(etichettaDurata(90)).toBe("1 h 30");
  });
  it("esito del servizio: ok = null, errore col messaggio del server, il resto non riconosciuto", () => {
    expect(esitoServizioTimer({ esito: "ok", id: "t1", pannello: "jarvis_cucina" })).toBeNull();
    expect(
      esitoServizioTimer({ esito: "errore", messaggio: "Timer non trovato (forse è già finito)." }),
    ).toBe("Timer non trovato (forse è già finito).");
    expect(esitoServizioTimer({ esito: "errore" })).toBe("il server ha detto di no");
    // controprova: senza esito non si dice mai "fatto"
    expect(esitoServizioTimer({})).toContain("non riconosciuta");
    expect(esitoServizioTimer(null)).toContain("non riconosciuta");
  });

  const suoneria = { avvia: () => undefined, ferma: () => undefined };
  it("avvia: timer_stanza con la stanza e i minuti; comando: timer_comando con id e azione", async () => {
    const servizi = vi.fn((_s: string, _d: Record<string, unknown>) =>
      Promise.resolve({ esito: "ok", id: "t9", pannello: "jarvis_cucina" }),
    );
    const t = new Timer(suoneria, servizi, () => "jarvis_cucina");
    expect(await t.avvia("cucina", { minuti: 5 })).toBeNull();
    expect(servizi).toHaveBeenLastCalledWith("timer_stanza", { stanza: "cucina", minuti: 5 });
    expect(await t.avvia("cucina", { minuti: 10 }, "pasta")).toBeNull();
    expect(servizi).toHaveBeenLastCalledWith("timer_stanza", { stanza: "cucina", minuti: 10, nome: "pasta" });
    for (const azione of ["annulla", "pausa", "riprendi"] as const) {
      expect(await t.comando("t9", azione)).toBeNull();
      expect(servizi).toHaveBeenLastCalledWith("timer_comando", { id: "t9", azione });
    }
  });
  it("controprove: timer già finito, server senza la 0.3.0, connessione caduta", async () => {
    const finito = new Timer(
      suoneria,
      () => Promise.resolve({ esito: "errore", messaggio: "Timer non trovato (forse è già finito)." }),
      () => "x",
    );
    expect(await finito.comando("t1", "annulla")).toBe("Timer non trovato (forse è già finito).");
    const vecchio = new Timer(
      suoneria,
      () => Promise.reject(new Error("Service jarvis_voce.timer_stanza not found")),
      () => "x",
    );
    expect(await vecchio.avvia("cucina", { minuti: 1 })).toBe("serve jarvis_voce 0.3.0 sul server");
    const caduta = new Timer(
      suoneria,
      () => Promise.reject(new Error("socket chiuso")),
      () => "x",
    );
    expect(await caduta.comando("t1", "pausa")).toContain("socket chiuso");
  });
});
