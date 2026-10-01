import type { Assistente } from "./assistente";
import { messaggioErrore } from "./messaggi";

/**
 * Manda a Jarvis una frase come se la si dicesse (i pulsanti della schermata
 * Timer, v0.5.7) e aspetta che il turno finisca. Il turno resta nella chat,
 * come ogni domanda: è una domanda vera, con il device_id di questo pannello.
 * Ritorna l'errore in parole, o null se Jarvis ha risposto.
 */
export function chiediEAspetta(
  assistente: Pick<Assistente, "chiedi" | "occupato" | "turni" | "turno" | "ascolta">,
  frase: string,
  attesaMs = 60_000,
): Promise<string | null> {
  if (!assistente.chiedi(frase))
    return Promise.resolve(
      assistente.occupato
        ? "Jarvis sta già rispondendo: riprova tra poco."
        : "Home Assistant non è collegato.",
    );
  const id = assistente.turni.at(-1)?.id;
  if (id === undefined) return Promise.resolve(null);
  return new Promise((risolvi) => {
    let smetti: () => void = () => undefined;
    const fine = (esito: string | null): void => {
      clearTimeout(scadenza);
      smetti();
      risolvi(esito);
    };
    // oltre l'attesa massima dell'assistente: il turno si è perso (conversazione ricominciata)
    const scadenza = setTimeout(() => fine(null), attesaMs);
    const controlla = (): void => {
      const t = assistente.turno(id);
      if (!t) return fine(null);
      if (!t.concluso) return;
      fine(t.errore ? messaggioErrore(t.errore).titolo : null);
    };
    smetti = assistente.ascolta(controlla);
    controlla();
  });
}
