/**
 * Logica pura dell'assistente: come gli eventi di `assist_pipeline/run`
 * (verificati sul codice di HA 2026.9.3, vedi CLAUDE.md) diventano un "turno"
 * della conversazione. Niente WebSocket, niente interfaccia: si prova da sola.
 */

/** Un comando eseguito da Gemini, letto dal risultato di HA (mai dal testo di Gemini). */
export interface Azione {
  /** Nome come lo riporta HA (es. "TV Salotto"). */
  nome: string;
  /** entity_id, se il bersaglio è un'entità: l'etichetta ne mostra lo stato vero. */
  entita: string | null;
  riuscita: boolean;
}

export type FaseTurno =
  | "ascolto" // solo voce: il microfono è aperto, la domanda non c'è ancora
  | "invio" // domanda partita, HA non ha ancora confermato
  | "pensa" // HA ha preso la domanda, Gemini non ha ancora scritto niente
  | "scrive" // la risposta sta arrivando
  | "fatto"
  | "errore";

export type TipoErrore =
  | "agente" // Gemini (o la pipeline) ha risposto con un errore
  | "connessione" // HA perso a metà: non si sa cosa è stato eseguito
  | "tempo" // nessuna risposta entro il tempo massimo
  | "offline" // HA non collegato: la domanda non è mai partita
  | "nonSentito"; // voce: HA non ha riconosciuto nessuna parola

export interface Turno {
  id: number;
  domanda: string;
  fase: FaseTurno;
  /** Testo della risposta: in arrivo durante "scrive", definitivo a "fatto". */
  risposta: string;
  azioni: Azione[];
  errore: { tipo: TipoErrore; dettaglio: string } | null;
  /** Gemini ha chiamato almeno uno strumento: un comando potrebbe essere partito. */
  strumentiChiamati: boolean;
  /**
   * Nomi degli strumenti chiamati (`tool_name`). Gli script esposti ad Assist
   * si chiamano `script__<nome>` (helpers/llm.py, ActionTool di HA 2026.9.3).
   */
  strumenti: string[];
  /** Arrivato un evento finale: la sottoscrizione si può chiudere. */
  concluso: boolean;
  conversationId: string | null;
  /** Turno a voce (pipeline da stt a tts): la domanda arriva a `stt-end`. */
  voce: boolean;
  /** Voce: id per mandare l'audio del microfono (run-start → runner_data). */
  idAudio: number | null;
  /** Voce: HA ha sentito la fine del parlato (VAD) o ha già il testo: il microfono si chiude. */
  fineParlato: boolean;
  /** Voce: URL dell'audio della risposta (/api/tts_proxy/…, senza login). */
  urlAudio: string | null;
  /** Voce: HA manda l'audio in streaming (run-start → tts_output.stream_response). */
  audioInStreaming: boolean;
  /** Voce: l'audio si può scaricare adesso (tts-end, o tts-start se HA lo manda in streaming). */
  audioPronto: boolean;
  /** Voce: HA vuole un seguito (continue_conversation): il microfono si riapre da solo. */
  continua: boolean;
}

export function nuovoTurno(id: number, domanda: string, voce = false): Turno {
  return {
    id,
    domanda,
    voce,
    idAudio: null,
    fineParlato: false,
    urlAudio: null,
    audioInStreaming: false,
    audioPronto: false,
    continua: false,
    fase: voce ? "ascolto" : "invio",
    risposta: "",
    azioni: [],
    errore: null,
    strumentiChiamati: false,
    strumenti: [],
    concluso: false,
    conversationId: null,
  };
}

/** Evento della pipeline come lo manda HA (`connection.send_event`). */
export interface EventoPipeline {
  type: string;
  data?: Record<string, unknown> | null;
  timestamp?: string;
}

type Oggetto = Record<string, unknown>;
const oggetto = (v: unknown): Oggetto | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Oggetto) : null;
const testo = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Testo parlato di una risposta di HA: `speech.plain.speech`. */
export function testoRisposta(risposta: unknown): string {
  const plain = oggetto(oggetto(oggetto(risposta)?.speech)?.plain);
  return testo(plain?.speech) ?? "";
}

/**
 * Azioni da un risultato di strumento. Per i comandi di HA (HassTurnOff, ...)
 * il risultato è una risposta di intent: `data.success` / `data.failed`, con
 * bersagli `{name, type, id}`. Altri strumenti (es. gli script) non hanno
 * bersagli: niente etichetta, meglio che un'etichetta inventata.
 */
export function azioniDaRisultato(risultato: unknown): Azione[] {
  const dati = oggetto(oggetto(risultato)?.data);
  if (!dati) return [];
  const leggi = (elenco: unknown, riuscita: boolean): Azione[] =>
    (Array.isArray(elenco) ? elenco : []).flatMap((b): Azione[] => {
      const bersaglio = oggetto(b);
      const nome = testo(bersaglio?.name);
      if (!bersaglio || !nome) return [];
      const id = testo(bersaglio.id);
      const entita = bersaglio.type === "entity" && id?.includes(".") ? id : null;
      return [{ nome, entita, riuscita }];
    });
  return [...leggi(dati.success, true), ...leggi(dati.failed, false)];
}

