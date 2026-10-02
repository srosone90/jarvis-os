import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assistente, CONTESTO_MASSIMO_MS, type ConnessioneAssistente } from "../../src/assistente/assistente";
import type { EventoPipeline } from "../../src/assistente/eventi";
import { log } from "../../src/diagnostica/log";
import { AscoltoParola } from "../../src/parola/ascolto";
import { contestoPrima, inizioRichiesta, MINIMO_PARLATO_S } from "../../src/parola/inizio-frase";
import { sogliaPersonale, SOGLIA_PERSONALE_MINIMA } from "../../src/parola/verificatore";
import type { Bip, Riproduttore } from "../../src/voce/audio";
import type { Ascoltatori } from "../../src/voce/microfono";
import type { MicrofonoCondiviso } from "../../src/voce/microfono-condiviso";
import { RilevaParlato } from "../../src/voce/parlato";
import { SEGUITO_BREVE_MS, SEGUITO_MS, Voce } from "../../src/voce/voce";

/**
 * v0.5.3, "persona sempre presente": il minuto prima di «Jarvis» va a HA come
 * contesto (pipeline a parte), e dopo la risposta il pannello riascolta 8 s
 * senza la parola.
 */

const FR = 16000;
/** Quello che l'ascolto usa del motore, allo scatto. */
const MOTORE_FINTO = {
  sogliaSerie: 0.5,
  sogliaPersonale: null,
  inRegistrazione: null,
  parola: "Jarvis",
  istantanea: () => [],
  imparaDaFalsoScatto: () => Promise.resolve(),
};
const voce = (sec: number) =>
  Int16Array.from({ length: Math.round(sec * FR) }, (_, i) =>
    Math.round(4000 * Math.sin(i / 3) * Math.sin(i / 900)),
  );
const silenzio = (sec: number, livello = 40) =>
  Int16Array.from({ length: Math.round(sec * FR) }, (_, i) => ((i * 7919) % (2 * livello)) - livello);
const unisci = (...p: Int16Array[]) => {
  const t = new Int16Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) {
    t.set(x, o);
    o += x.length;
  }
  return t;
};

function connessioneFinta() {
  const sottoscrizioni: {
    messaggio: Record<string, unknown>;
    callback: (e: EventoPipeline) => void;
    disiscritta: boolean;
  }[] = [];
  const conn: ConnessioneAssistente = {
    subscribeMessage<T>(callback: (m: T) => void, messaggio: Record<string, unknown>) {
      const s = {
        messaggio,
        callback: callback as unknown as (e: EventoPipeline) => void,
        disiscritta: false,
      };
      sottoscrizioni.push(s);
      return Promise.resolve(() => {
        s.disiscritta = true;
        return Promise.resolve();
      });
    },
  };
  const binari: Uint8Array[] = [];
  const assistente = new Assistente({
    conn: () => conn,
    inviaBinario: (d) => {
      binari.push(new Uint8Array(d));
      return true;
    },
    collegato: () => true,
    ascoltaConnessione: () => () => undefined,
    dispositivo: () => "jarvis_cucina",
  });
  return { assistente, sottoscrizioni, binari };
}

describe("contesto: quale audio, dalla memoria di 60 s", () => {
  it("40 s di discussione, pausa di 1,5 s, poi la frase: richiesta = solo la frase, contesto = la discussione", () => {
    const m = unisci(silenzio(2), voce(40), silenzio(1.5), voce(3), silenzio(0.3));
    const inizio = inizioRichiesta(m);
    expect(inizio).toBe(Math.round((2 + 40 + 1.5 - 0.25) * FR));
    const c = contestoPrima(m, inizio);
    if (!c) throw new Error("contesto mancante");
    // senza il silenzio iniziale (col margine) e senza la pausa prima della frase
    expect(c.length / FR).toBeGreaterThan(40);
    expect(c.length / FR).toBeLessThan(40.6);
  });
  it("nessun parlato prima della frase: niente contesto", () => {
    const m = unisci(silenzio(30), voce(3));
    expect(contestoPrima(m, inizioRichiesta(m))).toBeNull();
  });
  it("un colpo secco (meno di mezzo secondo di 'voce') non è parlato", () => {
    const m = unisci(silenzio(10), voce(MINIMO_PARLATO_S / 2), silenzio(10), voce(3));
    expect(contestoPrima(m, inizioRichiesta(m))).toBeNull();
  });
  it("un minuto di parlato senza pause: la richiesta resta negli ultimi 10 s, il resto è contesto", () => {
    const m = voce(60);
    const inizio = inizioRichiesta(m);
    expect(inizio).toBe(50 * FR);
    expect(contestoPrima(m, inizio)?.length).toBe(50 * FR);
  });
});

