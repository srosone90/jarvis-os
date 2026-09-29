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
  | "offline";

export interface MessaggioErrore {
  causa: CausaErrore;
  titolo: string;
  spiegazione: string;
  /** Testo del pulsante per rimandare la stessa domanda. */
  pulsante: string;
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

export function messaggioErrore(errore: NonNullable<Turno["errore"]>): MessaggioErrore {
  switch (errore.tipo) {
    case "connessione":
      return {
        causa: "connessione",
        titolo: "Connessione persa durante la risposta.",
        spiegazione:
          "Se avevi chiesto un comando, guarda le card prima di rimandare: potrebbe essere già stato eseguito.",
        pulsante: "Rimanda",
      };
    case "tempo":
      return {
        causa: "tempo",
        titolo: "Jarvis non ha risposto in tempo.",
        spiegazione: `Gemini ci ha messo più di un minuto. ${ANCORA_QUI}`,
        pulsante: "Riprova",
      };
    case "offline":
      return {
        causa: "offline",
        titolo: "Home Assistant non raggiungibile.",
        spiegazione: "Quando torna la connessione puoi riprovare.",
        pulsante: "Riprova",
      };
    case "agente":
      break;
  }
  const causa = causaDaDettaglio(errore.dettaglio);
  const testi: Record<typeof causa, [string, string]> = {
    quota: ["Gemini ha raggiunto il limite di richieste.", `Riprova tra un minuto. ${ANCORA_QUI}`],
    occupato: ["Gemini è occupato in questo momento.", `Riprova tra un minuto. ${ANCORA_QUI}`],
    gemini: [
      "Gemini non ha risposto.",
      `Può essere occupato o aver raggiunto il limite di richieste: riprova tra un minuto. ${ANCORA_QUI}`,
    ],
    altro: ["Jarvis non è riuscito a rispondere.", `Home Assistant ha dato un errore. ${ANCORA_QUI}`],
  };
  const [titolo, spiegazione] = testi[causa];
  return { causa, titolo, spiegazione, pulsante: "Riprova" };
}
