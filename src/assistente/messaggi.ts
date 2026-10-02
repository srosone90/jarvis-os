import type { Turno } from "./eventi";

/**
 * Messaggi per le persone quando una risposta non arriva. Qui e non nella chat:
 * la voce (F5) e l'Hub devono dire le stesse cose. Mai testo tecnico o in
 * inglese davanti all'utente: il dettaglio vero va nel log della diagnostica.
 *
 * Come arrivano gli errori di Gemini (codice di HA 2026.9.3,
 * google_generative_ai_conversation/entity.py), sempre come risposta con
 * `response_type: "error"`:
 *  - errore all'invio (di solito il 429 della quota): solo
 *    "Sorry, I had a problem getting a response from Google Generative AI."
 *    senza la causa, quindi 429 e 503 non si distinguono;
 *  - errore durante la risposta: lo stesso testo + ": <messaggio di Google>",
 *    es. "Resource has been exhausted (e.g. check quota)." o
 *    "The model is overloaded. Please try again later."
 */
export type CausaErrore =
  | "quota" // limite di richieste raggiunto (429)
  | "occupato" // Gemini sovraccarico o non disponibile (503)
  | "gemini" // errore di Gemini senza causa (all'invio: può essere l'uno o l'altro)
  | "altro" // errore di HA o della pipeline
  | "tempo"
  | "connessione"
  | "offline"
  | "nonSentito"
  | "servizio" // la trascrizione di Google è fallita (stt-stream-failed, v0.5.8)
  | "annullata"
  | "doppione";

export interface MessaggioErrore {
  causa: CausaErrore;
  titolo: string;
  spiegazione: string;
  /** Testo del pulsante. */
  pulsante: string;
  /** Cosa fa il pulsante: rimanda la stessa frase, o riapre il microfono (voce senza frase). */
  azione: "rimanda" | "parla";
}

/** Perché il microfono non si è aperto. */
export type ProblemaMicrofono = "https" | "negato" | "assente" | "occupato" | "altro";

export interface MessaggioMicrofono {
  problema: ProblemaMicrofono;
  titolo: string;
  spiegazione: string;
}

/**
 * Messaggi del microfono. Chrome lo concede solo su un indirizzo sicuro (HTTPS o
 * localhost): sull'indirizzo di casa in http `navigator.mediaDevices` non esiste.
 */
export function messaggioMicrofono(problema: ProblemaMicrofono): MessaggioMicrofono {
  const testi: Record<ProblemaMicrofono, [string, string]> = {
    https: [
      "Serve l'indirizzo sicuro.",
      "Il microfono funziona solo sull'indirizzo https di casa. Intanto puoi scrivere.",
    ],
    negato: [
      "Microfono non consentito.",
      "Tocca il lucchetto accanto all'indirizzo → Autorizzazioni → Microfono → Consenti, poi riprova.",
    ],
    assente: ["Nessun microfono trovato.", "Questo dispositivo non ha un microfono disponibile."],
    occupato: [
      "Il microfono è occupato.",
      "Un'altra app lo sta usando (una chiamata, un registratore). Chiudila e riprova.",
    ],
    altro: ["Il microfono non si è aperto.", "Riprova tra poco. Intanto puoi scrivere."],
  };
  const [titolo, spiegazione] = testi[problema];
  return { problema, titolo, spiegazione };
}

/** Classifica l'errore di getUserMedia (nomi standard delle DOMException). */
export function problemaDaErrore(errore: unknown): ProblemaMicrofono {
  const nome = errore instanceof Error || errore instanceof DOMException ? errore.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") return "negato";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "assente";
  if (nome === "NotReadableError" || nome === "AbortError") return "occupato";
  return "altro";
}

const DA_GEMINI = /google generative ai|gemini/i;
const QUOTA = /\b429\b|quota|resource[ _]?(has been )?exhausted|rate[ _-]?limit|too many requests/i;
const OCCUPATO = /\b503\b|overload|unavailable|try again later|high demand/i;

/** Riconosce la causa dal dettaglio che manda HA. */
export function causaDaDettaglio(dettaglio: string): "quota" | "occupato" | "gemini" | "altro" {
  if (QUOTA.test(dettaglio)) return "quota";
  if (OCCUPATO.test(dettaglio)) return "occupato";
  return DA_GEMINI.test(dettaglio) ? "gemini" : "altro";
}