describe("assistente: pipeline del contesto", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stt→stt, no_vad, device_id «…__contesto», audio a raffica a run-start e subito la fine", async () => {
    const f = connessioneFinta();
    const pcm = voce(2.5);
    expect(f.assistente.inviaContesto(pcm)).toBe(true);
    const [s] = f.sottoscrizioni;
    expect(s?.messaggio).toMatchObject({
      type: "assist_pipeline/run",
      start_stage: "stt",
      end_stage: "stt",
      input: { sample_rate: 16000, no_vad: true },
      device_id: "jarvis_cucina__contesto",
    });
    expect(s?.messaggio["conversation_id"]).toBeUndefined();
    await Promise.resolve();
    s?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 9 } } });
    // 40 000 campioni = 39 pezzi da 1024 + l'ultimo da 64, poi il frame col solo id
    expect(f.binari).toHaveLength(Math.ceil(40000 / 1024) + 1);
    expect(f.binari.every((b) => b[0] === 9)).toBe(true);
    expect(f.binari.at(-1)?.length).toBe(1);
    // il pcm in RAM si azzera appena inviato
    expect(pcm.every((x) => x === 0)).toBe(true);
    s?.callback({ type: "stt-end", data: { stt_output: { text: "discorso di casa" } } });
    s?.callback({ type: "run-end", data: null });
    await Promise.resolve();
    expect(s?.disiscritta).toBe(true);
    // niente turni, niente interfaccia: la chat non vede il contesto
    expect(f.assistente.turni).toHaveLength(0);
    expect(f.assistente.occupato).toBe(false);
    // del discorso si scrive solo la lunghezza
    expect(log.voci().some((v) => v.messaggio.includes("discorso di casa"))).toBe(false);
    expect(log.voci()[0]?.messaggio).toMatch(/Contesto: trascritto da HA .*16 caratteri/);
  });

  it("se fallisce: solo una riga nel registro, la domanda non ne sa niente", async () => {
    const f = connessioneFinta();
    f.assistente.inviaContesto(voce(1));
    const id = f.assistente.parla(16000, { parola: "Jarvis" });
    const [contesto] = f.sottoscrizioni;
    contesto?.callback({ type: "error", data: { code: "stt-stream-failed" } });
    contesto?.callback({ type: "run-end", data: null });
    expect(log.voci()[0]?.messaggio).toBe("Contesto non trascritto: stt-stream-failed");
    expect(f.assistente.turno(id ?? -1)?.fase).toBe("ascolto");
    expect(f.assistente.turno(id ?? -1)?.errore).toBeNull();
  });

  it("se HA non la chiude, la si chiude da qui", async () => {
    const f = connessioneFinta();
    f.assistente.inviaContesto(voce(1));
    await Promise.resolve();
    vi.advanceTimersByTime(CONTESTO_MASSIMO_MS);
    await Promise.resolve();
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(true);
  });
});

