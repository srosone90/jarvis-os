import type { DescrizioneModello } from "./rilevatore";

/**
 * Impostazioni della parola da un file accanto alla pagina (`parola.json`),
 * così modello, soglie e verificatore condiviso si cambiano SENZA una nuova
 * release: il file non è nello zip, quindi un aggiornamento non lo tocca
 * (requisito multi-casa: ogni casa il suo). Se manca si usano i valori
 * predefiniti; se è scritto male lo si dice e si usano i predefiniti.
 *
 * Esempio:
 *   {
 *     "modello": { "id": "jarvis_it_v1", "url": "./modelli-casa/jarvis_it_v1.onnx",
 *                  "parola": "Jarvis", "licenza": "…", "commerciale": false },
 *     "soglia": 0.5,
 *     "sogliaBase": 0.1,
 *     "verificatore": "./modelli-casa/verificatore-casa.json"
 *   }
 */
export interface ImpostazioniParola {
  modello?: DescrizioneModello & { url: string };
  soglia?: number;
  sogliaBase?: number;
  verificatore?: string;
}

const tra0e1 = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1;

/** Controlla il contenuto del file: tiene solo ciò che è valido e dice cosa ha scartato. */
export function leggiImpostazioni(dati: unknown): { impostazioni: ImpostazioniParola; avvisi: string[] } {
  const avvisi: string[] = [];
  const impostazioni: ImpostazioniParola = {};
  if (typeof dati !== "object" || dati === null || Array.isArray(dati))
    return { impostazioni, avvisi: ["il file non contiene un oggetto JSON"] };
  const d = dati as Record<string, unknown>;
  if (d["modello"] !== undefined) {
    const m = d["modello"] as Record<string, unknown> | null;
    if (
      m &&
      typeof m["id"] === "string" &&
      typeof m["url"] === "string" &&
      typeof m["parola"] === "string" &&
      typeof m["licenza"] === "string" &&
      typeof m["commerciale"] === "boolean"
    )
      impostazioni.modello = {
        id: m["id"],
        url: m["url"],
        parola: m["parola"],
        licenza: m["licenza"],
        commerciale: m["commerciale"],
      };
    else avvisi.push("«modello» ignorato: servono id, url, parola, licenza (testi) e commerciale (sì/no)");
  }
  for (const chiave of ["soglia", "sogliaBase"] as const) {
    if (d[chiave] === undefined) continue;
    if (tra0e1(d[chiave])) impostazioni[chiave] = d[chiave];
    else avvisi.push(`«${chiave}» ignorata: deve essere un numero tra 0 e 1`);
  }
  if (d["verificatore"] !== undefined) {
    if (typeof d["verificatore"] === "string") impostazioni.verificatore = d["verificatore"];
    else avvisi.push("«verificatore» ignorato: deve essere un indirizzo (testo)");
  }
  const note = Object.keys(d).filter((k) => !["modello", "soglia", "sogliaBase", "verificatore"].includes(k));
  if (note.length) avvisi.push(`chiavi sconosciute ignorate: ${note.join(", ")}`);
  return { impostazioni, avvisi };
}

export async function caricaImpostazioni(
  url = "./parola.json",
): Promise<{ impostazioni: ImpostazioniParola; trovato: boolean; avvisi: string[] }> {
  let risposta: Response;
  try {
    risposta = await fetch(url, { cache: "no-store" });
  } catch (errore) {
    return { impostazioni: {}, trovato: false, avvisi: [`impostazioni non lette: ${String(errore)}`] };
  }
  if (risposta.status === 404) return { impostazioni: {}, trovato: false, avvisi: [] };
  if (!risposta.ok)
    return { impostazioni: {}, trovato: false, avvisi: [`${url}: il server ha risposto ${risposta.status}`] };
  try {
    return { ...leggiImpostazioni(await risposta.json()), trovato: true };
  } catch {
    return {
      impostazioni: {},
      trovato: true,
      avvisi: [`${url} non è un JSON valido: uso i valori predefiniti`],
    };
  }
}
