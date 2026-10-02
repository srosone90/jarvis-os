/**
 * «Jarvis, stop» mentre suona un timer (v0.5.0, scelta di Salvatore del 30/09):
 * la parola zittisce subito la suoneria, poi il testo trascritto da HA decide.
 * Se dopo aver tolto la parola e i riempitivi restano SOLO parole di arresto
 * ("stop", "basta", "ferma"…), il timer si chiude; altrimenti è una domanda.
 *
 * Conservativo apposta: "spegni la TV" non è uno stop (resta "tv"), "basta
 * così grazie" sì. Meglio una domanda in più a Gemini che un timer chiuso
 * per sbaglio.
 */
const ARRESTO = new Set([
  "stop",
  "basta",
  "ferma",
  "fermati",
  "fermalo",
  "fermala",
  "spegni",
  "spegnilo",
  "spegnila",
  "zitto",
  "zitta",
  "silenzio",
  "stoppa",
]);

/** Parole che non cambiano il senso: la parola stessa, saluti, cortesie, articoli. */
const RIEMPITIVI = new Set([
  "jarvis",
  "giarvis",
  "ehi",
  "hey",
  "ei",
  "ok",
  "okay",
  "ora",
  "adesso",
  "subito",
  "pure",
  "cosi",
  "grazie",
  "per",
  "favore",
  "il",
  "lo",
  "la",
  "i",
  "le",
  "timer",
  "suoneria",
  "sveglia",
  "allarme",
]);

/** Testo in parole semplici: minuscolo, senza accenti né punteggiatura. */
function paroleDi(testo: string): string[] {
  return testo
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function eComandoStop(testo: string, parola = "Jarvis"): boolean {
  const proprie = new Set(paroleDi(parola));
  const resto = paroleDi(testo).filter((p) => !RIEMPITIVI.has(p) && !proprie.has(p));
  return resto.length > 0 && resto.every((p) => ARRESTO.has(p));
}