describe("ascolto: allo scatto il contesto parte PRIMA della richiesta", () => {
  function scatto(memoria: Int16Array, occupato = false) {
    const ordine: string[] = [];
    const a = new AscoltoParola({
      micro: {} as unknown as MicrofonoCondiviso,
      assistente: {
        occupato,
        inviaContesto: (pcm) => {
          ordine.push(`contesto ${(pcm.length / FR).toFixed(1)}`);
          return true;
        },
      },
      voce: {
        attiva: false,
        fase: "spenta",
        ascolta: () => () => undefined,
        parla: (_d: unknown, _s: unknown, o: { preroll?: Int16Array; suono?: boolean } = {}) => {
          ordine.push(`richiesta ${((o.preroll?.length ?? 0) / FR).toFixed(1)} suono ${String(o.suono)}`);
          return Promise.resolve();
        },
      } as unknown as ConstructorParameters<typeof AscoltoParola>[0]["voce"],
      timer: {
        suonano: [],
        silenzia: () => undefined,
        ferma: () => undefined,
      } as unknown as ConstructorParameters<typeof AscoltoParola>[0]["timer"],
      adesso: () => 100_000,
    });
    const interna = a as unknown as {
      memoria: { scrivi(p: Int16Array): void; ultimi(): Int16Array };
      suEsito(e: unknown, m: unknown, t: number): void;
    };
    interna.memoria.scrivi(memoria);
    // due frame di fila sopra soglia: la conferma (v0.5.4)
    for (let k = 0; k < 2; k++)
      interna.suEsito({ punteggio: 0.9, base: 0.9, verificato: false, ms: 5 }, MOTORE_FINTO, 0);
    return { ordine, memoriaDopo: interna.memoria.ultimi().length };
  }

  it("discussione di 40 s, pausa, frase: prima il contesto, poi la richiesta; memoria svuotata", () => {
    const { ordine, memoriaDopo } = scatto(unisci(silenzio(2), voce(40), silenzio(1.5), voce(3)));
    expect(ordine).toEqual(["contesto 40.5", "richiesta 3.3 suono true"]);
    expect(memoriaDopo).toBe(0);
  });
  it("discorso di prima spento: solo la richiesta; accorciato a 10 s: solo gli ultimi 10", () => {
    const m = unisci(silenzio(2), voce(40), silenzio(1.5), voce(3));
    localStorage.setItem("jarvis-parola", JSON.stringify({ contesto: false }));
    try {
      expect(scatto(m).ordine).toEqual(["richiesta 3.3 suono true"]);
      localStorage.setItem("jarvis-parola", JSON.stringify({ secondiContesto: 10 }));
      // i 10 s prima dell'inizio della richiesta, meno la pausa di 1,5 s (resta il margine di 0,25)
      expect(scatto(m).ordine[0]).toBe("contesto 9.0");
    } finally {
      localStorage.removeItem("jarvis-parola");
    }
  });
  it("nessuno parlava prima: solo la richiesta", () => {
    expect(scatto(unisci(silenzio(20), voce(3))).ordine).toEqual(["richiesta 3.3 suono true"]);
  });
  it("una domanda scritta in corso: niente contesto (la richiesta non partirebbe)", () => {
    expect(scatto(unisci(voce(20), silenzio(1.5), voce(3)), true).ordine).toEqual([
      "richiesta 3.3 suono true",
    ]);
  });
});