const ANCORA_QUI = "La domanda è ancora qui.";
/** Il titolo degli errori di Google (v0.5.8): trascrizione o Gemini, dopo i tentativi del server. */
export const GOOGLE_NON_RISPONDE = "Google non risponde, riprova tra poco.";

/**
 * Errore di Google (v0.5.8): la trascrizione (stt-stream-failed) o Gemini
 * (quota, sovraccarico, errore senza causa). La voce lo segnala con un suono
 * breve; "non ho capito" (stt-no-text-recognized) resta silenzioso.
 */
export function erroreDiGoogle(errore: Turno["errore"]): boolean {
  if (!errore) return false;
  if (errore.tipo === "servizio") return true;
  return errore.tipo === "agente" && causaDaDettaglio(errore.dettaglio) !== "altro";
}

/**
 * `senzaFrase`: turno a voce finito prima che HA riconoscesse le parole. Non
 * c'è niente da rimandare: il pulsante riapre il microfono.
 */
export function messaggioErrore(errore: NonNullable<Turno["errore"]>, senzaFrase = false): MessaggioErrore {
  const m = messaggioBase(errore);
  return senzaFrase ? { ...m, pulsante: "Parla di nuovo", azione: "parla" } : m;
}

function messaggioBase(errore: NonNullable<Turno["errore"]>): MessaggioErrore {
  switch (errore.tipo) {
    case "nonSentito":
      return {
        causa: "nonSentito",
        titolo: "Non ho capito, puoi ripetere?",
        spiegazione: "Tocca il microfono e parla dopo il bip, un po' più vicino.",
        pulsante: "Parla di nuovo",
        azione: "parla",
      };
    case "doppione":
      return {
        causa: "doppione",
        titolo: "Ha risposto un altro pannello.",
        spiegazione: "«Jarvis» l'ha sentito anche un pannello vicino, e ha risposto lui.",
        pulsante: "Parla di nuovo",
        azione: "parla",
      };
    case "servizio":
      return {
        causa: "servizio",
        titolo: GOOGLE_NON_RISPONDE,
        spiegazione: "La trascrizione della voce non è arrivata, anche dopo i tentativi del server.",
        pulsante: "Parla di nuovo",
        azione: "parla",
      };
    case "annullata":
      return {
        causa: "annullata",
        titolo: "Domanda annullata.",
        spiegazione: "L'hai fermata tu. Se era un comando, guarda le card: potrebbe essere già partito.",
        pulsante: "Riprova",
        azione: "rimanda",
      };
    case "connessione":
      return {
        causa: "connessione",
        titolo: "Connessione persa durante la risposta.",
        spiegazione:
          "Se avevi chiesto un comando, guarda le card prima di rimandare: potrebbe essere già stato eseguito.",
        pulsante: "Rimanda",
        azione: "rimanda",
      };
    case "tempo":
      return {
        causa: "tempo",
        titolo: "Jarvis non ha risposto in tempo.",
        spiegazione: `Gemini ci ha messo troppo. ${ANCORA_QUI}`,
        pulsante: "Riprova",
        azione: "rimanda",
      };
    case "offline":
      return {
        causa: "offline",
        titolo: "Home Assistant non raggiungibile.",
        spiegazione: "Quando torna la connessione puoi riprovare.",
        pulsante: "Riprova",
        azione: "rimanda",
      };
    case "agente":
      break;
  }
  const causa = causaDaDettaglio(errore.dettaglio);
  const testi: Record<typeof causa, [string, string]> = {
    // v0.5.8: un titolo solo per Google, la causa nella spiegazione
    quota: [GOOGLE_NON_RISPONDE, `Gemini ha raggiunto il limite di richieste. ${ANCORA_QUI}`],
    occupato: [GOOGLE_NON_RISPONDE, `Gemini è sovraccarico in questo momento. ${ANCORA_QUI}`],
    gemini: [
      GOOGLE_NON_RISPONDE,
      `Gemini non ha risposto: può essere occupato o aver raggiunto il limite di richieste. ${ANCORA_QUI}`,
    ],
    altro: ["Jarvis non è riuscito a rispondere.", `Home Assistant ha dato un errore. ${ANCORA_QUI}`],
  };
  const [titolo, spiegazione] = testi[causa];
  return { causa, titolo, spiegazione, pulsante: "Riprova", azione: "rimanda" };
}
