import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Assistente,
  CONTESTO_MS,
  LENTA_MS,
  MASSIMO_MS,
  type ConnessioneAssistente,
} from "../../../src/assistente/assistente";
import {
  applicaEvento,
  azioniDaRisultato,
  inCorso,
  nuovoTurno,
  type EventoPipeline,
} from "../../../src/assistente/eventi";
import { causaDaDettaglio, erroreDiGoogle, messaggioErrore } from "../../../src/assistente/messaggi";
import type { Bip, Riproduttore } from "../../../src/voce/audio";
import type { Microfono } from "../../../src/voce/microfono";
import { APERTURA_MASSIMA_MS, PENSA_MASSIMO_MS, Voce } from "../../../src/voce/voce";

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

  it("«[ignora]» (v0.6.5): mai mostrato, né a pezzi né finale, anche se il server svuota il finale", () => {
    const delta = (content: string) => ({ type: "intent-progress", data: { chat_log_delta: { content } } });
    let t = applicaEvento(nuovoTurno(1, "e poi gli ho detto"), { type: "run-start", data: {} });
    for (const pezzo of ["[ig", "nora", "]"]) {
      t = applicaEvento(t, delta(pezzo));
      expect(t.risposta).toBe("");
      expect(t.fase).toBe("pensa");
    }
    // il server lo silenzia svuotando il testo finale: non si ripiega sui pezzi
    expect(applicaEvento(t, { type: "intent-end", data: uscita("") })).toMatchObject({
      fase: "fatto",
      risposta: "",
    });
    // o lo lascia com'è (anche con spazi o maiuscole)
    expect(applicaEvento(t, { type: "intent-end", data: uscita(" [Ignora] ") }).risposta).toBe("");
    // agente senza streaming: lo stesso
    expect(applicaEvento(nuovoTurno(2, "x"), { type: "intent-end", data: uscita("[ignora]") }).risposta).toBe(
      "",
    );
    // controprova: una risposta vera che comincia come «[ignora]» per un pezzo si vede tutta
    let v = applicaEvento(nuovoTurno(3, "x"), delta("["));
    expect(v.risposta).toBe("");
    v = applicaEvento(v, delta("1] Fatto."));
    expect(v.risposta).toBe("[1] Fatto.");
    expect(applicaEvento(v, { type: "intent-end", data: uscita("") }).risposta).toBe("[1] Fatto.");
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
    // i nomi degli strumenti, senza doppioni (servono a capire se era un comando sulla musica)
    expect(t.strumenti).toEqual(["HassTurnOff"]);
    const musica = applicaEvento(t, {
      type: "intent-progress",
      data: {
        chat_log_delta: {
          tool_calls: [
            { tool_name: "script__jarvis_musica_controllo", tool_args: { azione: "pausa" } },
            { tool_name: "HassTurnOff", tool_args: {} },
          ],
        },
      },
    });
    expect(musica.strumenti).toEqual(["HassTurnOff", "script__jarvis_musica_controllo"]);
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
  const binari: Uint8Array[] = [];
  const assistente = new Assistente({
    conn: () => conn,
    inviaBinario: (d) => {
      binari.push(new Uint8Array(d));
      return true;
    },
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
    binari,
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

describe("messaggi d'errore per le persone", () => {
  const GEMINI = "Sorry, I had a problem getting a response from Google Generative AI.";
  const agente = (dettaglio: string) => messaggioErrore({ tipo: "agente", dettaglio });

  it("429 della quota (testo vero di HA durante la risposta)", () => {
    const m = agente(`unknown: ${GEMINI}: Resource has been exhausted (e.g. check quota).`);
    expect(m.causa).toBe("quota");
    expect(m.titolo).toBe("Google non risponde, riprova tra poco.");
    expect(m.spiegazione).toContain("limite di richieste");
  });

  it("503 sovraccarico", () => {
    expect(agente(`unknown: ${GEMINI}: The model is overloaded. Please try again later.`).causa).toBe(
      "occupato",
    );
    expect(causaDaDettaglio("503 UNAVAILABLE")).toBe("occupato");
  });

  it("errore all'invio senza causa: messaggio che copre entrambe, niente invenzioni", () => {
    const m = agente(`unknown: ${GEMINI}`);
    expect(m.causa).toBe("gemini");
    expect(m.spiegazione).toContain("occupato o aver raggiunto il limite");
  });

  it("errori di HA o della pipeline non vengono attribuiti a Gemini", () => {
    expect(agente("pipeline-not-found: Pipeline not found").causa).toBe("altro");
    expect(agente("La pipeline si è chiusa senza risposta").titolo).toBe(
      "Jarvis non è riuscito a rispondere.",
    );
  });

  it("nessun messaggio contiene testo in inglese o il dettaglio tecnico", () => {
    for (const d of [`${GEMINI}: Resource has been exhausted`, GEMINI, "x: y"]) {
      const m = agente(d);
      expect(`${m.titolo} ${m.spiegazione}`).not.toMatch(/Sorry|Google Generative|exhausted|pipeline/i);
    }
  });

  it("connessione persa: si rimanda, con l'avviso di guardare le card", () => {
    const m = messaggioErrore({ tipo: "connessione", dettaglio: "" });
    expect(m.pulsante).toBe("Rimanda");
    expect(m.spiegazione).toContain("guarda le card");
  });
});

describe("voce: eventi della pipeline stt→tts", () => {
  const avvio = {
    type: "run-start",
    data: {
      conversation_id: "c1",
      runner_data: { stt_binary_handler_id: 3, timeout: 60 },
      tts_output: {
        token: "t",
        url: "/api/tts_proxy/t.mp3",
        mime_type: "audio/mpeg",
        stream_response: false,
      },
    },
  };

  it("ascolto → id per l'audio → fine del parlato → domanda sentita → audio pronto a tts-end", () => {
    let t = nuovoTurno(1, "", true);
    expect(t.fase).toBe("ascolto");
    expect(inCorso(t)).toBe(true);
    t = applicaEvento(t, avvio);
    expect(t.idAudio).toBe(3);
    expect(t.urlAudio).toBe("/api/tts_proxy/t.mp3");
    expect(t.fase).toBe("ascolto");
    t = applicaEvento(t, { type: "stt-vad-end", data: {} });
    expect(t.fineParlato).toBe(true);
    t = applicaEvento(t, { type: "stt-end", data: { stt_output: { text: " spegni la tv " } } });
    expect(t.domanda).toBe("spegni la tv");
    expect(t.fase).toBe("pensa");
    t = applicaEvento(t, { type: "intent-end", data: uscita("Fatto.") });
    // risposta scritta ma audio non ancora pronto: la pipeline NON va chiusa
    expect(t.fase).toBe("fatto");
    expect(inCorso(t)).toBe(true);
    t = applicaEvento(t, { type: "tts-start", data: {} });
    expect(t.audioPronto).toBe(false);
    t = applicaEvento(t, { type: "tts-end", data: { tts_output: { url: "/api/tts_proxy/t.mp3" } } });
    expect(t.audioPronto).toBe(true);
    expect(inCorso(t)).toBe(false);
  });

  it("TTS in streaming: l'audio si scarica già a tts-start", () => {
    let t = applicaEvento(nuovoTurno(1, "", true), {
      type: "run-start",
      data: { tts_output: { url: "/api/tts_proxy/s.mp3", stream_response: true } },
    });
    t = applicaEvento(t, { type: "tts-start", data: {} });
    expect(t.audioPronto).toBe(true);
  });

  it("seguito: continue_conversation dalla risposta di HA", () => {
    const out = uscita("Vuoi che accenda il condizionatore?");
    out.intent_output.continue_conversation = true;
    const t = applicaEvento(nuovoTurno(1, "", true), { type: "intent-end", data: out });
    expect(t.continua).toBe(true);
  });

  it("nessuna parola riconosciuta → errore 'nonSentito'", () => {
    const t = applicaEvento(nuovoTurno(1, "", true), {
      type: "error",
      data: { code: "stt-no-text-recognized", message: "No text recognized" },
    });
    expect(t.errore?.tipo).toBe("nonSentito");
    expect(messaggioErrore(t.errore ?? { tipo: "agente", dettaglio: "" }, true).azione).toBe("parla");
  });

  it("v0.5.8 — trascrizione fallita (stt-stream-failed) → 'Google non risponde', non 'non ho capito'", () => {
    const t = applicaEvento(nuovoTurno(1, "", true), {
      type: "error",
      data: { code: "stt-stream-failed", message: "Speech-to-text failed" },
    });
    expect(t.errore?.tipo).toBe("servizio");
    const m = messaggioErrore(t.errore ?? { tipo: "agente", dettaglio: "" }, true);
    expect(m.titolo).toBe("Google non risponde, riprova tra poco.");
    expect(m.azione).toBe("parla");
    expect(erroreDiGoogle(t.errore)).toBe(true);
  });

  it("v0.5.8 — quali errori sono di Google (suono breve) e quali no", () => {
    const GEMINI = "Sorry, I had a problem getting a response from Google Generative AI.";
    expect(erroreDiGoogle({ tipo: "agente", dettaglio: `unknown: ${GEMINI}` })).toBe(true);
    expect(erroreDiGoogle({ tipo: "agente", dettaglio: "unknown: 503 The model is overloaded." })).toBe(true);
    expect(erroreDiGoogle({ tipo: "agente", dettaglio: "unknown: 429 quota" })).toBe(true);
    // controprove: non sentito, errore di HA, tempo, connessione → nessun suono
    expect(erroreDiGoogle({ tipo: "nonSentito", dettaglio: "stt-no-text-recognized: " })).toBe(false);
    expect(erroreDiGoogle({ tipo: "agente", dettaglio: "La pipeline si è chiusa senza risposta" })).toBe(
      false,
    );
    expect(erroreDiGoogle({ tipo: "tempo", dettaglio: "" })).toBe(false);
    expect(erroreDiGoogle({ tipo: "connessione", dettaglio: "" })).toBe(false);
    expect(erroreDiGoogle(null)).toBe(false);
  });
});

describe("voce: invio dell'audio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pipeline da stt a tts; audio solo dopo l'id, con l'id nel primo byte; fine una volta sola", async () => {
    const f = connessioneFinta();
    const id = f.assistente.parla(16000);
    expect(id).not.toBeNull();
    expect(f.ultima().messaggio).toMatchObject({
      start_stage: "stt",
      end_stage: "tts",
      input: { sample_rate: 16000 },
      timeout: MASSIMO_MS / 1000,
    });
    expect(f.ultima().opzioni).toEqual({ resubscribe: false });
    const pcm = new Int16Array([1, 2]).buffer;
    // HA non ha ancora dato l'id: niente parte
    expect(f.assistente.inviaAudio(id ?? -1, pcm)).toBe(false);
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 7 } } });
    expect(f.assistente.inviaAudio(id ?? -1, pcm)).toBe(true);
    expect(Array.from(f.binari[0] ?? [])).toEqual([7, 1, 0, 2, 0]);
    f.assistente.fineAudio(id ?? -1);
    f.assistente.fineAudio(id ?? -1);
    expect(f.binari.slice(1).map((b) => Array.from(b))).toEqual([[7]]);
    // dopo la fine niente più audio
    expect(f.assistente.inviaAudio(id ?? -1, pcm)).toBe(false);
  });

  it("il 'più lento del solito' non scatta mentre si parla, solo dopo", async () => {
    const f = connessioneFinta();
    const id = f.assistente.parla(16000) ?? -1;
    await Promise.resolve();
    vi.advanceTimersByTime(LENTA_MS + 1);
    expect(f.assistente.lenta).toBe(false);
    f.ultima().callback({ type: "stt-end", data: { stt_output: { text: "ciao" } } });
    vi.advanceTimersByTime(LENTA_MS + 1);
    expect(f.assistente.lenta).toBe(true);
    expect(f.assistente.turno(id)?.domanda).toBe("ciao");
  });

  it("un turno a voce senza frase non si 'rimanda': si riparla", async () => {
    const f = connessioneFinta();
    const id = f.assistente.parla(16000) ?? -1;
    await Promise.resolve();
    f.ultima().callback({ type: "error", data: { code: "stt-no-text-recognized" } });
    expect(f.assistente.rimanda(id)).toBe(false);
    f.assistente.scarta(id);
    expect(f.assistente.turni).toHaveLength(0);
  });
});

