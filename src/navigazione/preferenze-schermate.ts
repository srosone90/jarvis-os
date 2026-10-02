import { limitaIntero } from "../comune";
import { descriviErrore, log } from "../diagnostica";

/**
 * Cosa mostrano le schermate della v0.5.7 (Timer, Clima, Scene, Spesa,
 * Avvisi), più il timer a tutto schermo (v0.6.2): preferenze di questo pannello, ognuna col suo valore di serie e
 * «Ripristina» in Impostazioni → Schermate.
 */
interface PreferenzeSchermate {
  /** Minuti dei pulsanti «nuovo timer», in ordine. Vuoto = nessun pulsante. */
  timerDurate: number[];
  /** v0.6.2: con un timer attivo, il timer copre tutto lo schermo quando nessuno tocca. */
  timerPieno: boolean;
  /** v0.6.2: dopo quanti secondi senza tocchi il timer torna a tutto schermo. */
  timerPienoSecondi: number;
  /** Ore del grafico delle temperature. */
  climaOre: number;
  /** Consumi di corrente, se in casa c'è un sensore (potenza o energia). */
  climaConsumi: boolean;
  /** Le scene, in ordine: script.* o scene.* di Home Assistant. */
  scene: string[];
  /** v0.5.8: prima di avviare una scena chiede un secondo tocco. */
  sceneConferma: boolean;
  /** v0.5.10: entro quanti secondi il secondo tocco conferma. */
  sceneConfermaSecondi: number;
  /** La lista della spesa di Home Assistant (un'entità todo). */
  spesaLista: string;
  /** Anche le cose già prese, barrate in fondo. */
  spesaPresi: boolean;
  /** Ore di eventi dei dispositivi (registro di Home Assistant). */
  avvisiOre: number;
  /** Sotto questa percentuale una batteria è un avviso. */
  avvisiSogliaBatteria: number;
}

export const PREFERENZE_SCHERMATE_DI_SERIE: PreferenzeSchermate = {
  timerDurate: [1, 3, 5, 10, 15, 30],
  timerPieno: true,
  timerPienoSecondi: 15,
  climaOre: 24,
  climaConsumi: true,
  scene: ["script.jarvis_buonanotte", "script.jarvis_esco", "script.jarvis_rientro"],
  sceneConferma: false,
  sceneConfermaSecondi: 4,
  spesaLista: "todo.shopping_list",
  spesaPresi: true,
  avvisiOre: 24,
  avvisiSogliaBatteria: 20,
};

export const LIMITI_SCHERMATE = {
  durata: [1, 720],
  quanteDurate: 8,
  timerPienoSecondi: [5, 120],
  climaOre: [6, 72],
  avvisiOre: [1, 72],
  avvisiSogliaBatteria: [5, 50],
  sceneConfermaSecondi: [2, 10],
} as const;

const CHIAVE = "jarvis-schermate";
const ENTITA_SCENA = /^(script|scene)\.[a-z0-9_]+$/;
const ENTITA_LISTA = /^todo\.[a-z0-9_]+$/;

const numeroValido = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "1, 3, 5,10" → [1, 3, 5, 10]: numeri interi nei limiti, senza doppioni, in ordine. */
export function durateDa(v: unknown): number[] {
  // "" non è 0: un campo vuoto vuol dire nessun pulsante
  const grezzi =
    typeof v === "string"
      ? v
          .split(/[,;\s]+/)
          .filter((x) => x !== "")
          .map(Number)
      : v;
  if (!Array.isArray(grezzi)) return [];
  const numeri = grezzi.filter(numeroValido).map((n) => limitaIntero(n, LIMITI_SCHERMATE.durata));
  return [...new Set(numeri)].sort((a, b) => a - b).slice(0, LIMITI_SCHERMATE.quanteDurate);
}

