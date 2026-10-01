import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assistente, RISPOSTA_STOP, type ConnessioneAssistente } from "../../src/assistente/assistente";
import { applicaEvento, nuovoTurno, type EventoPipeline } from "../../src/assistente/eventi";
import { messaggioErrore } from "../../src/assistente/messaggi";
import {
  AscoltoParola,
  leggiAcceso,
  PAUSA_DOPO_SCATTO_MS,
  PAUSA_DOPO_VOCE_MS,
  puoScattare,
  RIEPILOGO_SE_ALMENO,
  riepilogoDaScrivere,
  SECONDI_MEMORIA,
} from "../../src/parola/ascolto";
import { Ricampionatore } from "../../src/parola/ricampiona";
import { eComandoStop } from "../../src/parola/stop";
import type { Bip, Riproduttore } from "../../src/voce/audio";
import { vincoliAudio, type Ascoltatori } from "../../src/voce/microfono";
import { leggiElaborazione, MicrofonoCondiviso } from "../../src/voce/microfono-condiviso";
import { Voce } from "../../src/voce/voce";

describe("«Jarvis, stop» mentre suona un timer", () => {
  it("solo parole di arresto (dopo la parola e i riempitivi) sono uno stop", () => {
    for (const t of [
      "Jarvis, stop.",
      "stop",
      "Basta!",
      "Jarvis basta così grazie",
      "ferma il timer",
      "Giarvis, fermati",
      "zitto",
    ])
      expect(eComandoStop(t), t).toBe(true);
  });
  it("una domanda o un comando non sono uno stop, e il silenzio nemmeno", () => {
    for (const t of [
      "Jarvis, spegni la TV",
      "stop alla musica",
      "che ore sono?",
      "Jarvis",
      "",
      "basta con la pioggia",
    ])
      expect(eComandoStop(t), t).toBe(false);
  });
  it("la parola del modello (da parola.json) si toglie come «Jarvis»", () => {
    expect(eComandoStop("Ehi Casa, basta", "Ehi Casa")).toBe(true);
  });
});

describe("ricampionamento a 16 kHz", () => {
  it("a 16 kHz non tocca niente", () => {
    const pcm = new Int16Array([1, 2, 3]);
    expect(new Ricampionatore(16000).a16k(pcm)).toBe(pcm);
  });
  it("da 48 kHz: un campione su tre, anche a cavallo tra i pezzi", () => {
    const r = new Ricampionatore(48000);
    const tutto = Int16Array.from({ length: 3000 }, (_, i) => i);
    const a = r.a16k(tutto.subarray(0, 1000));
    const b = r.a16k(tutto.subarray(1000));
    const uscita = [...a, ...b];
    expect(uscita.length).toBeGreaterThanOrEqual(999);
    expect(uscita.length).toBeLessThanOrEqual(1000);
    // una rampa resta una rampa con passo 3, senza salti all'attacco dei pezzi
    for (let i = 1; i < uscita.length; i++) expect((uscita[i] ?? 0) - (uscita[i - 1] ?? 0)).toBe(3);
  });
  it("da 44,1 kHz: la durata si conserva", () => {
    const r = new Ricampionatore(44100);
    let n = 0;
    for (let k = 0; k < 44; k++) n += r.a16k(new Int16Array(1024)).length;
    expect(Math.abs(n - (44 * 1024 * 16000) / 44100)).toBeLessThan(2);
  });
});

describe("quando scatta «Jarvis»", () => {
  const e = { punteggio: 0.9 };
  it("sopra la soglia, con la voce ferma e fuori dalle pause", () => {
    expect(puoScattare(e, 0.5, 10_000, -Infinity, false, -Infinity, false)).toBe(true);
    expect(puoScattare({ punteggio: 0.4 }, 0.5, 10_000, -Infinity, false, -Infinity, false)).toBe(false);
  });
  it("mai mentre Jarvis ascolta o risponde, né durante la registrazione degli esempi", () => {
    expect(puoScattare(e, 0.5, 10_000, -Infinity, true, -Infinity, false)).toBe(false);
    expect(puoScattare(e, 0.5, 10_000, -Infinity, false, -Infinity, true)).toBe(false);
  });
  it("una frase = uno scatto; e la coda della risposta dall'altoparlante non lo fa ripartire", () => {
    expect(puoScattare(e, 0.5, 10_000, 10_000 - PAUSA_DOPO_SCATTO_MS + 1, false, -Infinity, false)).toBe(
      false,
    );
    expect(puoScattare(e, 0.5, 10_000, 10_000 - PAUSA_DOPO_SCATTO_MS, false, -Infinity, false)).toBe(true);
    expect(puoScattare(e, 0.5, 10_000, -Infinity, false, 10_000 - PAUSA_DOPO_VOCE_MS + 1, false)).toBe(false);
    expect(puoScattare(e, 0.5, 10_000, -Infinity, false, 10_000 - PAUSA_DOPO_VOCE_MS, false)).toBe(true);
  });
  it("memoria di circa 1 s, e acceso di serie", () => {
    expect(SECONDI_MEMORIA).toBe(1);
    expect(leggiAcceso(null)).toBe(true);
    expect(leggiAcceso('{"acceso":false}')).toBe(false);
    expect(leggiAcceso('{"acceso":true}')).toBe(true);
    expect(leggiAcceso("rotto")).toBe(true);
  });
});

