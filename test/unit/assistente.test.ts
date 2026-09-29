import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Assistente,
  CONTESTO_MS,
  LENTA_MS,
  MASSIMO_MS,
  type ConnessioneAssistente,
} from "../../src/assistente/assistente";
import {
  applicaEvento,
  azioniDaRisultato,
  nuovoTurno,
  type EventoPipeline,
} from "../../src/assistente/eventi";

/** Risposta di HA come in intent-end (IntentResponse.as_dict, HA 2026.9.3). */
const uscita = (speech: string, tipo = "action_done", conv = "conv-1") => ({
  intent_output: {
    response: {
      speech: { plain: { speech, extra_data: null } },
      card: {},
      language: "it",
      response_type: tipo,
      data: tipo === "error" ? { code: "unknown" } : { success: [], failed: [] },
    },
    conversation_id: conv,
    continue_conversation: false,
  },
});

describe("eventi della pipeline → turno", () => {
  it("risposta normale a pezzi: pensa, scrive, poi il testo finale di HA vince", () => {
    let t = nuovoTurno(1, "che ore sono?");
    t = applicaEvento(t, { type: "run-start", data: { conversation_id: "conv-1" } });
    expect(t.fase).toBe("pensa");
    expect(t.conversationId).toBe("conv-1");
    t = applicaEvento(t, { type: "intent-progress", data: { chat_log_delta: { role: "assistant" } } });
    expect(t.fase).toBe("pensa");
    t = applicaEvento(t, { type: "intent-progress", data: { chat_log_delta: { content: "Sono le " } } });
    t = applicaEvento(t, { type: "intent-progress", data: { chat_log_delta: { content: "18" } } });
    expect(t.fase).toBe("scrive");
    expect(t.risposta).toBe("Sono le 18");
    t = applicaEvento(t, { type: "intent-end", data: uscita("Sono le 18:05.") });
    expect(t.fase).toBe("fatto");
    expect(t.risposta).toBe("Sono le 18:05.");
    expect(t.concluso).toBe(false);
    t = applicaEvento(t, { type: "run-end", data: null });
    expect(t.concluso).toBe(true);
  });

  it("agente senza streaming: solo intent-end, il testo arriva comunque", () => {
    const t = applicaEvento(nuovoTurno(1, "ciao"), { type: "intent-end", data: uscita("Ciao!") });
    expect(t.fase).toBe("fatto");
    expect(t.risposta).toBe("Ciao!");
  });

  it("errore di Gemini: arriva come risposta con response_type error, non come errore del WebSocket", () => {
    const t = applicaEvento(nuovoTurno(1, "ciao"), {
      type: "intent-end",
      data: uscita("Error talking to API", "error"),
    });
    expect(t.fase).toBe("errore");
    expect(t.errore?.tipo).toBe("agente");
    expect(t.errore?.dettaglio).toContain("Error talking to API");
  });

  it("evento error della pipeline (anche il timeout di HA)", () => {
    const t = applicaEvento(nuovoTurno(1, "x"), {
      type: "error",
      data: { code: "timeout", message: "Timeout running pipeline" },
    });
    expect(t.fase).toBe("errore");
    expect(t.errore?.tipo).toBe("tempo");
    expect(t.concluso).toBe(true);
  });

  it("run-end senza risposta è un errore, non un silenzio", () => {
    const t = applicaEvento(nuovoTurno(1, "x"), { type: "run-end", data: null });
    expect(t.fase).toBe("errore");
  });

  it("le azioni vengono dai risultati di HA, con entity_id solo per i bersagli entità", () => {
    const risultato = {
      speech: {},
      response_type: "action_done",
      data: {
        success: [
          { name: "TV Salotto", type: "entity", id: "media_player.soggiorno_tv_salotto" },
          { name: "Soggiorno", type: "area", id: "soggiorno" },
        ],
        failed: [{ name: "Condizionatore", type: "entity", id: "climate.condizionatore" }],
      },
    };
    expect(azioniDaRisultato(risultato)).toEqual([
      { nome: "TV Salotto", entita: "media_player.soggiorno_tv_salotto", riuscita: true },
      { nome: "Soggiorno", entita: null, riuscita: true },
      { nome: "Condizionatore", entita: "climate.condizionatore", riuscita: false },
    ]);
    // strumenti senza bersagli (es. uno script): nessuna etichetta inventata
    expect(azioniDaRisultato({ success: true, result: {} })).toEqual([]);
    let t = applicaEvento(nuovoTurno(1, "spegni la tv"), {
      type: "intent-progress",
      data: { chat_log_delta: { tool_calls: [{ tool_name: "HassTurnOff", tool_args: {} }] } },
    });
    expect(t.strumentiChiamati).toBe(true);
    t = applicaEvento(t, {
      type: "intent-progress",
      data: {
        chat_log_delta: {
          role: "tool_result",
          tool_call_id: "1",
          tool_name: "HassTurnOff",
          tool_result: risultato,
        },
      },
    });
    expect(t.azioni).toHaveLength(3);
  });

  it("dopo la conclusione gli eventi vengono ignorati", () => {
    const t = applicaEvento(nuovoTurno(1, "x"), { type: "error", data: { code: "x" } });
    expect(applicaEvento(t, { type: "intent-end", data: uscita("tardi") })).toBe(t);
  });
});

