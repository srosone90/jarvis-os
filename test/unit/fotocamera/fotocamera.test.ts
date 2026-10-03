import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { grigioPiccolo, Movimento } from "../../../src/fotocamera/movimento";
import {
  fuoriOrario,
  leggiPreferenzeFotocamera,
  PREFERENZE_FOTOCAMERA_DI_SERIE,
} from "../../../src/fotocamera/preferenze";
import {
  ASSENZA_MS,
  INVIO_OGNI_MS,
  messaggioFotocamera,
  Presenza,
  type Fotogramma,
  type Occhio,
} from "../../../src/fotocamera/presenza";
import { distanza, ingresso, volti } from "../../../src/fotocamera/volto";

/** v0.6.0: presenza dalla fotocamera (dalla v0.6.5 solo sveglia dello schermo e avviso a Home Assistant). */

describe("volti dal modello", () => {
  it("soglia, NMS (doppioni via, il più sicuro resta) e distanza", () => {
    // 3 ancore: due quasi uguali (doppione), una sotto soglia
    const scores = [0.1, 0.9, 0.05, 0.95, 0.6, 0.4];
    const boxes = [0.35, 0.06, 0.53, 0.36, 0.351, 0.061, 0.531, 0.361, 0.1, 0.1, 0.2, 0.2];
    const v = volti(scores, boxes, 0.85);
    expect(v).toHaveLength(1);
    expect(v[0]?.punteggio).toBe(0.95);
    const d = distanza(v[0] ?? { x1: 0, y1: 0, x2: 0, y2: 0, punteggio: 0 });
    expect(d).toBeGreaterThan(0.7);
    expect(d).toBeLessThan(0.85);
  });
  it("ingresso: NCHW, (pixel - 127) / 128", () => {
    const rgba = new Uint8ClampedArray(320 * 240 * 4).fill(255);
    rgba[0] = 127;
    rgba[1] = 255;
    rgba[2] = 0;
    const x = ingresso(rgba);
    expect(x).toHaveLength(3 * 320 * 240);
    expect(x[0]).toBe(0);
    expect(x[320 * 240]).toBeCloseTo(1, 5);
    expect(x[2 * 320 * 240]).toBeCloseTo(-127 / 128, 5);
    expect(() => ingresso(new Uint8ClampedArray(10))).toThrow();
  });
});

describe("movimento", () => {
  it("fermo = 0, una mano che passa = tanti punti cambiati; il primo fotogramma conta come movimento", () => {
    const fermo = new Uint8ClampedArray(320 * 240 * 4).fill(100);
    const mano = fermo.slice();
    for (let y = 60; y < 180; y++)
      for (let x = 100; x < 220; x++) mano.fill(220, (y * 320 + x) * 4, (y * 320 + x) * 4 + 3);
    const m = new Movimento();
    expect(m.quanto(grigioPiccolo(fermo, 320, 240))).toBe(1);
    expect(m.quanto(grigioPiccolo(fermo, 320, 240))).toBe(0);
    expect(m.quanto(grigioPiccolo(mano, 320, 240))).toBeGreaterThan(0.15);
  });
});