/** Connessione finta: registra le sottoscrizioni e manda eventi (come in assistente.test.ts). */
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
  };
}

describe("assistente: domanda nata da «Jarvis»", () => {
  it("pipeline normale stt→tts con wake_word_phrase, SENZA no_vad", () => {
    const f = connessioneFinta();
    f.assistente.parla(16000, { parola: "Jarvis" });
    const m = f.ultima().messaggio;
    expect(m).toMatchObject({
      start_stage: "stt",
      end_stage: "tts",
      input: { sample_rate: 16000, wake_word_phrase: "Jarvis" },
    });
    expect((m["input"] as Record<string, unknown>)["no_vad"]).toBeUndefined();
  });
  it("col tocco niente wake_word_phrase (HA non deve scartarla come doppione)", () => {
    const f = connessioneFinta();
    f.assistente.parla(16000);
    expect(f.ultima().messaggio["input"]).toEqual({ sample_rate: 16000 });
  });
  it("mentre suona un timer: «stop» si chiude qui, senza Gemini", async () => {
    const f = connessioneFinta();
    const decisioni: string[] = [];
    const id =
      f.assistente.parla(16000, {
        parola: "Jarvis",
        dopoTrascrizione: (t) => (decisioni.push(t), "fermato"),
      }) ?? -1;
    expect(f.ultima().messaggio).toMatchObject({ start_stage: "stt", end_stage: "stt" });
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 3 } } });
    f.ultima().callback({ type: "stt-end", data: { stt_output: { text: "Jarvis, stop." } } });
    expect(decisioni).toEqual(["Jarvis, stop."]);
    expect(f.sottoscrizioni).toHaveLength(1);
    expect(f.ultima().disiscritta).toBe(true);
    expect(f.assistente.turno(id)).toMatchObject({
      fase: "fatto",
      risposta: RISPOSTA_STOP,
      urlAudio: null,
      concluso: true,
    });
    expect(f.assistente.occupato).toBe(false);
  });
  it("mentre suona un timer: un'altra domanda riparte da intent a tts sullo stesso turno", async () => {
    const f = connessioneFinta();
    const id = f.assistente.parla(16000, { parola: "Jarvis", dopoTrascrizione: () => "continua" }) ?? -1;
    await Promise.resolve();
    f.ultima().callback({
      type: "run-start",
      data: { conversation_id: "conv-9", runner_data: { stt_binary_handler_id: 3 } },
    });
    f.ultima().callback({ type: "stt-end", data: { stt_output: { text: "che ore sono?" } } });
    expect(f.sottoscrizioni).toHaveLength(2);
    expect(f.ultima().messaggio).toMatchObject({
      start_stage: "intent",
      end_stage: "tts",
      input: { text: "che ore sono?" },
      conversation_id: "conv-9",
    });
    expect(f.assistente.occupato).toBe(true);
    await Promise.resolve();
    const cb = f.ultima().callback;
    cb({ type: "run-start", data: { tts_output: { url: "/api/tts_proxy/x.wav" } } });
    cb({
      type: "intent-end",
      data: {
        intent_output: {
          response: { speech: { plain: { speech: "Le 18." } }, response_type: "action_done" },
        },
      },
    });
    cb({ type: "tts-end", data: { tts_output: { url: "/api/tts_proxy/x.wav" } } });
    expect(f.assistente.turno(id)).toMatchObject({
      fase: "fatto",
      domanda: "che ore sono?",
      risposta: "Le 18.",
      audioPronto: true,
    });
    expect(f.assistente.turni).toHaveLength(1);
  });
  it("doppio risveglio: errore «doppione», con un messaggio umano se mai si vede", () => {
    const t = applicaEvento(nuovoTurno(1, "", true), {
      type: "error",
      data: { code: "duplicate_wake_up_detected", message: "Duplicate wake-up detected for Jarvis" },
    });
    expect(t.errore?.tipo).toBe("doppione");
    expect(messaggioErrore(t.errore ?? { tipo: "doppione", dettaglio: "" }).titolo).toBe(
      "Ha risposto un altro pannello.",
    );
  });
});

