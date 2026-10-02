/**
 * Esporta e importa le impostazioni di questo pannello (v0.5.10, punto 6 del
 * piano del 01/10): un file JSON da portare su un altro tablet o telefono, o
 * da tenere da parte prima di cambiare tutto.
 *
 * Dentro vanno SOLO le preferenze, chiave per chiave da un elenco chiuso.
 * Fuori, sempre: il token di Home Assistant (`jarvis-token`), il registro
 * (`jarvis-log`), le interruzioni della connessione, la stanza del pannello
 * (ogni pannello ha la sua), lo stato della guida e degli aggiornamenti.
 * All'import vale lo stesso elenco: un file con dentro una chiave che non è
 * nell'elenco (anche `jarvis-token`) quella chiave la scarta. Ogni modulo
 * rilegge e ripulisce i suoi valori all'avvio (`leggiPreferenze…`), quindi
 * un valore sbagliato torna a quello di serie, mai un pannello rotto.
 */

/** Chiave → cosa contiene, nell'ordine in cui si mostrano. */
export const CHIAVI_COPIABILI: readonly (readonly [string, string])[] = [
  ["jarvis-navigazione", "Colonna e schermata iniziale"],
  ["jarvis-schermate", "Timer, Clima, Scene, Spesa, Avvisi"],
  ["jarvis-meteo", "Meteo"],
  ["jarvis-storico", "Grafico della stanza"],
  ["jarvis-musica", "Musica (mini‑lettore, stanze, preferite)"],
  ["jarvis-voce", "Voce (riascolto, parlato, riquadro)"],
  ["jarvis-parola", "«Jarvis» sempre in ascolto"],
  ["jarvis-microfono", "Elaborazione del microfono"],
  ["jarvis-annunci", "Annunci sul pannello"],
  ["jarvis-riposo", "Schermo a riposo"],
  ["jarvis-audio-sveglio", "Audio sveglio"],
];

/** Mai nel file, qualunque cosa succeda all'elenco sopra (controllo in più nelle prove). */
export const CHIAVI_MAI = [
  "jarvis-token",
  "jarvis-log",
  "jarvis-interruzioni",
  "jarvis-stanza-pannello",
  "jarvis-guida",
] as const;

export const FORMATO = "jarvis-impostazioni";
/** Un file di impostazioni vero è di pochi KB: oltre questo non è un file nostro. */
export const DIMENSIONE_MASSIMA = 200_000;

export interface FileImpostazioni {
  formato: typeof FORMATO;
  /** Versione del pannello che l'ha scritto. */
  versione: string;
  /** ISO 8601. */
  data: string;
  impostazioni: Record<string, string>;
}

type Archivio = Pick<Storage, "getItem" | "setItem">;

const copiabile = (k: string): boolean =>
  CHIAVI_COPIABILI.some(([c]) => c === k) && !(CHIAVI_MAI as readonly string[]).includes(k);

/** Le preferenze di questo pannello, così come sono salvate (solo quelle cambiate ci sono). */
export function esporta(archivio: Archivio, versione: string, adesso: Date = new Date()): FileImpostazioni {
  const impostazioni: Record<string, string> = {};
  for (const [chiave] of CHIAVI_COPIABILI) {
    if (!copiabile(chiave)) continue;
    const v = archivio.getItem(chiave);
    if (v !== null) impostazioni[chiave] = v;
  }
  return { formato: FORMATO, versione, data: adesso.toISOString(), impostazioni };
}

export type EsitoLettura =
  { ok: true; file: FileImpostazioni; scartate: string[] } | { ok: false; errore: string };

/** Legge un file scelto dalla persona: niente di quello che c'è dentro si fida. */
export function leggiFile(testo: string): EsitoLettura {
  if (testo.length > DIMENSIONE_MASSIMA)
    return { ok: false, errore: "Il file è troppo grande per essere un file di impostazioni di Jarvis." };
  let d: unknown;
  try {
    d = JSON.parse(testo);
  } catch {
    return { ok: false, errore: "Il file non si legge: non è un file di impostazioni di Jarvis (JSON)." };
  }
  if (typeof d !== "object" || d === null || (d as Record<string, unknown>)["formato"] !== FORMATO)
    return {
      ok: false,
      errore: "Non è un file di impostazioni di Jarvis (esportalo da Impostazioni → Copia).",
    };
  const grezzo = d as Record<string, unknown>;
  const dentro = grezzo["impostazioni"];
  if (typeof dentro !== "object" || dentro === null || Array.isArray(dentro))
    return { ok: false, errore: "Nel file non ci sono impostazioni." };
  const impostazioni: Record<string, string> = {};
  const scartate: string[] = [];
  for (const [k, v] of Object.entries(dentro as Record<string, unknown>)) {
    if (copiabile(k) && typeof v === "string") impostazioni[k] = v;
    else scartate.push(k);
  }
  if (!Object.keys(impostazioni).length && !scartate.length)
    return { ok: false, errore: "Il file è vuoto: su quel pannello era tutto di serie." };
  return {
    ok: true,
    file: {
      formato: FORMATO,
      versione: typeof grezzo["versione"] === "string" ? grezzo["versione"] : "?",
      data: typeof grezzo["data"] === "string" ? grezzo["data"] : "",
      impostazioni,
    },
    scartate,
  };
}

/** Le chiavi scartate, in parole (mai i nomi tecnici davanti alle persone). */
export function descriviScartate(scartate: readonly string[]): string {
  const parti: string[] = [];
  if (scartate.includes("jarvis-token")) parti.push("il collegamento a Home Assistant");
  if (scartate.includes("jarvis-stanza-pannello")) parti.push("la stanza del pannello");
  if (scartate.some((k) => k === "jarvis-log" || k === "jarvis-interruzioni")) parti.push("il registro");
  const altre = scartate.filter(
    (k) => !["jarvis-token", "jarvis-stanza-pannello", "jarvis-log", "jarvis-interruzioni"].includes(k),
  ).length;
  if (altre)
    parti.push(
      altre === 1
        ? "1 voce che non è un'impostazione da copiare"
        : `${altre} voci che non sono impostazioni da copiare`,
    );
  return parti.join(", ");
}

/** Che cosa cambierebbe su questo pannello (per la conferma prima di importare). */
export function cosaCambia(file: FileImpostazioni, archivio: Archivio): { chiave: string; titolo: string }[] {
  return CHIAVI_COPIABILI.filter(
    ([k]) => k in file.impostazioni && archivio.getItem(k) !== file.impostazioni[k],
  ).map(([chiave, titolo]) => ({ chiave, titolo }));
}

/**
 * Scrive le impostazioni del file. Le preferenze NON nel file restano come
 * sono (si importa quello che l'altro pannello aveva cambiato, il resto no).
 * Valgono dopo il ricaricamento, che fa chi chiama.
 */
export function importa(file: FileImpostazioni, archivio: Archivio): number {
  let scritte = 0;
  for (const [k, v] of Object.entries(file.impostazioni)) {
    if (!copiabile(k)) continue;
    archivio.setItem(k, v);
    scritte += 1;
  }
  return scritte;
}

/** Nome del file: «jarvis-impostazioni-cucina-2026-10-02.json». */
export function nomeFile(stanza: string | null, adesso: Date = new Date()): string {
  const s = (stanza ?? "pannello")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const giorno = adesso.toISOString().slice(0, 10);
  return `jarvis-impostazioni-${s || "pannello"}-${giorno}.json`;
}