describe("preferenze della fotocamera", () => {
  it("le regole vecchie che toccavano «Jarvis» non esistono più: un file vecchio non le riaccende", () => {
    const p = leggiPreferenzeFotocamera(
      JSON.stringify({ tvSoloConQualcuno: true, guardaParla: true, aiutoVicino: true, passoVicino: 0.1 }),
    );
    for (const k of ["tvSoloConQualcuno", "guardaParla", "aiutoVicino", "passoVicino"])
      expect(p).not.toHaveProperty(k);
  });
  it("fino alla v0.6.4 «presenza» spenta spegneva anche l'avviso a Home Assistant: resta spento", () => {
    expect(leggiPreferenzeFotocamera(JSON.stringify({ presenza: false }))).toMatchObject({
      presenza: false,
      avvisaCasa: false,
    });
    expect(leggiPreferenzeFotocamera(JSON.stringify({ presenza: false, avvisaCasa: true })).avvisaCasa).toBe(
      true,
    );
  });
  it("tutto acceso di serie, spenta di notte; valori fuori misura nei limiti", () => {
    expect(PREFERENZE_FOTOCAMERA_DI_SERIE).toMatchObject({
      presenza: true,
      secondiSveglia: 30,
      avvisaCasa: true,
      spentaDa: "23:00",
      spentaA: "07:00",
    });
    expect(
      leggiPreferenzeFotocamera(
        JSON.stringify({ distanza: 9, fps: 30, spentaDa: "25:00", secondiSveglia: 1 }),
      ),
    ).toMatchObject({
      distanza: 3,
      fps: 5,
      secondiSveglia: 5,
      spentaDa: "23:00",
    });
    expect(leggiPreferenzeFotocamera("{rotto")).toEqual(PREFERENZE_FOTOCAMERA_DI_SERIE);
  });
  it("orari: a cavallo della mezzanotte e no; uguali = mai spenta", () => {
    const alle = (h: number, m = 0) => new Date(2026, 9, 2, h, m);
    expect(fuoriOrario(alle(23, 30), "23:00", "07:00")).toBe(true);
    expect(fuoriOrario(alle(6, 59), "23:00", "07:00")).toBe(true);
    expect(fuoriOrario(alle(7), "23:00", "07:00")).toBe(false);
    expect(fuoriOrario(alle(13), "12:00", "14:00")).toBe(true);
    expect(fuoriOrario(alle(15), "12:00", "14:00")).toBe(false);
    expect(fuoriOrario(alle(3), "00:00", "00:00")).toBe(false);
  });
  it("messaggi della fotocamera in parole", () => {
    const e = (name: string) => Object.assign(new Error("x"), { name });
    expect(messaggioFotocamera(e("NotAllowedError"))).toContain("non consentita");
    expect(messaggioFotocamera(e("NotReadableError"))).toContain("occupata");
    expect(messaggioFotocamera(e("NotFoundError"))).toContain("frontale");
  });
});

