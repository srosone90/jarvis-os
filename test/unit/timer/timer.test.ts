import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISPOSITIVO_SENZA_STANZA, dispositivoDi, slugStanza } from "../../../src/timer/pannello";
import {
  applicaEventoTimer,
  leggiElencoAttivi,
  rimastoMs,
  formattaRimasto,
  leggiEvento,
  OLTRE_LO_ZERO_MS,
  SUONERIA_MASSIMA_MS,
  Timer,
  titoloFinito,
  type Suona,
} from "../../../src/timer/timer";

describe("timer: lettura degli eventi jarvis_timer", () => {
  it("formato della sessione server (30/09)", () => {
    expect(
      leggiEvento({ tipo: "started", id: "a1", nome: "pasta", secondi_totali: 600, secondi_rimasti: 600 }),
    ).toEqual({
      tipo: "started",
      id: "a1",
      nome: "pasta",
      secondiTotali: 600,
      secondiRimasti: 600,
      pannello: null,
      inPausa: null,
    });
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
      {
        tipo: "started",
        id: "a",
        nome: "pasta",
        secondiTotali: 600,
        secondiRimasti: 600,
        pannello: null,
        inPausa: null,
      },
      1000,
    );
    expect(e).toEqual([
      { id: "a", nome: "pasta", secondiTotali: 600, scadenza: 601_000, inPausa: false, fermoMs: 600_000 },
    ]);
    e = applicaEventoTimer(
      e,
      {
        tipo: "updated",
        id: "a",
        nome: null,
        secondiTotali: null,
        secondiRimasti: 60,
        pannello: null,
        inPausa: null,
      },
      2000,
    );
    expect(e).toEqual([
      { id: "a", nome: "pasta", secondiTotali: 600, scadenza: 62_000, inPausa: false, fermoMs: 60_000 },
    ]);
    e = applicaEventoTimer(
      e,
      {
        tipo: "started",
        id: "b",
        nome: null,
        secondiTotali: 30,
        secondiRimasti: 30,
        pannello: null,
        inPausa: null,
      },
      2000,
    );
    // in ordine di scadenza
    expect(e.map((t) => t.id)).toEqual(["b", "a"]);
    expect(
      applicaEventoTimer(
        e,
        {
          tipo: "cancelled",
          id: "a",
          nome: null,
          secondiTotali: null,
          secondiRimasti: null,
          pannello: null,
          inPausa: null,
        },
        0,
      ).map((t) => t.id),
    ).toEqual(["b"]);
    expect(
      applicaEventoTimer(
        e,
        {
          tipo: "finished",
          id: "b",
          nome: null,
          secondiTotali: null,
          secondiRimasti: 0,
          pannello: null,
          inPausa: null,
        },
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

  function prova(mio = "jarvis_cucina", attivi: unknown = { timer: [] }) {
    const suoneria = { avvia: vi.fn(), ferma: vi.fn() } satisfies Suona;
    let ora = 0;
    const servizi = vi.fn((servizio: string, _dati: Record<string, unknown>) =>
      servizio === "timer_attivi" ? Promise.resolve(attivi) : Promise.resolve({}),
    );
    const timer = new Timer(
      suoneria,
      servizi,
      () => mio,
      () => ora,
    );
    return {
      timer,
      suoneria,
      servizi,
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

  const primo = (t: Timer) => {
    const [x] = t.attivi;
    if (!x) throw new Error("nessun timer attivo");
    return x;
  };

  it("pausa (jarvis_voce 0.2.3): il conto si ferma, non sparisce a zero, riparte da dove era", () => {
    const { timer, avanza } = prova();
    timer.suEvento({ tipo: "started", id: "a", nome: "pasta", secondi_totali: 600, secondi_rimasti: 600 });
    avanza(100_000);
    expect(rimastoMs(primo(timer), 100_000)).toBe(500_000);
    timer.suEvento({ tipo: "updated", id: "a", secondi_rimasti: 500, in_pausa: true });
    avanza(OLTRE_LO_ZERO_MS * 20);
    // fermo a 8:20 e ancora lì molto dopo la vecchia scadenza
    expect(timer.attivi).toHaveLength(1);
    expect(timer.attivi[0]?.inPausa).toBe(true);
    expect(rimastoMs(primo(timer), 100_000 + OLTRE_LO_ZERO_MS * 20)).toBe(500_000);
    const ripresa = 100_000 + OLTRE_LO_ZERO_MS * 20;
    timer.suEvento({ tipo: "updated", id: "a", secondi_rimasti: 500, in_pausa: false });
    avanza(10_000);
    expect(rimastoMs(primo(timer), ripresa + 10_000)).toBe(490_000);
    expect(timer.attivi[0]?.nome).toBe("pasta");
  });

  it("evento non valido: annotato e ignorato, niente suona", () => {
    const { timer, suoneria } = prova();
    timer.suEvento({ tipo: "boh" });
    expect(timer.attivi).toHaveLength(0);
    expect(suoneria.avvia).not.toHaveBeenCalled();
  });
});

describe("timer: ognuno sul suo pannello (v0.4.6)", () => {
  it("device_id: 'jarvis_' + slug con la regola del server (valori dalla sua regola in Python, 30/09)", () => {
    // unicodedata NFKD, via i combinanti, str.isalnum, "_" compressi: calcolati in Python
    const dal_server: [string, string][] = [
      ["Cucina", "cucina"],
      ["Camera da letto", "camera_da_letto"],
      ["Camera dell'ospite", "camera_dell_ospite"],
      ["Camera dell'ospite – Già", "camera_dell_ospite_gia"],
      ["Stanza ½", "stanza_1_2"],
      ["Soggiorno  grande", "soggiorno_grande"],
      ["Città", "citta"],
      ["Àtrio-nord", "atrio_nord"],
      ["Bagno n°2", "bagno_n_2"],
      ["Straße", "straße"],
      ["  Salotto  ", "salotto"],
      ["_x_", "x"],
    ];
    for (const [nome, slug] of dal_server) expect(slugStanza(nome)).toBe(slug);
    expect(dispositivoDi("Camera da letto")).toBe("jarvis_camera_da_letto");
    expect(dispositivoDi(null)).toBeNull();
    expect(DISPOSITIVO_SENZA_STANZA).toBe("jarvis_pannello");
  });

  function prova(mio: string, attivi: unknown = { timer: [] }) {
    const suoneria = { avvia: vi.fn(), ferma: vi.fn() } satisfies Suona;
    const servizi = vi.fn((servizio: string, _dati: Record<string, unknown>) =>
      servizio === "timer_attivi" ? Promise.resolve(attivi) : Promise.resolve({}),
    );
    return {
      timer: new Timer(
        suoneria,
        servizi,
        () => mio,
        () => 0,
      ),
      suoneria,
      servizi,
    };
  }

  it("suona e mostra solo i timer suoi; senza 'pannello' (server vecchio) valgono per tutti", () => {
    const { timer, suoneria } = prova("jarvis_cucina");
    timer.suEvento({
      tipo: "started",
      id: "c",
      nome: "pasta",
      secondi_rimasti: 60,
      pannello: "jarvis_cucina",
    });
    timer.suEvento({
      tipo: "started",
      id: "l",
      nome: "riposo",
      secondi_rimasti: 60,
      pannello: "jarvis_camera_da_letto",
    });
    expect(timer.attivi.map((t) => t.id)).toEqual(["c"]);
    timer.suEvento({ tipo: "finished", id: "l", pannello: "jarvis_camera_da_letto" });
    expect(suoneria.avvia).not.toHaveBeenCalled();
    timer.suEvento({ tipo: "finished", id: "c", pannello: "jarvis_cucina" });
    expect(suoneria.avvia).toHaveBeenCalledOnce();
    timer.suEvento({ tipo: "finished", id: "vecchio" });
    expect(timer.suonano.map((f) => f.id)).toEqual(["c", "vecchio"]);
  });

  it("Stop chiama jarvis_voce.timer_ferma per ogni timer che suonava", () => {
    const { timer, servizi } = prova("jarvis_cucina");
    timer.suEvento({ tipo: "finished", id: "c1", pannello: "jarvis_cucina" });
    timer.suEvento({ tipo: "finished", id: "c2", pannello: "jarvis_cucina" });
    timer.ferma();
    expect(servizi.mock.calls.filter((c) => c[0] === "timer_ferma").map((c) => c[1])).toEqual([
      { id: "c1" },
      { id: "c2" },
    ]);
  });

  it("'fermato' da un altro pannello ferma la suoneria qui; un id che non suona non tocca niente", () => {
    const { timer, suoneria, servizi } = prova("jarvis_cucina");
    timer.suEvento({ tipo: "finished", id: "c1", pannello: "jarvis_cucina" });
    timer.suEvento({ tipo: "fermato", id: "altro" });
    expect(timer.suonano).toHaveLength(1);
    expect(suoneria.ferma).not.toHaveBeenCalled();
    timer.suEvento({ tipo: "fermato", id: "c1" });
    expect(timer.suonano).toHaveLength(0);
    expect(suoneria.ferma).toHaveBeenCalledOnce();
    // non si rimanda timer_ferma: è già arrivato da un altro
    expect(servizi.mock.calls.some((c) => c[0] === "timer_ferma")).toBe(false);
  });

  it("rilettura: tiene solo i timer suoi dalla risposta di timer_attivi", async () => {
    const { timer } = prova("jarvis_cucina", {
      timer: [
        { id: "c", nome: "pasta", secondi_totali: 600, secondi_rimasti: 300, pannello: "jarvis_cucina" },
        {
          id: "l",
          nome: "riposo",
          secondi_totali: 60,
          secondi_rimasti: 30,
          pannello: "jarvis_camera_da_letto",
        },
      ],
    });
    await timer.rileggi("prova");
    expect(timer.attivi).toEqual([
      { id: "c", nome: "pasta", secondiTotali: 600, scadenza: 300_000, inPausa: false, fermoMs: 300_000 },
    ]);
  });

  it("risposta di timer_attivi: chiavi accettate e forma sconosciuta", () => {
    const t = { id: "x", secondi_rimasti: 5 };
    expect(leggiElencoAttivi({ timer: [t] })).toHaveLength(1);
    expect(leggiElencoAttivi({ timers: [t] })).toHaveLength(1);
    expect(leggiElencoAttivi([t])).toHaveLength(1);
    expect(leggiElencoAttivi({ niente: 1 })).toBeNull();
  });
});