describe("voce: domanda nata da «Jarvis»", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function vocePer(f: ReturnType<typeof connessioneFinta>) {
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
    const riproduttore = {
      riproduci: () => Promise.resolve("finito"),
      ferma: () => undefined,
    } as unknown as Riproduttore;
    const bip = { suona: () => undefined } as unknown as Bip;
    return new Voce({ assistente: f.assistente, collegato: () => true, microfono, riproduttore, bip });
  }

  it("prima la memoria (a pezzi da 1024 campioni), poi l'audio dal vivo", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    const preroll = Int16Array.from({ length: 2500 }, (_, i) => i);
    await v.parla("riquadro", false, { preroll, parola: "Jarvis" });
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 5 } } });
    // il primo pezzo dal vivo fa partire anche quelli tenuti da parte
    const dalVivo = new Int16Array([7, 7]).buffer;
    (v as unknown as { suPezzo(p: ArrayBuffer): void }).suPezzo(dalVivo);
    const lunghezze = f.binari.map((b) => (b.length - 1) / 2);
    expect(lunghezze).toEqual([1024, 1024, 452, 2]);
    expect(f.binari.every((b) => b[0] === 5)).toBe(true);
  });

  it("doppio risveglio: la voce si spegne in silenzio e il turno sparisce", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await v.parla("riquadro", false, { parola: "Jarvis" });
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 5 } } });
    f.ultima().callback({ type: "error", data: { code: "duplicate_wake_up_detected" } });
    expect(v.fase).toBe("spenta");
    expect(v.erroreMicrofono).toBeNull();
    expect(f.assistente.turni).toHaveLength(0);
  });

  it("«Jarvis» sentito per sbaglio e nessuno parla: si chiude in silenzio, niente «Non ho capito»", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await v.parla("riquadro", false, { parola: "Jarvis" });
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 5 } } });
    f.ultima().callback({ type: "error", data: { code: "stt-no-text-recognized" } });
    expect(v.fase).toBe("spenta");
    expect(f.assistente.turni).toHaveLength(0);
  });

  it("col tocco invece «Non ho capito» resta, per poter riparlare", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await v.parla("riquadro");
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 5 } } });
    f.ultima().callback({ type: "error", data: { code: "stt-no-text-recognized" } });
    expect(v.fase).toBe("errore");
  });

  it("«stop» senza audio di risposta: la voce finisce, non resta a pensare", async () => {
    const f = connessioneFinta();
    const v = vocePer(f);
    await v.parla("riquadro", false, { parola: "Jarvis", dopoTrascrizione: () => "fermato" });
    await Promise.resolve();
    f.ultima().callback({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 5 } } });
    f.ultima().callback({ type: "stt-end", data: { stt_output: { text: "stop" } } });
    expect(v.fase).toBe("spenta");
    expect(v.turno?.risposta).toBe(RISPOSTA_STOP);
  });
});

describe("ascolto: la voce che mostra un errore non rende «Jarvis» sordo", () => {
  function prova(fase: "errore" | "ascolto" | "spenta") {
    const chiamate: unknown[] = [];
    const voce = {
      attiva: fase !== "spenta",
      fase,
      ascolta: () => () => undefined,
      parla: (...a: unknown[]) => {
        chiamate.push(a);
        return Promise.resolve();
      },
    };
    const timer = { suonano: [], silenzia: () => undefined, ferma: () => undefined };
    const a = new AscoltoParola({
      micro: {} as unknown as MicrofonoCondiviso,
      voce: voce as unknown as ConstructorParameters<typeof AscoltoParola>[0]["voce"],
      timer: timer as unknown as ConstructorParameters<typeof AscoltoParola>[0]["timer"],
      adesso: () => 100_000,
    });
    const motore = { soglia: 0.5, inRegistrazione: null, parola: "Jarvis" };
    (a as unknown as { suEsito(e: unknown, m: unknown): void }).suEsito(
      { punteggio: 0.9, base: 0.9, verificato: false, ms: 5 },
      motore,
    );
    return chiamate.length;
  }
  it("con «Non ho capito» a schermo «Jarvis» scatta lo stesso", () => {
    expect(prova("errore")).toBe(1);
    expect(prova("spenta")).toBe(1);
  });
  it("mentre Jarvis ascolta no", () => {
    expect(prova("ascolto")).toBe(0);
  });
});

