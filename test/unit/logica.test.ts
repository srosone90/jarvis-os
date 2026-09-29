import { describe, expect, it, vi } from "vitest";
import { calcolaAttesa, ATTESA_MASSIMA_MS } from "../../src/connessione/backoff";
import { LogCircolare } from "../../src/diagnostica/log";
import { condizione, numero, prossimiGiorni } from "../../src/meteo/testi";
import { deveRicaricare, giornoDi } from "../../src/pwa/ricarica-notturna";
import { applicaAggiornamento } from "../../src/stato/entita";
import { Negozio } from "../../src/stato/negozio";

describe("backoff della riconnessione", () => {
  it("il primo tentativo parte subito", () => {
    expect(calcolaAttesa(0)).toBe(0);
  });
  it("cresce esponenzialmente con metà fissa e metà casuale", () => {
    expect(calcolaAttesa(1, () => 0)).toBe(500);
    expect(calcolaAttesa(1, () => 1)).toBe(1000);
    expect(calcolaAttesa(3, () => 0)).toBe(2000);
    expect(calcolaAttesa(3, () => 1)).toBe(4000);
  });
  it("non supera mai 30 s, anche dopo ore di blackout", () => {
    for (const t of [6, 10, 50, 1000]) {
      expect(calcolaAttesa(t, () => 1)).toBe(ATTESA_MASSIMA_MS);
      expect(calcolaAttesa(t, () => 0)).toBe(ATTESA_MASSIMA_MS / 2);
    }
  });
});

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

describe("aggiornamenti compressi delle entità", () => {
  const a = (s: string) => ({ s, a: { x: 1 }, c: "ctx", lc: 1_700_000_000 });

  it("aggiunge, cambia e rimuove", () => {
    let st = applicaAggiornamento({}, { a: { "sensor.t": a("20"), "sensor.u": a("50") } }, true);
    expect(st["sensor.t"]?.state).toBe("20");
    st = applicaAggiornamento(
      st,
      { c: { "sensor.t": { "+": { s: "21", a: { y: 2 } }, "-": { a: ["x"] } } } },
      false,
    );
    expect(st["sensor.t"]?.state).toBe("21");
    expect(st["sensor.t"]?.attributes).toEqual({ y: 2 });
    st = applicaAggiornamento(st, { r: ["sensor.u"] }, false);
    expect(st["sensor.u"]).toBeUndefined();
  });

  it("le entità non toccate restano lo stesso oggetto", () => {
    const prima = applicaAggiornamento({}, { a: { "sensor.t": a("20"), "sensor.u": a("50") } }, true);
    const dopo = applicaAggiornamento(prima, { c: { "sensor.t": { "+": { s: "21" } } } }, false);
    expect(dopo["sensor.u"]).toBe(prima["sensor.u"]);
    expect(dopo["sensor.t"]).not.toBe(prima["sensor.t"]);
  });

  it("dopo una riconnessione lo stato completo sostituisce tutto: niente entità fantasma", () => {
    const prima = applicaAggiornamento({}, { a: { "sensor.t": a("20"), "sensor.cancellata": a("1") } }, true);
    const dopo = applicaAggiornamento(prima, { a: { "sensor.t": a("22") } }, true);
    expect(Object.keys(dopo)).toEqual(["sensor.t"]);
  });

  it("una differenza su un'entità sconosciuta si ignora senza errori", () => {
    expect(applicaAggiornamento({}, { c: { "sensor.boh": { "+": { s: "1" } } } }, false)).toEqual({});
  });
});

describe("negozio delle entità", () => {
  const e = (id: string, state: string) => ({
    entity_id: id,
    state,
    attributes: {},
    context: { id: "", parent_id: null, user_id: null },
    last_changed: "",
    last_updated: "",
  });

  it("avvisa solo chi osserva le entità cambiate", () => {
    const n = new Negozio();
    const t = e("sensor.t", "1");
    n.aggiorna({ "sensor.t": t, "sensor.u": e("sensor.u", "1") });
    const suT = vi.fn();
    const suU = vi.fn();
    n.osserva(["sensor.t"], suT);
    n.osserva(["sensor.u"], suU);
    n.aggiorna({ "sensor.t": t, "sensor.u": e("sensor.u", "2") });
    expect(suT).not.toHaveBeenCalled();
    expect(suU).toHaveBeenCalledTimes(1);
  });

  it("avvisa anche quando un'entità sparisce", () => {
    const n = new Negozio();
    n.aggiorna({ "sensor.t": e("sensor.t", "1") });
    const f = vi.fn();
    n.osserva(["sensor.t"], f);
    n.aggiorna({});
    expect(f).toHaveBeenCalledTimes(1);
    expect(n.entitaDi("sensor.t")).toBeUndefined();
  });

  it("smettere di osservare non lascia ascoltatori appesi", () => {
    const n = new Negozio();
    const f = vi.fn();
    n.osserva(["sensor.t"], f)();
    n.aggiorna({ "sensor.t": e("sensor.t", "1") });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("testi del meteo", () => {
  it("condizioni in italiano, e una sconosciuta non rompe niente", () => {
    expect(condizione("partlycloudy").testo).toBe("Parz. nuvoloso");
    expect(condizione("clear-night").testo).toBe("Sereno");
    expect(condizione("boh").testo).toBe("Non disponibile");
    expect(condizione(undefined).testo).toBe("Non disponibile");
  });

  it("numeri con la virgola, e i non-numeri diventano null", () => {
    expect(numero("25.7")).toBe("25,7");
    expect(numero(44, 0)).toBe("44");
    expect(numero("unavailable")).toBeNull();
    expect(numero("")).toBeNull();
  });

  it("oggi per max/min, poi i prossimi 4 giorni; i giorni passati si scartano", () => {
    const adesso = new Date(2026, 8, 29, 10, 0);
    const giorno = (d: number, t: number) => ({
      datetime: new Date(2026, 8, d, 12).toISOString(),
      condition: "sunny",
      temperature: t,
      templow: t - 8,
    });
    const { oggi, prossimi } = prossimiGiorni(
      [28, 29, 30, 31, 32, 33, 34].map((d) => giorno(d, d)),
      adesso,
    );
    expect(oggi?.massima).toBe("29°");
    expect(prossimi.map((g) => g.massima)).toEqual(["30°", "31°", "32°", "33°"]);
    expect(prossimi[0]?.etichetta).toBe("mer");
  });
});

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
