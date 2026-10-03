import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assistente, type ConnessioneAssistente } from "../../../src/assistente/assistente";
import type { EventoPipeline } from "../../../src/assistente/eventi";
import { log } from "../../../src/diagnostica/log";
import { AscoltoParola } from "../../../src/parola/ascolto";
import { DecisioneScatto, DECISIONE_DI_SERIE } from "../../../src/parola/decisione";
import { leggiPreferenzeParola, PREFERENZE_PAROLA_DI_SERIE } from "../../../src/parola/preferenze";
import type { Bip, Riproduttore } from "../../../src/voce/audio";
import type { Ascoltatori } from "../../../src/voce/microfono";
import type { MicrofonoCondiviso } from "../../../src/voce/microfono-condiviso";
import { Voce } from "../../../src/voce/voce";

/** v0.5.4: falsi scatti con la TV; v0.6.5: soglia fissa. La logica pura, il registro e l'esito di ogni scatto. */

const s = { serie: 0.5, personale: null };

describe("conferma: più frame di fila sopra soglia", () => {
  it("un frame solo non basta, due di fila sì; un frame sotto rimette a zero", () => {
    const d = new DecisioneScatto();
    expect(d.frame({ punteggio: 0.9, verificato: false }, s)).toBe(false);
    expect(d.frame({ punteggio: 0.9, verificato: false }, s)).toBe(true);
    expect(d.frame({ punteggio: 0.9, verificato: false }, s)).toBe(false);
    expect(d.frame({ punteggio: 0.2, verificato: false }, s)).toBe(false);
    expect(d.frame({ punteggio: 0.9, verificato: false }, s)).toBe(false);
  });
  it("con pazienza 1 basta un frame (com'era fino alla v0.5.3)", () => {
    const d = new DecisioneScatto({ ...DECISIONE_DI_SERIE, pazienza: 1 });
    expect(d.frame({ punteggio: 0.6, verificato: false }, s)).toBe(true);
  });
});

describe("la soglia personale vale solo col verificatore", () => {
  it("punteggio del modello di base: soglia di serie; del verificatore: la personale", () => {
    const d = new DecisioneScatto();
    const soglie = { serie: 0.5, personale: 0.3 };
    expect(d.soglia({ verificato: false }, soglie)).toBe(0.5);
    expect(d.soglia({ verificato: true }, soglie)).toBe(0.3);
    expect(d.soglia({ verificato: true }, s)).toBe(0.5);
  });
});

describe("soglia fissa (v0.6.5)", () => {
  it("niente la sposta: dopo tanti scatti la soglia è la stessa", () => {
    const d = new DecisioneScatto();
    for (let k = 0; k < 40; k++) {
      d.frame({ punteggio: 0.9, verificato: false }, s);
      d.frame({ punteggio: 0.9, verificato: false }, s);
    }
    expect(d.soglia({ verificato: false }, s)).toBe(0.5);
    expect(d.frame({ punteggio: 0.5, verificato: false }, s)).toBe(false);
    expect(d.frame({ punteggio: 0.5, verificato: false }, s)).toBe(true);
  });
  it("le preferenze vecchie della soglia che si adattava si ignorano", () => {
    const p = leggiPreferenzeParola('{"adattiva":true,"passo":0.1,"vuoti":5,"quieteMinuti":60}');
    for (const k of ["adattiva", "passo", "vuoti", "finestraMinuti", "quieteMinuti"])
      expect(p).not.toHaveProperty(k);
  });
});

describe("preferenze di «Jarvis» (personalizzabili, con valori di serie)", () => {
  it("niente salvato: tutto di serie", () => {
    expect(leggiPreferenzeParola(null)).toEqual(PREFERENZE_PAROLA_DI_SERIE);
    expect(PREFERENZE_PAROLA_DI_SERIE).toMatchObject({
      acceso: true,
      suono: true,
      sogliaManuale: null,
      pazienza: 2,
      impara: true,
    });
  });
  it("le preferenze vecchie ({acceso, suono}) restano valide", () => {
    expect(leggiPreferenzeParola('{"acceso":false,"suono":true}')).toMatchObject({
      acceso: false,
      pazienza: 2,
    });
  });
  it("valori fuori misura si riportano nei limiti; un campo rotto non butta gli altri", () => {
    const p = leggiPreferenzeParola('{"pazienza":99,"impara":"x","sogliaManuale":0.01,"suono":false}');
    expect(p.pazienza).toBe(6);
    expect(p.impara).toBe(true);
    expect(p.sogliaManuale).toBe(0.05);
    expect(p.suono).toBe(false);
    expect(leggiPreferenzeParola("rotto")).toEqual(PREFERENZE_PAROLA_DI_SERIE);
  });
});