/**
 * Il pulsante del microfono non resta mai bloccato (sessione server, 30/09):
 * limiti di tempo in "apertura" e "pensa", e "ferma" che annulla mentre pensa.
 */
describe("voce: pulsante mai bloccato", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Microfono finto: si apre quando lo dice la prova (o mai). */
  function vocePer(f: ReturnType<typeof connessioneFinta>, apriSubito = true) {
    let attivo = false;
    const microfono = {
      get attivo() {
        return attivo;
      },
      avvia: () =>
        apriSubito
          ? ((attivo = true), Promise.resolve(16000))
          : new Promise<number>(() => {
              /* getUserMedia che non risponde mai */
            }),
      ferma: () => {
        attivo = false;
      },
    } as unknown as Microfono;
    const riproduttore = {
      riproduci: () => Promise.resolve("finito"),
      ferma: () => undefined,
    } as unknown as Riproduttore;
    const bip = { suona: () => undefined } as unknown as Bip;
    return new Voce({ assistente: f.assistente, collegato: () => true, microfono, riproduttore, bip });
  }

  /** Tocco, HA dà l'id, sente la frase: la voce passa a "pensa". */
  async function finoAPensa(f: ReturnType<typeof connessioneFinta>, v: Voce) {
    await v.parla("chat");
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 1 } } });
    f.ultima().callback({ type: "stt-end", data: { stt_output: { text: "che ore sono?" } } });
    expect(v.fase).toBe("pensa");
  }

  it("il microfono che non si apre: dopo il limite, messaggio e pulsante di nuovo attivo", async () => {
    const f = connessioneFinta();
    const v = vocePer(f, false);
    void v.parla("chat");
    expect(v.fase).toBe("apertura");
    vi.advanceTimersByTime(APERTURA_MASSIMA_MS + 1);
    expect(v.fase).toBe("errore");
    expect(v.erroreMicrofono?.problema).toBe("altro");
    // nessuna domanda partita
    expect(f.sottoscrizioni).toHaveLength(0);
  });

  it("nessuna risposta mentre pensa: dopo il limite, errore 'tempo', pipeline chiusa, si può riparlare", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await finoAPensa(f, v);
    vi.advanceTimersByTime(PENSA_MASSIMO_MS + 1);
    expect(v.fase).toBe("errore");
    expect(v.turno?.errore?.tipo).toBe("tempo");
    expect(f.assistente.occupato).toBe(false);
    await Promise.resolve();
    expect(f.ultima().disiscritta).toBe(true);
    // un evento in ritardo di HA non riapre niente
    f.sottoscrizioni[0]?.callback({ type: "intent-end", data: uscita("Sono le 18.") });
    expect(v.turno?.fase).toBe("errore");
  });

  it("'ferma' mentre pensa annulla la domanda (prima il tocco non faceva niente per 60 s)", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await finoAPensa(f, v);
    v.ferma();
    expect(v.turno?.errore?.tipo).toBe("annullata");
    expect(messaggioErrore(v.turno?.errore ?? { tipo: "agente", dettaglio: "" }).titolo).toBe(
      "Domanda annullata.",
    );
    expect(f.assistente.occupato).toBe(false);
    // il pulsante è di nuovo buono: una domanda nuova parte
    v.ferma();
    expect(v.fase).toBe("spenta");
    await v.parla("chat");
    expect(f.sottoscrizioni).toHaveLength(2);
  });

  it("risposta scritta arrivata ma l'audio no: al limite resta la risposta, senza errore", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await finoAPensa(f, v);
    f.ultima().callback({ type: "intent-end", data: uscita("Sono le 18.") });
    expect(v.fase).toBe("pensa");
    vi.advanceTimersByTime(PENSA_MASSIMO_MS + 1);
    expect(v.fase).toBe("spenta");
    expect(v.turno?.fase).toBe("fatto");
    expect(v.turno?.risposta).toBe("Sono le 18.");
    expect(f.assistente.occupato).toBe(false);
  });
});
