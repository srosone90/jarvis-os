import { mdiExitRun, mdiHomeImportOutline, mdiPaletteOutline, mdiWeatherNight } from "@mdi/js";
import type { HassEntities } from "home-assistant-js-websocket";
import { dominio } from "../registri/modello";

/**
 * Scene (v0.5.7, mockup N2 "5 · Scene"; F3 del 26/09): si attivano con un
 * tocco, dalla schermata Scene e dai tre pulsanti della Casa. Sono gli script
 * (o le scene) di Home Assistant scelti in Impostazioni → Schermate; di serie
 * i tre del pacchetto `jarvis.yaml`. Creare routine dal pannello NO (scrive
 * automazioni in HA: deciso nel mockup).
 *
 * Le descrizioni dicono quello che lo script fa DAVVERO oggi (pacchetto
 * jarvis.yaml): per esempio la modalità notte del pannello con Buonanotte
 * arriverà con la F6, quindi qui non c'è.
 */
export interface Scena {
  entita: string;
  nome: string;
  descrizione: string | null;
  colore: string;
  icona: string;
  /** L'entità esiste in Home Assistant. */
  esiste: boolean;
  /** Script in esecuzione adesso (stato "on"). */
  inCorso: boolean;
}

/** Colori d'accento delle tre scene (mockup approvato del 26/09). */
const NOTE: Record<
  string,
  { nome: string; colore: string; icona: string; descrizione: (s: HassEntities) => string }
> = {
  "script.jarvis_buonanotte": {
    nome: "Buonanotte",
    colore: "#8b7cf6",
    icona: mdiWeatherNight,
    descrizione: () => "Spegne la TV del salotto. La TV della camera non si tocca (infrarossi).",
  },
  "script.jarvis_esco": {
    nome: "Esco",
    colore: "#3ec9a7",
    icona: mdiExitRun,
    descrizione: () => "Spegne TV del salotto e condizionatore, e manda al telefono cosa resta acceso.",
  },
  "script.jarvis_rientro": {
    nome: "Rientro",
    colore: "#e0a33a",
    icona: mdiHomeImportOutline,
    descrizione: (s) => {
      const caldo = Number(s["input_number.jarvis_clima_soglia_caldo"]?.state);
      const freddo = Number(s["input_number.jarvis_clima_soglia_freddo"]?.state);
      const soglie =
        Number.isFinite(caldo) && Number.isFinite(freddo)
          ? `: raffresca sopra ${caldo.toLocaleString("it-IT")}°, riscalda sotto ${freddo.toLocaleString("it-IT")}°`
          : "";
      return `Condizionatore della camera secondo la temperatura percepita${soglie}.`;
    },
  },
};

/** Per le scene scelte a mano: colori diversi, in ordine. */
const ALTRI_COLORI = ["#5b8def", "#e06c9f", "#7bc96f", "#d9825b", "#4fb3d9", "#c9b458"];

/** "Jarvis · Esco" → "Esco"; senza nome, dall'entità: "script.cena_fuori" → "Cena fuori". */
export function nomeScena(entita: string, nomeHa: unknown): string {
  if (typeof nomeHa === "string" && nomeHa.trim())
    return nomeHa.replace(/^\s*jarvis\s*[·\-–:]\s*/i, "").trim();
  const id = entita.slice(entita.indexOf(".") + 1).replace(/_/g, " ");
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function sceneDa(elenco: readonly string[], stati: HassEntities): Scena[] {
  let altri = 0;
  return elenco.map((entita) => {
    const s = stati[entita];
    const nota = NOTE[entita];
    const colore = nota?.colore ?? ALTRI_COLORI[altri++ % ALTRI_COLORI.length] ?? "#5b8def";
    return {
      entita,
      nome: nota?.nome ?? nomeScena(entita, s?.attributes["friendly_name"]),
      descrizione: nota?.descrizione(stati) ?? null,
      colore,
      icona: nota?.icona ?? mdiPaletteOutline,
      esiste: s !== undefined,
      inCorso: dominio(entita) === "script" && s?.state === "on",
    };
  });
}

/** Il servizio che attiva la scena: `script.turn_on` o `scene.turn_on`. */
export function servizioScena(entita: string): { dominio: "script" | "scene"; servizio: "turn_on" } {
  return { dominio: dominio(entita) === "scene" ? "scene" : "script", servizio: "turn_on" };
}