describe("microfono condiviso", () => {
  function microfonoFinto() {
    const stato = { aperture: 0, chiusure: 0, attivo: false, ascolta: null as Ascoltatori | null };
    return {
      stato,
      microfono: {
        get attivo() {
          return stato.attivo;
        },
        avvia: (a: Ascoltatori) => {
          stato.aperture++;
          stato.attivo = true;
          stato.ascolta = a;
          return Promise.resolve(16000);
        },
        ferma: () => {
          stato.chiusure++;
          stato.attivo = false;
        },
      },
    };
  }

  it("con l'ascolto continuo: un solo microfono, la voce si aggancia e staccandosi non lo chiude", async () => {
    const { stato, microfono } = microfonoFinto();
    const c = new MicrofonoCondiviso(microfono);
    const parola: number[] = [];
    await c.apriContinuo({ pezzo: (p) => parola.push(p.length), interrotto: () => undefined });
    const voce = c.perVoce();
    const perVoce: number[] = [];
    expect(await voce.avvia({ pezzo: (b) => perVoce.push(b.byteLength), livello: () => undefined })).toBe(
      16000,
    );
    expect(stato.aperture).toBe(1);
    stato.ascolta?.pezzo(new Int16Array(1024).buffer);
    expect(parola).toEqual([1024]);
    expect(perVoce).toEqual([2048]);
    voce.ferma();
    expect(stato.chiusure).toBe(0);
    expect(c.aperto).toBe(true);
    c.chiudiContinuo();
    expect(stato.chiusure).toBe(1);
  });

  it("senza ascolto continuo la voce apre e chiude il microfono come prima", async () => {
    const { stato, microfono } = microfonoFinto();
    const c = new MicrofonoCondiviso(microfono);
    const voce = c.perVoce();
    await voce.avvia({ pezzo: () => undefined, livello: () => undefined });
    expect(voce.attivo).toBe(true);
    voce.ferma();
    expect(stato.chiusure).toBe(1);
    expect(voce.attivo).toBe(false);
  });
});

describe("v0.5.1: registro e microfono", () => {
  it("riepilogo ogni 30 s nei primi 10 minuti e quando qualcosa somiglia alla parola; poi ogni 10 minuti", () => {
    const min = 60_000;
    expect(riepilogoDaScrivere(0.001, 5 * min, 30_000)).toBe(true);
    expect(riepilogoDaScrivere(0.001, 20 * min, 30_000)).toBe(false);
    expect(riepilogoDaScrivere(RIEPILOGO_SE_ALMENO, 20 * min, 30_000)).toBe(true);
    expect(riepilogoDaScrivere(0.001, 20 * min, 10 * min)).toBe(true);
  });

  it("elaborazione del microfono: di serie solo l'eco; le tre scelte diventano i vincoli di getUserMedia", () => {
    expect(leggiElaborazione(null)).toBe("solo-eco");
    expect(leggiElaborazione('{"elaborazione":"nessuna"}')).toBe("nessuna");
    expect(leggiElaborazione('{"elaborazione":"strana"}')).toBe("solo-eco");
    expect(leggiElaborazione("rotto")).toBe("solo-eco");
    expect(vincoliAudio("solo-eco")).toEqual({
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(vincoliAudio("nessuna")).toMatchObject({ echoCancellation: false, noiseSuppression: false });
    expect(vincoliAudio("tutta")).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("cambiando l'elaborazione a microfono aperto, lo si riapre con i vincoli nuovi", async () => {
    const usate: string[] = [];
    let attivo = false;
    const c = new MicrofonoCondiviso({
      get attivo() {
        return attivo;
      },
      avvia: (_a: Ascoltatori, e?: string) => {
        usate.push(e ?? "?");
        attivo = true;
        return Promise.resolve(16000);
      },
      ferma: () => {
        attivo = false;
      },
    });
    await c.apriContinuo({ pezzo: () => undefined, interrotto: () => undefined });
    await c.impostaElaborazione("nessuna");
    expect(usate).toEqual(["solo-eco", "nessuna"]);
    expect(c.aperto).toBe(true);
  });
});