describe("conversazione continua: 8 s di riascolto dopo una domanda di Jarvis", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function prepara() {
    const f = connessioneFinta();
    let aperto = false;
    let ascolta: Ascoltatori | null = null;
    const microfono = {
      get attivo() {
        return aperto;
      },
      avvia: (a: Ascoltatori) => {
        aperto = true;
        ascolta = a;
        return Promise.resolve(16000);
      },
      ferma: () => {
        aperto = false;
      },
    };
    const riproduttore = {
      riproduci: () => Promise.resolve("finito"),
      ferma: () => undefined,
    } as unknown as Riproduttore;
    const bip = { suona: vi.fn() };
    const v = new Voce({
      assistente: f.assistente,
      collegato: () => true,
      microfono,
      riproduttore,
      bip: bip as unknown as Bip,
    });
    const pezzo = (pcm: Int16Array) => ascolta?.pezzo(pcm.slice().buffer);
    return { f, v, pezzo, bip, aperto: () => aperto };
  }

  /**
   * Domanda «Jarvis» con risposta completa; ritorna quando la voce è nel
   * riascolto. `continua` = intent_output.continue_conversation (v0.5.8: true
   * = Jarvis ha fatto una domanda, riascolto lungo; false = azione, breve).
   */
  async function domandaERisposta(p: ReturnType<typeof prepara>, continua = true) {
    await p.v.parla("hub", false, { parola: "Jarvis", suono: true });
    const s = p.f.sottoscrizioni.at(-1);
    s?.callback({
      type: "run-start",
      data: {
        conversation_id: "conv-1",
        runner_data: { stt_binary_handler_id: 3 },
        tts_output: { url: "/api/tts_proxy/x.wav" },
      },
    });
    s?.callback({ type: "stt-end", data: { stt_output: { text: "che ore sono" } } });
    s?.callback({
      type: "intent-end",
      data: {
        intent_output: {
          conversation_id: "conv-1",
          continue_conversation: continua,
          response: { speech: { plain: { speech: "Le dieci." } }, response_type: "action_done" },
        },
      },
    });
    s?.callback({ type: "tts-end", data: { tts_output: { url: "/api/tts_proxy/x.wav" } } });
    s?.callback({ type: "run-end", data: null });
    // riproduzione "finita" e riapertura del microfono
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }

  it("dopo la risposta: «Ti ascolto ancora», microfono aperto, e verso HA NON parte niente", async () => {
    const p = prepara();
    await domandaERisposta(p);
    expect(p.v.fase).toBe("ascolto");
    expect(p.v.ascoltoAncora).toBe(true);
    expect(p.aperto()).toBe(true);
    const prima = p.f.sottoscrizioni.length;
    const binari = p.f.binari.length;
    for (let i = 0; i < 20; i++) p.pezzo(silenzio(0.064));
    expect(p.f.sottoscrizioni.length).toBe(prima);
    expect(p.f.binari.length).toBe(binari);
  });

  it("nessuno parla entro 8 s: si chiude in silenzio, nessuna pipeline, nessun errore, nessun turno nuovo", async () => {
    const p = prepara();
    await domandaERisposta(p);
    const prima = p.f.sottoscrizioni.length;
    const turni = p.f.assistente.turni.length;
    p.bip.suona.mockClear();
    vi.advanceTimersByTime(SEGUITO_MS - 1);
    expect(p.v.fase).toBe("ascolto");
    vi.advanceTimersByTime(1);
    expect(p.v.fase).toBe("spenta");
    expect(p.v.erroreMicrofono).toBeNull();
    expect(p.aperto()).toBe(false);
    expect(p.f.sottoscrizioni.length).toBe(prima);
    expect(p.f.assistente.turni.length).toBe(turni);
    expect(p.bip.suona).not.toHaveBeenCalled();
  });

  it("qualcuno parla: la domanda parte senza parola, con lo stesso conversation_id e l'audio da poco prima", async () => {
    const p = prepara();
    await domandaERisposta(p);
    for (let i = 0; i < 20; i++) p.pezzo(silenzio(0.064));
    p.pezzo(voce(0.064));
    expect(p.v.ascoltoAncora).toBe(true);
    p.pezzo(voce(0.064)); // due pezzi di fila: è parlato
    expect(p.v.ascoltoAncora).toBe(false);
    const s = p.f.sottoscrizioni.at(-1);
    expect(s?.messaggio).toMatchObject({
      start_stage: "stt",
      end_stage: "tts",
      conversation_id: "conv-1",
      input: { sample_rate: 16000 },
    });
    expect((s?.messaggio["input"] as Record<string, unknown>)["wake_word_phrase"]).toBeUndefined();
    // niente pipeline del contesto nel seguito
    expect(
      p.f.sottoscrizioni.filter((x) => String(x.messaggio["device_id"]).endsWith("__contesto")),
    ).toHaveLength(0);
    const binariPrima = p.f.binari.length;
    s?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 4 } } });
    // ~0,5 s tenuto da parte (8 pezzi, gli ultimi due sono la voce) va a HA subito a run-start
    expect(p.f.binari.length - binariPrima).toBe(8);
    // e il timer degli 8 s non chiude più niente
    vi.advanceTimersByTime(SEGUITO_MS * 2);
    expect(p.v.fase).toBe("ascolto");
  });

  it("riascolto a 0 secondi (Impostazioni → Voce): dopo la risposta si chiude, come prima della v0.5.3", async () => {
    const p = prepara();
    p.v.cambiaPreferenze({ riascoltoSecondi: 0 });
    try {
      await domandaERisposta(p);
      expect(p.v.fase).toBe("spenta");
      expect(p.aperto()).toBe(false);
    } finally {
      p.v.cambiaPreferenze({ riascoltoSecondi: null });
    }
    expect(p.v.preferenze.riascoltoSecondi).toBe(8);
  });

  it("riascolto a 3 secondi: si chiude dopo 3", async () => {
    const p = prepara();
    p.v.cambiaPreferenze({ riascoltoSecondi: 3 });
    try {
      await domandaERisposta(p);
      expect(p.v.ascoltoAncora).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(p.v.fase).toBe("spenta");
    } finally {
      p.v.cambiaPreferenze({ riascoltoSecondi: null });
    }
  });

  it("v0.5.8 — dopo un'azione (continue_conversation false): finestra breve di 2 s, senza «Ti ascolto ancora»", async () => {
    const p = prepara();
    await domandaERisposta(p, false);
    expect(p.v.fase).toBe("ascolto");
    expect(p.v.ascoltoAncora).toBe(false);
    expect(p.v.ascoltoBreve).toBe(true);
    const prima = p.f.sottoscrizioni.length;
    const turni = p.f.assistente.turni.length;
    p.bip.suona.mockClear();
    for (let i = 0; i < 10; i++) p.pezzo(silenzio(0.064));
    vi.advanceTimersByTime(SEGUITO_BREVE_MS - 1);
    expect(p.v.fase).toBe("ascolto");
    vi.advanceTimersByTime(1);
    // nessuno ha parlato: chiusa subito, in silenzio, senza errori e senza niente verso HA
    expect(p.v.fase).toBe("spenta");
    expect(p.v.ascoltoBreve).toBe(false);
    expect(p.v.erroreMicrofono).toBeNull();
    expect(p.aperto()).toBe(false);
    expect(p.f.sottoscrizioni.length).toBe(prima);
    expect(p.f.assistente.turni.length).toBe(turni);
    expect(p.bip.suona).not.toHaveBeenCalled();
  });

  it("v0.5.8 — dopo un'azione, se nella finestra breve qualcuno continua a parlare la conversazione prosegue", async () => {
    const p = prepara();
    await domandaERisposta(p, false);
    p.pezzo(voce(0.064));
    p.pezzo(voce(0.064));
    expect(p.v.ascoltoBreve).toBe(false);
    expect(p.f.sottoscrizioni.at(-1)?.messaggio).toMatchObject({
      start_stage: "stt",
      conversation_id: "conv-1",
    });
    vi.advanceTimersByTime(SEGUITO_BREVE_MS * 2);
    expect(p.v.fase).toBe("ascolto");
  });

  it("v0.5.8 — controprova: con continue_conversation true la finestra breve non chiude, valgono gli 8 s", async () => {
    const p = prepara();
    await domandaERisposta(p, true);
    expect(p.v.ascoltoBreve).toBe(false);
    vi.advanceTimersByTime(SEGUITO_BREVE_MS + 100);
    expect(p.v.ascoltoAncora).toBe(true);
  });

  it("v0.5.8 — dopo un'azione a 0 secondi: chiude subito; il riascolto dopo una domanda resta", async () => {
    const p = prepara();
    p.v.cambiaPreferenze({ riascoltoAzioneSecondi: 0 });
    try {
      await domandaERisposta(p, false);
      expect(p.v.fase).toBe("spenta");
      expect(p.aperto()).toBe(false);
      await domandaERisposta(p, true);
      expect(p.v.ascoltoAncora).toBe(true);
    } finally {
      p.v.cambiaPreferenze({ riascoltoAzioneSecondi: null });
    }
    expect(p.v.preferenze.riascoltoAzioneSecondi).toBe(2);
  });

  it("v0.5.8 — sensibilità bassa: due pezzi di voce non bastano più, ne servono tre", async () => {
    const p = prepara();
    p.v.cambiaPreferenze({ sensibilitaParlato: "bassa" });
    try {
      await domandaERisposta(p, false);
      for (let i = 0; i < 10; i++) p.pezzo(silenzio(0.064));
      p.pezzo(voce(0.064));
      p.pezzo(voce(0.064));
      expect(p.v.ascoltoBreve).toBe(true);
      p.pezzo(voce(0.064));
      expect(p.v.ascoltoBreve).toBe(false);
    } finally {
      p.v.cambiaPreferenze({ sensibilitaParlato: null });
    }
    expect(p.v.preferenze.sensibilitaParlato).toBe("normale");
  });

  for (const [codice, messaggio] of [
    ["stt-stream-failed", "Speech-to-text failed"],
    ["unknown", "Sorry, I had a problem getting a response from Google Generative AI."],
  ] as const)
    it(`v0.5.8 — «Jarvis» e poi errore di Google (${codice}): niente chiusura in silenzio, errore e suono breve`, async () => {
      const p = prepara();
      await p.v.parla("hub", false, { parola: "Jarvis" });
      p.bip.suona.mockClear();
      const s = p.f.sottoscrizioni.at(-1);
      s?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 3 } } });
      if (codice === "unknown")
        s?.callback({ type: "stt-end", data: { stt_output: { text: "che ore sono" } } });
      s?.callback({ type: "error", data: { code: codice, message: messaggio } });
      expect(p.v.fase).toBe("errore");
      expect(p.bip.suona).toHaveBeenCalledWith("errore");
    });

  it("v0.5.8 — controprova: «Jarvis» e nessuna parola (stt-no-text-recognized): chiude in silenzio, nessun suono d'errore", async () => {
    const p = prepara();
    await p.v.parla("hub", false, { parola: "Jarvis" });
    p.bip.suona.mockClear();
    const s = p.f.sottoscrizioni.at(-1);
    s?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 3 } } });
    s?.callback({ type: "error", data: { code: "stt-no-text-recognized", message: "No text recognized" } });
    expect(p.v.fase).toBe("spenta");
    // il bip di chiusura del microfono c'era già; il suono d'errore no
    expect(p.bip.suona).not.toHaveBeenCalledWith("errore");
  });

  it("tocco sul pulsante durante il riascolto: chiude e basta", async () => {
    const p = prepara();
    await domandaERisposta(p);
    p.v.ferma();
    expect(p.v.fase).toBe("spenta");
    expect(p.aperto()).toBe(false);
  });

  it("reattività: col suono acceso il bip suona una volta sola, subito; la misura va nel registro", async () => {
    const p = prepara();
    await p.v.parla("hub", false, { parola: "Jarvis", suono: true, tempi: { finePezzo: 0, scatto: 50 } });
    expect(p.bip.suona).toHaveBeenCalledTimes(1);
    p.f.sottoscrizioni
      .at(-1)
      ?.callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 3 } } });
    p.pezzo(voce(0.064));
    expect(log.voci()[0]?.messaggio).toMatch(
      /^Reattività «Jarvis»: scatto 50 ms, segnale .*, run-start \d+ ms, primo audio \d+ ms/,
    );
  });

  it("col suono spento, con «Jarvis» nessun bip; col tocco il bip di sempre", async () => {
    const p = prepara();
    await p.v.parla("hub", false, { parola: "Jarvis", suono: false });
    expect(p.bip.suona).not.toHaveBeenCalled();
    const q = prepara();
    await q.v.parla("hub");
    expect(q.bip.suona).toHaveBeenCalledTimes(1);
  });
});