/** "script.jarvis_esco, scene.cena" → solo entità di scene vere, senza doppioni, nell'ordine dato. */
export function sceneDa(v: unknown): string[] {
  const grezzi = typeof v === "string" ? v.split(/[,;\s]+/) : v;
  if (!Array.isArray(grezzi)) return [];
  const valide = grezzi
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => ENTITA_SCENA.test(x));
  return [...new Set(valide)];
}

export function leggiPreferenzeSchermate(grezzo: string | null): PreferenzeSchermate {
  const d0 = PREFERENZE_SCHERMATE_DI_SERIE;
  const p: PreferenzeSchermate = { ...d0, timerDurate: [...d0.timerDurate], scene: [...d0.scene] };
  if (grezzo === null) return p;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
  } catch {
    return p;
  }
  if (Array.isArray(d["timerDurate"])) p.timerDurate = durateDa(d["timerDurate"]);
  if (typeof d["timerPieno"] === "boolean") p.timerPieno = d["timerPieno"];
  if (numeroValido(d["timerPienoSecondi"]))
    p.timerPienoSecondi = limitaIntero(d["timerPienoSecondi"], LIMITI_SCHERMATE.timerPienoSecondi);
  if (numeroValido(d["climaOre"])) p.climaOre = limitaIntero(d["climaOre"], LIMITI_SCHERMATE.climaOre);
  if (typeof d["climaConsumi"] === "boolean") p.climaConsumi = d["climaConsumi"];
  if (Array.isArray(d["scene"])) p.scene = sceneDa(d["scene"]);
  if (typeof d["sceneConferma"] === "boolean") p.sceneConferma = d["sceneConferma"];
  if (numeroValido(d["sceneConfermaSecondi"]))
    p.sceneConfermaSecondi = limitaIntero(d["sceneConfermaSecondi"], LIMITI_SCHERMATE.sceneConfermaSecondi);
  if (typeof d["spesaLista"] === "string" && ENTITA_LISTA.test(d["spesaLista"].trim()))
    p.spesaLista = d["spesaLista"].trim();
  if (typeof d["spesaPresi"] === "boolean") p.spesaPresi = d["spesaPresi"];
  if (numeroValido(d["avvisiOre"])) p.avvisiOre = limitaIntero(d["avvisiOre"], LIMITI_SCHERMATE.avvisiOre);
  if (numeroValido(d["avvisiSogliaBatteria"]))
    p.avvisiSogliaBatteria = limitaIntero(d["avvisiSogliaBatteria"], LIMITI_SCHERMATE.avvisiSogliaBatteria);
  return p;
}

/** Le preferenze delle schermate, condivise da schermate e impostazioni (si aggiornano insieme). */
export class ImpostazioniSchermate {
  private pref: PreferenzeSchermate;
  private readonly ascoltatori = new Set<() => void>();

  constructor(
    private readonly archivio: Pick<Storage, "getItem" | "setItem"> | null | undefined = undefined,
  ) {
    let letto: string | null = null;
    try {
      letto =
        archivio === undefined
          ? typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(CHIAVE)
          : (archivio?.getItem(CHIAVE) ?? null);
    } catch (errore) {
      log.avviso(`Schermate: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    }
    this.pref = leggiPreferenzeSchermate(letto);
  }

  get valori(): PreferenzeSchermate {
    return { ...this.pref, timerDurate: [...this.pref.timerDurate], scene: [...this.pref.scene] };
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** `null` = valore di serie. */
  cambia(cambi: { [K in keyof PreferenzeSchermate]?: PreferenzeSchermate[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi))
      unito[k] = v === null ? PREFERENZE_SCHERMATE_DI_SERIE[k as keyof PreferenzeSchermate] : v;
    this.pref = leggiPreferenzeSchermate(JSON.stringify(unito));
    try {
      (this.archivio === undefined ? localStorage : this.archivio)?.setItem(
        CHIAVE,
        JSON.stringify(this.pref),
      );
    } catch (errore) {
      log.avviso(`Schermate: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`);
    }
    log.info(`Schermate: ${JSON.stringify(this.pref)}`);
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Schermate: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

export const schermate = new ImpostazioniSchermate();