describe("Presenza", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Volto a ~0,8 m e di fronte, o niente. */
  const VICINO = { scores: [0, 1], boxes: [0.35, 0.06, 0.53, 0.36] };
  const LONTANO = { scores: [0, 1], boxes: [0.61, 0.31, 0.68, 0.43] };
  const NESSUNO = { scores: [1, 0], boxes: [0, 0, 0, 0] };

  function prepara(opzioni: { ora?: number; pannello?: string | null } = {}) {
    let scena = NESSUNO;
    let t = 0;
    let colore = 0;
    const invii: string[] = [];
    let aperta = false;
    const occhio: Occhio = {
      apri: vi.fn(() => {
        aperta = true;
        return Promise.resolve();
      }),
      chiudi: vi.fn(() => {
        aperta = false;
      }),
      // ogni fotogramma un po' diverso: c'è movimento, il modello gira
      fotogramma: (): Fotogramma => ({
        rgba: new Uint8ClampedArray(320 * 240 * 4).fill((colore += 60) % 256),
        w: 320,
        h: 240,
      }),
      get aperto() {
        return aperta;
      },
    };
    const rileva = vi.fn(() => Promise.resolve({ ...scena, ms: 20 }));
    const memoria = new Map<string, string>();
    const p = new Presenza({
      occhio,
      caricaMotore: () => Promise.resolve({ rileva }),
      invia: (pannello) => {
        invii.push(pannello);
        return Promise.resolve();
      },
      pannello: () => (opzioni.pannello === undefined ? "jarvis_cucina" : opzioni.pannello),
      adesso: () => t,
      ora: () => new Date(2026, 9, 2, opzioni.ora ?? 10, 0),
      archivio: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => void memoria.set(k, v) },
    });
    const arrivi = vi.fn();
    p.alArrivo = arrivi;
    return {
      p,
      occhio,
      rileva,
      invii,
      arrivi,
      scena: (s: typeof NESSUNO) => (scena = s),
      /** Avanza il tempo (finto e dei timer). */
      passa: async (ms: number) => {
        for (let fatto = 0; fatto < ms; fatto += 100) {
          t += 100;
          await vi.advanceTimersByTimeAsync(100);
        }
      },
    };
  }

  it("qualcuno si avvicina: sveglia il pannello e manda la presenza; non di nuovo entro 5 minuti", async () => {
    const f = prepara();
    f.p.avvia();
    await f.passa(1000);
    expect(f.p.attiva).toBe(true);
    expect(f.arrivi).not.toHaveBeenCalled();
    f.scena(VICINO);
    await f.passa(1000);
    expect(f.arrivi).toHaveBeenCalledTimes(1);
    expect(f.invii).toEqual(["jarvis_cucina"]);
    // va via e torna dopo 2 minuti: si sveglia di nuovo, ma niente secondo evento (5 minuti)
    f.scena(NESSUNO);
    await f.passa(ASSENZA_MS + 60_000);
    f.scena(VICINO);
    await f.passa(1000);
    expect(f.arrivi).toHaveBeenCalledTimes(2);
    expect(f.invii).toHaveLength(1);
    // dopo 5 minuti dall'ultimo invio, un nuovo arrivo manda di nuovo
    f.scena(NESSUNO);
    await f.passa(INVIO_OGNI_MS);
    f.scena(VICINO);
    await f.passa(1000);
    expect(f.invii).toHaveLength(2);
    f.p.ferma();
  });

  it("controprove: un volto lontano (2 m, oltre 1,5) non è presenza; a 2,5 m sì", async () => {
    const f = prepara();
    f.p.avvia();
    f.scena(LONTANO);
    await f.passa(3000);
    expect(f.arrivi).not.toHaveBeenCalled();
    expect(f.p.volto?.metri).toBeGreaterThan(1.8);
    f.p.cambiaPreferenze({ distanza: 2.5 });
    await f.passa(3000);
    expect(f.arrivi).toHaveBeenCalledTimes(1);
    f.p.ferma();
  });

  it("sveglia schermo e avviso a Home Assistant sono due interruttori; senza stanza niente evento", async () => {
    const f = prepara();
    f.p.cambiaPreferenze({ presenza: false });
    f.p.avvia();
    f.scena(VICINO);
    await f.passa(1500);
    expect(f.arrivi).not.toHaveBeenCalled();
    expect(f.invii).toEqual(["jarvis_cucina"]);
    f.p.ferma();
    const h = prepara();
    h.p.cambiaPreferenze({ avvisaCasa: false });
    h.p.avvia();
    h.scena(VICINO);
    await h.passa(1500);
    expect(h.arrivi).toHaveBeenCalledTimes(1);
    expect(h.invii).toEqual([]);
    h.p.ferma();
    const g = prepara({ pannello: null });
    g.p.avvia();
    g.scena(VICINO);
    await g.passa(1500);
    expect(g.arrivi).toHaveBeenCalledTimes(1);
    expect(g.invii).toEqual([]);
    g.p.ferma();
  });

  it("di notte la fotocamera non si apre; tutto spento: nemmeno", async () => {
    const f = prepara({ ora: 2 });
    f.p.avvia();
    await f.passa(1000);
    expect(f.occhio.apri).not.toHaveBeenCalled();
    expect(f.p.stato).toBe("notte");
    f.p.ferma();
    const g = prepara();
    g.p.cambiaPreferenze({ presenza: false, avvisaCasa: false });
    g.p.avvia();
    await g.passa(1000);
    expect(g.occhio.apri).not.toHaveBeenCalled();
    expect(g.p.stato).toBe("spenta");
  });

  it("errore della fotocamera (non consentita): lo dice, non riprova da sola, riprova cambiando le preferenze", async () => {
    const f = prepara();
    const negata = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    vi.mocked(f.occhio.apri).mockRejectedValueOnce(negata);
    f.p.avvia();
    await f.passa(500);
    expect(f.p.stato).toBe("errore");
    expect(f.p.problema).toContain("non consentita");
    await f.passa(120_000);
    expect(f.occhio.apri).toHaveBeenCalledTimes(1);
    f.p.cambiaPreferenze({ fps: 4 });
    await f.passa(500);
    expect(f.p.attiva).toBe(true);
    f.p.ferma();
  });

  it("batteria: con l'immagine ferma il modello gira solo ogni 2 s", async () => {
    const f = prepara();
    // fotogrammi tutti uguali: niente movimento
    f.occhio.fotogramma = () => ({ rgba: new Uint8ClampedArray(320 * 240 * 4).fill(50), w: 320, h: 240 });
    f.p.avvia();
    await f.passa(10_000);
    // 3 fotogrammi al secondo = ~30, il modello ~5 volte (il primo per il movimento + ogni 2 s)
    expect(f.rileva.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(f.rileva.mock.calls.length).toBeLessThanOrEqual(7);
    f.p.ferma();
  });
});