describe("rileva parlato (seguito)", () => {
  it("silenzio e fondo basso: no; voce: sì dopo due pezzi di fila", () => {
    const r = new RilevaParlato();
    for (let i = 0; i < 10; i++) expect(r.pezzo(silenzio(0.064))).toBe(false);
    expect(r.pezzo(voce(0.064))).toBe(false);
    expect(r.pezzo(voce(0.064))).toBe(true);
  });
  it("un clic isolato no", () => {
    const r = new RilevaParlato();
    r.pezzo(silenzio(0.064));
    r.pezzo(voce(0.064));
    expect(r.pezzo(silenzio(0.064))).toBe(false);
  });
  it("TV di fondo costante a -40 dBFS: non è parlato", () => {
    const r = new RilevaParlato();
    for (let i = 0; i < 30; i++) expect(r.pezzo(silenzio(0.064, 600))).toBe(false);
  });
  it("chi risponde subito (fondo ancora sconosciuto) viene sentito", () => {
    const r = new RilevaParlato();
    r.pezzo(voce(0.064));
    expect(r.pezzo(voce(0.064))).toBe(true);
  });
});

describe("soglia personale (strada veloce)", () => {
  it("dai 20 esempi: 10° percentile per 0,8, sopra il parlato normale", () => {
    const esempi = [
      0.98, 0.97, 0.95, 0.99, 0.9, 0.96, 0.93, 0.97, 0.99, 0.94, 0.92, 0.98, 0.95, 0.97, 0.96, 0.91, 0.99,
      0.98, 0.6, 0.97,
    ];
    // 10° percentile = 0,91 (lo 0,6 storto non conta) → 0,72 → mai sopra 0,5
    expect(sogliaPersonale(esempi, 0.05)).toBe(0.5);
    const deboli = esempi.map((x) => x * 0.5);
    expect(sogliaPersonale(deboli, 0.05)).toBe(0.36);
  });
  it("mai sotto 0,2, e mai a meno di 0,1 dal parlato normale: altrimenti resta quella di serie", () => {
    expect(sogliaPersonale([0.2, 0.2, 0.2], 0)).toBeNull();
    expect(sogliaPersonale([0.5, 0.5, 0.5], 0.35)).toBeNull();
    expect(sogliaPersonale([0.5, 0.5, 0.5], 0.2)).toBe(0.4);
    expect(SOGLIA_PERSONALE_MINIMA).toBe(0.2);
    expect(sogliaPersonale([], 0)).toBeNull();
  });
});