/** Connessione finta: registra le sottoscrizioni e permette di mandare eventi. */
function connessioneFinta() {
  const sottoscrizioni: {
    messaggio: Record<string, unknown>;
    opzioni: { resubscribe?: boolean } | undefined;
    callback: (e: EventoPipeline) => void;
    disiscritta: boolean;
  }[] = [];
  const conn: ConnessioneAssistente = {
    subscribeMessage<T>(
      callback: (m: T) => void,
      messaggio: Record<string, unknown>,
      opzioni?: { resubscribe?: boolean },
    ) {
      const s = {
        messaggio,
        opzioni,
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
  let collegato = true;
  const ascoltatori = new Set<() => void>();
  let ora = 1_000_000;
  const assistente = new Assistente({
    conn: () => conn,
    collegato: () => collegato,
    ascoltaConnessione: (f) => {
      ascoltatori.add(f);
      return () => ascoltatori.delete(f);
    },
    adesso: () => ora,
  });
  return {
    assistente,
    sottoscrizioni,
    ultima: () => {
      const s = sottoscrizioni.at(-1);
      if (!s) throw new Error("nessuna sottoscrizione");
      return s;
    },
    scollega: () => {
      collegato = false;
      for (const f of ascoltatori) f();
    },
    ricollega: () => {
      collegato = true;
      for (const f of ascoltatori) f();
    },
    avanza: (ms: number) => {
      ora += ms;
    },
  };
}

const rispondi = (cb: (e: EventoPipeline) => void, testo: string, conv = "conv-1") => {
  cb({ type: "run-start", data: { conversation_id: conv } });
  cb({ type: "intent-start", data: {} });
  cb({ type: "intent-progress", data: { chat_log_delta: { content: testo } } });
  cb({ type: "intent-end", data: uscita(testo, "action_done", conv) });
  cb({ type: "run-end", data: null });
};

describe("motore dell'assistente", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("manda la pipeline solo testo, senza risottoscrizione automatica, con il timeout per HA", () => {
    const f = connessioneFinta();
    expect(f.assistente.chiedi("  spegni la tv  ")).toBe(true);
    const s = f.ultima();
    expect(s.messaggio).toEqual({
      type: "assist_pipeline/run",
      start_stage: "intent",
      end_stage: "intent",
      input: { text: "spegni la tv" },
      conversation_id: null,
      timeout: MASSIMO_MS / 1000,
    });
    // mai true: dopo una riconnessione la libreria rimanderebbe "spegni la tv"
    expect(s.opzioni).toEqual({ resubscribe: false });
  });

  it("tiene il conversation_id tra una domanda e l'altra, e si disiscrive a fine risposta", async () => {
    const f = connessioneFinta();
    f.assistente.chiedi("prima");
    await Promise.resolve();
    rispondi(f.ultima().callback, "Uno", "conv-42");
    await Promise.resolve();
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(true);
    f.assistente.chiedi("seconda");
    expect(f.ultima().messaggio.conversation_id).toBe("conv-42");
    expect(f.assistente.turni.map((t) => t.risposta)).toEqual(["Uno", ""]);
  });

  it("offline non parte nessuna domanda e non compare nessuna risposta", () => {
    const f = connessioneFinta();
    f.scollega();
    expect(f.assistente.chiedi("ci sei?")).toBe(false);
    expect(f.sottoscrizioni).toHaveLength(0);
    expect(f.assistente.turni).toHaveLength(0);
  });

  it("connessione persa a metà: errore chiaro, niente disiscrizione sul socket morto, si rimanda con un tocco", async () => {
    const f = connessioneFinta();
    f.assistente.chiedi("spegni la tv");
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { conversation_id: "conv-1" } });
    f.scollega();
    const t = f.assistente.turni[0];
    expect(t?.fase).toBe("errore");
    expect(t?.errore?.tipo).toBe("connessione");
    expect(f.assistente.occupato).toBe(false);
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(false);
    // eventi tardivi della vecchia richiesta non resuscitano il turno
    f.ultima().callback({ type: "intent-end", data: uscita("tardi") });
    expect(f.assistente.turni[0]?.fase).toBe("errore");
    // offline non si rimanda
    expect(f.assistente.rimanda(t?.id ?? -1)).toBe(false);
    f.ricollega();
    expect(f.assistente.rimanda(t?.id ?? -1)).toBe(true);
    expect(f.sottoscrizioni).toHaveLength(2);
    expect(f.ultima().messaggio.input).toEqual({ text: "spegni la tv" });
    // lo sostituisce: una domanda sola in vista
    expect(f.assistente.turni).toHaveLength(1);
  });

  it("risposta lenta: prima 'più del solito', poi errore di tempo e la pipeline viene chiusa", async () => {
    const f = connessioneFinta();
    f.assistente.chiedi("domanda lunga");
    await Promise.resolve();
    vi.advanceTimersByTime(LENTA_MS + 1);
    expect(f.assistente.lenta).toBe(true);
    vi.advanceTimersByTime(MASSIMO_MS);
    await Promise.resolve();
    expect(f.assistente.turni[0]?.errore?.tipo).toBe("tempo");
    expect(f.assistente.lenta).toBe(false);
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(true);
  });

  it("una domanda alla volta", () => {
    const f = connessioneFinta();
    expect(f.assistente.chiedi("uno")).toBe(true);
    expect(f.assistente.chiedi("due")).toBe(false);
  });

  it("dopo 5 minuti senza messaggi HA dimentica il contesto: si riparte vuoti", async () => {
    const f = connessioneFinta();
    f.assistente.chiedi("prima");
    await Promise.resolve();
    rispondi(f.ultima().callback, "Uno", "conv-1");
    f.avanza(CONTESTO_MS - 1000);
    f.assistente.controllaScadenza();
    expect(f.assistente.turni).toHaveLength(1);
    f.avanza(2000);
    f.assistente.controllaScadenza();
    expect(f.assistente.turni).toHaveLength(0);
    f.assistente.chiedi("nuova");
    expect(f.ultima().messaggio.conversation_id).toBeNull();
  });

  it("se HA non chiude la pipeline dopo la risposta, si pulisce comunque", async () => {
    const f = connessioneFinta();
    f.assistente.chiedi("x");
    await Promise.resolve();
    f.ultima().callback({ type: "intent-end", data: uscita("ok") });
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(false);
    vi.advanceTimersByTime(10_001);
    await Promise.resolve();
    expect(f.sottoscrizioni[0]?.disiscritta).toBe(true);
  });
});