/** Connessione finta come nelle altre prove. */
function connessioneFinta() {
  const sottoscrizioni: { messaggio: Record<string, unknown>; callback: (e: EventoPipeline) => void }[] = [];
  const conn: ConnessioneAssistente = {
    subscribeMessage<T>(callback: (m: T) => void, messaggio: Record<string, unknown>) {
      sottoscrizioni.push({ messaggio, callback: callback as unknown as (e: EventoPipeline) => void });
      return Promise.resolve(() => Promise.resolve());
    },
  };
  const assistente = new Assistente({
    conn: () => conn,
    inviaBinario: () => true,
    collegato: () => true,
    ascoltaConnessione: () => () => undefined,
  });
  return { assistente, sottoscrizioni };
}

describe("esito di ogni scatto: registro, soglia e apprendimento", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function prepara() {
    const f = connessioneFinta();
    let aperto = false;
    const microfono = {
      get attivo() {
        return aperto;
      },
      avvia: (_a: Ascoltatori) => ((aperto = true), Promise.resolve(16000)),
      ferma: () => {
        aperto = false;
      },
    };
    const voce = new Voce({
      assistente: f.assistente,
      collegato: () => true,
      microfono,
      riproduttore: {
        riproduci: () => Promise.resolve("finito"),
        ferma: () => undefined,
      } as unknown as Riproduttore,
      bip: { suona: () => undefined } as unknown as Bip,
    });
    let t = 1_000_000;
    const imparati: unknown[] = [];
    const a = new AscoltoParola({
      micro: {} as unknown as MicrofonoCondiviso,
      assistente: f.assistente,
      voce,
      timer: {
        suonano: [],
        silenzia: () => undefined,
        ferma: () => undefined,
      } as unknown as ConstructorParameters<typeof AscoltoParola>[0]["timer"],
      adesso: () => t,
    });
    const motore = {
      sogliaSerie: 0.5,
      sogliaPersonale: null,
      inRegistrazione: null,
      parola: "Jarvis",
      istantanea: () => [{ punteggio: 0.9, caratteristiche: new Float32Array(1) }],
      imparaDaFalsoScatto: (fr: unknown) => (imparati.push(fr), Promise.resolve()),
    };
    const interna = a as unknown as { suEsito(e: unknown, m: unknown, t: number): void };
    /** Uno scatto (due frame) e la risposta di HA: testo o "nessuna parola". */
    const scatto = async (testo: string | null, punteggio = 0.8) => {
      const prima = f.sottoscrizioni.length;
      for (let k = 0; k < 2; k++)
        interna.suEsito({ punteggio, base: punteggio, verificato: false, ms: 5 }, motore, 0);
      for (let k = 0; k < 4; k++) await Promise.resolve();
      if (f.sottoscrizioni.length === prima) return false;
      const sub = f.sottoscrizioni.at(-1);
      sub?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 3 } } });
      if (testo) sub?.callback({ type: "stt-end", data: { stt_output: { text: testo } } });
      else sub?.callback({ type: "error", data: { code: "stt-no-text-recognized" } });
      voce.ferma();
      voce.ferma();
      t += 60_000; // un minuto dopo, fuori dalle pause
      return true;
    };
    return { a, scatto, imparati, voce };
  }

  it("trascrizione vuota: riga nel registro, il falso scatto si impara; con testo il testo", async () => {
    const p = prepara();
    await p.scatto(null);
    expect(
      log.voci().some((v) => /punteggio 0\.80, trascrizione vuota: falso scatto/.test(v.messaggio)),
    ).toBe(true);
    expect(p.imparati).toHaveLength(1);
    await p.scatto("che ore sono");
    expect(log.voci().some((v) => v.messaggio.includes("trascrizione «che ore sono»"))).toBe(true);
    expect(p.imparati).toHaveLength(1);
  });

  it("dieci falsi scatti di fila: la soglia resta quella (0,5), uguale prima e dopo", async () => {
    const p = prepara();
    expect(await p.scatto("che ore sono", 0.47)).toBe(false);
    for (let k = 0; k < 10; k++) expect(await p.scatto(null)).toBe(true);
    expect(p.a.dalVivo.soglia).toBe(0.5);
    expect(await p.scatto("che ore sono", 0.47)).toBe(false);
    expect(await p.scatto("che ore sono", 0.5)).toBe(true);
    expect(log.voci().some((v) => v.messaggio.includes("sopra la sua base"))).toBe(false);
  });

  it("con «impara» spento i falsi scatti non diventano esempi", async () => {
    const p = prepara();
    p.a.cambiaPreferenze({ impara: false });
    await p.scatto(null);
    expect(p.imparati).toHaveLength(0);
    // e "Ripristina valore di serie" la riaccende
    p.a.cambiaPreferenze({ impara: null });
    expect(p.a.preferenze.impara).toBe(true);
  });
});