function conNome(nomi: string[], nome: string | null): string[] {
  return nome && !nomi.includes(nome) ? [...nomi, nome] : nomi;
}

/** Applica un evento al turno. Ritorna un turno nuovo (mai modifica quello vecchio). */
export function applicaEvento(t: Turno, ev: EventoPipeline): Turno {
  if (t.concluso) return t;
  const dati = oggetto(ev.data) ?? {};
  switch (ev.type) {
    case "run-start": {
      // voce: id per l'audio del microfono e URL della risposta (già noto qui)
      const tts = oggetto(dati.tts_output);
      return {
        ...t,
        fase: t.fase === "invio" ? "pensa" : t.fase,
        conversationId: testo(dati.conversation_id) ?? t.conversationId,
        idAudio: numero(oggetto(dati.runner_data)?.stt_binary_handler_id) ?? t.idAudio,
        urlAudio: testo(tts?.url) ?? t.urlAudio,
        audioInStreaming: tts?.stream_response === true || t.audioInStreaming,
      };
    }
    case "stt-vad-end":
      return { ...t, fineParlato: true };
    case "stt-end": {
      const sentito = testo(oggetto(dati.stt_output)?.text)?.trim() ?? "";
      return { ...t, domanda: sentito || t.domanda, fineParlato: true, fase: "pensa" };
    }
    case "intent-start":
      return {
        ...t,
        fase: t.fase === "invio" || t.fase === "ascolto" ? "pensa" : t.fase,
        fineParlato: true,
        conversationId: testo(dati.conversation_id) ?? t.conversationId,
      };
    case "intent-progress": {
      const delta = oggetto(dati.chat_log_delta);
      if (!delta) return t;
      if (delta.role === "tool_result")
        return {
          ...t,
          strumentiChiamati: true,
          strumenti: conNome(t.strumenti, testo(delta.tool_name)),
          azioni: [...t.azioni, ...azioniDaRisultato(delta.tool_result)],
        };
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0)
        return {
          ...t,
          strumentiChiamati: true,
          strumenti: delta.tool_calls.reduce<string[]>(
            (nomi, c) => conNome(nomi, testo(oggetto(c)?.tool_name)),
            t.strumenti,
          ),
        };
      const pezzo = testo(delta.content);
      if (pezzo) return { ...t, fase: "scrive", risposta: t.risposta + pezzo };
      return t;
    }
    case "intent-end": {
      const uscita = oggetto(dati.intent_output);
      const risposta = oggetto(uscita?.response);
      const conversationId = testo(uscita?.conversation_id) ?? t.conversationId;
      if (risposta?.response_type === "error") {
        const codice = testo(oggetto(risposta.data)?.code) ?? "sconosciuto";
        return {
          ...t,
          fase: "errore",
          conversationId,
          errore: { tipo: "agente", dettaglio: `${codice}: ${testoRisposta(risposta)}`.trim() },
        };
      }
      // il testo finale di HA vince su quello arrivato a pezzi
      const finale = testoRisposta(risposta) || t.risposta;
      return {
        ...t,
        fase: "fatto",
        risposta: finale,
        conversationId,
        continua: uscita?.continue_conversation === true,
      };
    }
    case "tts-start":
      // In streaming l'audio si scarica SUBITO: per le risposte locali HA non
      // manda run-end finché qualcuno non consuma l'audio (sessione server, 29/09).
      return t.audioInStreaming && t.urlAudio && !t.audioPronto ? { ...t, audioPronto: true } : t;
    case "tts-end": {
      const url = testo(oggetto(dati.tts_output)?.url) ?? t.urlAudio;
      return { ...t, urlAudio: url, audioPronto: url !== null };
    }
    case "error":
      return {
        ...t,
        fase: "errore",
        concluso: true,
        errore: {
          tipo:
            dati.code === "timeout"
              ? "tempo"
              : dati.code === "stt-no-text-recognized"
                ? "nonSentito"
                : "agente",
          dettaglio: `${testo(dati.code) ?? "errore"}: ${testo(dati.message) ?? ""}`.trim(),
        },
      };
    case "run-end":
      // run-end senza intent-end: la pipeline si è chiusa senza risposta
      if (t.fase !== "fatto" && t.fase !== "errore")
        return {
          ...t,
          fase: "errore",
          concluso: true,
          errore: { tipo: "agente", dettaglio: "La pipeline si è chiusa senza risposta" },
        };
      return { ...t, concluso: true };
    default:
      return t;
  }
}

/**
 * Il turno non ha ancora una fine: aspetta eventi. Un turno a voce con la
 * risposta scritta ma senza l'audio aspetta ancora tts-end: chiudere lì la
 * pipeline la cancellerebbe prima della TTS.
 */
export const inCorso = (t: Turno): boolean =>
  t.fase === "ascolto" ||
  t.fase === "invio" ||
  t.fase === "pensa" ||
  t.fase === "scrive" ||
  (t.voce && t.fase === "fatto" && !t.audioPronto);
