import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicaEventoTimer,
  formattaRimasto,
  leggiEvento,
  OLTRE_LO_ZERO_MS,
  SUONERIA_MASSIMA_MS,
  Timer,
  titoloFinito,
  type Suona,
} from "../../src/timer/timer";

describe("timer: lettura degli eventi jarvis_timer", () => {
  it("formato della sessione server (30/09)", () => {
    expect(
      leggiEvento({ tipo: "started", id: "a1", nome: "pasta", secondi_totali: 600, secondi_rimasti: 600 }),
    ).toEqual({ tipo: "started", id: "a1", nome: "pasta", secondiTotali: 600, secondiRimasti: 600 });
  });

  it("nome vuoto = senza nome; id numerico accettato; tipo sconosciuto scartato", () => {
    expect(leggiEvento({ tipo: "finished", id: 7, nome: "  " })?.nome).toBeNull();
    expect(leggiEvento({ tipo: "finished", id: 7 })?.id).toBe("7");
    expect(leggiEvento({ tipo: "paused", id: "a" })).toBeNull();
    expect(leggiEvento({ tipo: "started" })).toBeNull();
    expect(leggiEvento(null)).toBeNull();
  });

  it("conto alla rovescia: minuti:secondi, ore quando servono, mai negativo", () => {
    expect(formattaRimasto(600_000)).toBe("10:00");
    expect(formattaRimasto(59_001)).toBe("1:00");
    expect(formattaRimasto(3_725_000)).toBe("1:02:05");
    expect(formattaRimasto(-5000)).toBe("0:00");
    expect(titoloFinito("pasta")).toBe("Timer pasta finito");
    expect(titoloFinito(null)).toBe("Timer finito");
  });

  it("started aggiunge, updated sposta la scadenza e tiene il nome, cancelled e finished tolgono", () => {
    let e = applicaEventoTimer(
      [],
      { tipo: "started", id: "a", nome: "pasta", secondiTotali: 600, secondiRimasti: 600 },
      1000,
    );
    expect(e).toEqual([{ id: "a", nome: "pasta", secondiTotali: 600, scadenza: 601_000 }]);
    e = applicaEventoTimer(
      e,
      { tipo: "updated", id: "a", nome: null, secondiTotali: null, secondiRimasti: 60 },
      2000,
    );
    expect(e).toEqual([{ id: "a", nome: "pasta", secondiTotali: 600, scadenza: 62_000 }]);
    e = applicaEventoTimer(
      e,
      { tipo: "started", id: "b", nome: null, secondiTotali: 30, secondiRimasti: 30 },
      2000,
    );
    // in ordine di scadenza
    expect(e.map((t) => t.id)).toEqual(["b", "a"]);
    expect(
      applicaEventoTimer(
        e,
        { tipo: "cancelled", id: "a", nome: null, secondiTotali: null, secondiRimasti: null },
        0,
      ).map((t) => t.id),
    ).toEqual(["b"]);
    expect(
      applicaEventoTimer(
        e,
        { tipo: "finished", id: "b", nome: null, secondiTotali: null, secondiRimasti: 0 },
        0,
      ).map((t) => t.id),
    ).toEqual(["a"]);
  });
});

describe("timer: suoneria", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function prova() {
    const suoneria = { avvia: vi.fn(), ferma: vi.fn() } satisfies Suona;
    let ora = 0;
    const timer = new Timer(suoneria, () => ora);
    return {
      timer,
      suoneria,
      avanza: (ms: number) => {
        ora += ms;
        vi.advanceTimersByTime(ms);
      },
    };
  }

  it("finished suona col nome del timer (anche se l'evento non lo ripete); Stop ferma", () => {
    const { timer, suoneria } = prova();
    timer.suEvento({ tipo: "started", id: "a", nome: "pasta", secondi_totali: 5, secondi_rimasti: 5 });
    timer.suEvento({ tipo: "finished", id: "a", secondi_rimasti: 0 });
    expect(suoneria.avvia).toHaveBeenCalledOnce();
    expect(timer.suonano.map((f) => f.nome)).toEqual(["pasta"]);
    expect(timer.attivi).toHaveLength(0);
    expect(timer.occupato).toBe(true);
    // lo stesso finished ripetuto non si accoda due volte
    timer.suEvento({ tipo: "finished", id: "a", secondi_rimasti: 0 });
    expect(timer.suonano).toHaveLength(1);
    timer.ferma();
    expect(suoneria.ferma).toHaveBeenCalledOnce();
    expect(timer.suonano).toHaveLength(0);
    expect(timer.occupato).toBe(false);
  });

  it("si ferma da sola dopo 2 minuti", () => {
    const { timer, suoneria, avanza } = prova();
    timer.suEvento({ tipo: "finished", id: "a", nome: "uova" });
    avanza(SUONERIA_MASSIMA_MS - 1000);
    expect(suoneria.ferma).not.toHaveBeenCalled();
    avanza(1001);
    expect(suoneria.ferma).toHaveBeenCalledOnce();
    expect(timer.suonano).toHaveLength(0);
  });

  it("un timer a zero senza finished sparisce dopo un minuto, senza suonare", () => {
    const { timer, suoneria, avanza } = prova();
    timer.suEvento({ tipo: "started", id: "a", nome: "pasta", secondi_totali: 10, secondi_rimasti: 10 });
    avanza(10_000 + OLTRE_LO_ZERO_MS - 5000);
    expect(timer.attivi).toHaveLength(1);
    avanza(10_000);
    expect(timer.attivi).toHaveLength(0);
    expect(suoneria.avvia).not.toHaveBeenCalled();
  });

  it("evento non valido: annotato e ignorato, niente suona", () => {
    const { timer, suoneria } = prova();
    timer.suEvento({ tipo: "boh" });
    expect(timer.attivi).toHaveLength(0);
    expect(suoneria.avvia).not.toHaveBeenCalled();
  });
});
