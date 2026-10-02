import { describe, expect, it, vi } from "vitest";
import { calcolaAttesa, ATTESA_MASSIMA_MS } from "../../../src/connessione/backoff";

import { applicaAggiornamento, scrittoDaUnAzione } from "../../../src/connessione/entita";
import { Negozio } from "../../../src/connessione/negozio";

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

  // Regole del context di HA (core.py as_compressed_state, messages.py _state_diff_event)
  describe("context dello stato", () => {
    const id = "climate.x";
    const avvio = applicaAggiornamento({}, { a: { [id]: a("fan_only") } }, true);

    it("stato completo come stringa: nessun utente né automazione (stato assunto all'avvio)", () => {
      expect(avvio[id]?.context).toEqual({ id: "ctx", parent_id: null, user_id: null });
      expect(scrittoDaUnAzione(avvio[id])).toBe(false);
    });

    it("comando di un utente: oggetto parziale, fuso col precedente", () => {
      const st = applicaAggiornamento(
        avvio,
        { c: { [id]: { "+": { s: "cool", c: { user_id: "u1", id: "c2" } } } } },
        false,
      );
      expect(st[id]?.context).toEqual({ id: "c2", parent_id: null, user_id: "u1" });
      expect(scrittoDaUnAzione(st[id])).toBe(true);
    });

    it("comando di un'automazione: parent_id, user_id resta quello di prima", () => {
      const st = applicaAggiornamento(
        avvio,
        { c: { [id]: { "+": { c: { parent_id: "auto", id: "c3" } } } } },
        false,
      );
      expect(st[id]?.context).toEqual({ id: "c3", parent_id: "auto", user_id: null });
      expect(scrittoDaUnAzione(st[id])).toBe(true);
    });

    it("differenza con la sola stringa: cambia solo l'id, user_id e parent_id restano", () => {
      const utente = applicaAggiornamento(
        avvio,
        { c: { [id]: { "+": { c: { user_id: "u1", id: "c2" } } } } },
        false,
      );
      const st = applicaAggiornamento(utente, { c: { [id]: { "+": { c: "c4" } } } }, false);
      expect(st[id]?.context).toEqual({ id: "c4", parent_id: null, user_id: "u1" });
    });

    it("un cambio di sistema dopo un comando azzera l'utente (HA manda user_id: null)", () => {
      const utente = applicaAggiornamento(
        avvio,
        { c: { [id]: { "+": { c: { user_id: "u1", id: "c2" } } } } },
        false,
      );
      const st = applicaAggiornamento(
        utente,
        { c: { [id]: { "+": { c: { user_id: null, id: "c5" } } } } },
        false,
      );
      expect(scrittoDaUnAzione(st[id])).toBe(false);
    });
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
