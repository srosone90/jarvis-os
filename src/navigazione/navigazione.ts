import { descriviErrore, log } from "../diagnostica";

/**
 * Navigazione N2 (mockup approvato il 30/09, docs/mockup-navigazione.html):
 * colonna stretta a sinistra con le schermate principali, in fondo l'Hub.
 * Regole del mockup: tocco su un riquadro → la sua schermata; Indietro di
 * Android; `#nome` nell'indirizzo; al massimo 2 livelli; senza tocchi si torna
 * alla schermata iniziale (poi il riposo fa il resto).
 *
 * v0.5.7: tutte le schermate del mockup. Ognuna sta nella colonna, solo in
 * «Altro» o è spenta (Impostazioni → Schermate). Casa e Altro stanno sempre
 * nella colonna: da Casa si aprono le impostazioni tenendo premuto l'orologio,
 * da Altro si arriva a tutto il resto (impostazioni comprese). La Stanza
 * (secondo livello) si apre toccando una stanza.
 *
 * Logica pura + preferenze; la cronologia del browser la tiene `Navigatore`.
 */
export type Principale =
  "casa" | "musica" | "meteo" | "timer" | "clima" | "scene" | "spesa" | "avvisi" | "altro";
type Pagina = { tipo: Principale } | { tipo: "stanza"; area: string };

export const PRINCIPALI: readonly { id: Principale; titolo: string }[] = [
  { id: "casa", titolo: "Casa" },
  { id: "musica", titolo: "Musica" },
  { id: "meteo", titolo: "Meteo" },
  { id: "timer", titolo: "Timer" },
  { id: "clima", titolo: "Clima" },
  { id: "scene", titolo: "Scene" },
  { id: "spesa", titolo: "Spesa" },
  { id: "avvisi", titolo: "Avvisi" },
  { id: "altro", titolo: "Altro" },
];

/** Sempre nella colonna: Casa (l'orologio apre le impostazioni) e Altro (porta a tutto il resto). */
export const FISSE: readonly Principale[] = ["casa", "altro"];

/** Dove sta una schermata: nella colonna, solo in «Altro», o da nessuna parte. */
export type Dove = "colonna" | "altro" | "spenta";

/** Di serie, come nel mockup N2: Casa, Musica, Meteo, Timer, Altro; il resto in Altro. */
const DOVE_DI_SERIE: Record<Principale, Dove> = {
  casa: "colonna",
  musica: "colonna",
  meteo: "colonna",
  timer: "colonna",
  clima: "altro",
  scene: "altro",
  spesa: "altro",
  avvisi: "altro",
  altro: "colonna",
};

export const titoloDi = (id: Principale): string => PRINCIPALI.find((p) => p.id === id)?.titolo ?? id;

export function hashDi(p: Pagina): string {
  return p.tipo === "stanza"
    ? `#stanza/${encodeURIComponent(p.area)}`
    : p.tipo === "casa"
      ? ""
      : `#${p.tipo}`;
}

/** `#meteo`, `#stanza/camera_da_letto` → pagina; tutto il resto → null (si resta dove si è). */
export function paginaDaHash(hash: string): Pagina | null {
  const h = hash.replace(/^#/, "");
  if (h === "" || h === "casa") return { tipo: "casa" };
  if (PRINCIPALI.some((p) => p.id === h)) return { tipo: h as Principale };
  const m = /^stanza\/(.+)$/.exec(h);
  if (m?.[1]) {
    try {
      return { tipo: "stanza", area: decodeURIComponent(m[1]) };
    } catch {
      return null;
    }
  }
  return null;
}

const ugualePagina = (a: Pagina, b: Pagina): boolean => hashDi(a) === hashDi(b);

// --- preferenze ------------------------------------------------------------

interface VoceColonna {
  id: Principale;
  dove: Dove;
}

interface PreferenzeNavigazione {
  /** Ordine delle schermate e dove sta ognuna (Casa e Altro sempre nella colonna). */
  voci: VoceColonna[];
  /** Schermata con cui si apre il pannello e a cui si torna senza tocchi (mai una spenta). */
  iniziale: Principale;
  /** Dopo quanti secondi senza tocchi si torna alla schermata iniziale (0 = mai). */
  ritornoSecondi: number;
}

export const PREFERENZE_NAVIGAZIONE_DI_SERIE: PreferenzeNavigazione = {
  voci: PRINCIPALI.map((p) => ({ id: p.id, dove: DOVE_DI_SERIE[p.id] })),
  iniziale: "casa",
  ritornoSecondi: 90,
};
export const LIMITI_NAVIGAZIONE = { ritornoSecondi: [0, 900] } as const;
const CHIAVE = "jarvis-navigazione";

const eDove = (v: unknown): v is Dove => v === "colonna" || v === "altro" || v === "spenta";

export function leggiPreferenzeNavigazione(grezzo: string | null): PreferenzeNavigazione {
  const p: PreferenzeNavigazione = {
    ...PREFERENZE_NAVIGAZIONE_DI_SERIE,
    voci: PREFERENZE_NAVIGAZIONE_DI_SERIE.voci.map((v) => ({ ...v })),
  };
  if (grezzo === null) return p;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
  } catch {
    return p;
  }
  if (Array.isArray(d["voci"])) {
    // le voci salvate nell'ordine salvato, poi quelle nuove (arrivate con una versione dopo)
    const viste = new Set<string>();
    const voci: VoceColonna[] = [];
    for (const v of d["voci"] as unknown[]) {
      const x = v as { id?: unknown; dove?: unknown; visibile?: unknown };
      if (typeof x.id !== "string" || viste.has(x.id) || !PRINCIPALI.some((q) => q.id === x.id)) continue;
      const id = x.id as Principale;
      viste.add(id);
      // fino alla v0.5.6 c'era `visibile`: una voce tolta dalla colonna ora sta in Altro
      const dove: Dove = FISSE.includes(id)
        ? "colonna"
        : eDove(x.dove)
          ? x.dove
          : typeof x.visibile === "boolean"
            ? x.visibile
              ? "colonna"
              : "altro"
            : DOVE_DI_SERIE[id];
      voci.push({ id, dove });
    }
    // una schermata nuova arriva dove sta di serie (Timer nella colonna, Spesa in Altro…)
    for (const q of PRINCIPALI) if (!viste.has(q.id)) voci.push({ id: q.id, dove: DOVE_DI_SERIE[q.id] });
    p.voci = voci;
  }
  if (typeof d["iniziale"] === "string" && PRINCIPALI.some((q) => q.id === d["iniziale"]))
    p.iniziale = d["iniziale"] as Principale;
  // la schermata iniziale non può essere spenta
  if (p.voci.find((v) => v.id === p.iniziale)?.dove === "spenta") p.iniziale = "casa";
  const r = d["ritornoSecondi"];
  if (typeof r === "number" && Number.isFinite(r))
    p.ritornoSecondi = Math.round(Math.min(LIMITI_NAVIGAZIONE.ritornoSecondi[1], Math.max(0, r)));
  return p;
}

/** Sposta una voce di un posto (−1 su, +1 giù). */
export function spostaVoce(voci: readonly VoceColonna[], id: Principale, verso: -1 | 1): VoceColonna[] {
  const i = voci.findIndex((v) => v.id === id);
  const j = i + verso;
  if (i < 0 || j < 0 || j >= voci.length) return [...voci];
  const nuove = [...voci];
  const a = nuove[i];
  const b = nuove[j];
  if (!a || !b) return nuove;
  nuove[i] = b;
  nuove[j] = a;
  return nuove;
}

/** Cambia dove sta una schermata (Casa e Altro restano nella colonna). */
export function cambiaDove(voci: readonly VoceColonna[], id: Principale, dove: Dove): VoceColonna[] {
  return voci.map((v) => (v.id === id && !FISSE.includes(id) ? { ...v, dove } : { ...v }));
}

// --- stato della navigazione -------------------------------------------------

interface DipendenzeNavigatore {
  adesso?: () => number;
  archivio?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Cronologia del browser (Indietro di Android). Null nelle prove. */
  cronologia?: Pick<History, "pushState" | "replaceState" | "back"> | null;
  posizione?: () => string;
}

export class Navigatore {
  private attuale: Pagina = { tipo: "casa" };
  private pref: PreferenzeNavigazione;
  private ultimaAttivita: number;
  private readonly adesso: () => number;
  private readonly ascoltatori = new Set<() => void>();

  constructor(private readonly dip: DipendenzeNavigatore = {}) {
    this.adesso = dip.adesso ?? Date.now;
    this.ultimaAttivita = this.adesso();
    let letto: string | null = null;
    try {
      letto =
        dip.archivio === undefined
          ? typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(CHIAVE)
          : (dip.archivio?.getItem(CHIAVE) ?? null);
    } catch (errore) {
      log.avviso(`Navigazione: preferenze non lette (${descriviErrore(errore)}): valori di serie`);
    }
    this.pref = leggiPreferenzeNavigazione(letto);
    // l'indirizzo vince (un segnalibro su #meteo), altrimenti la schermata iniziale
    const daIndirizzo = this.accesa(paginaDaHash(dip.posizione?.() ?? ""));
    this.attuale = daIndirizzo && daIndirizzo.tipo !== "casa" ? daIndirizzo : { tipo: this.pref.iniziale };
  }

  get pagina(): Pagina {
    return this.attuale;
  }
  get preferenze(): PreferenzeNavigazione {
    return { ...this.pref, voci: this.pref.voci.map((v) => ({ ...v })) };
  }
  /** Le voci della colonna, nell'ordine scelto. */
  get colonna(): readonly { id: Principale; titolo: string }[] {
    return this.pref.voci
      .filter((v) => v.dove === "colonna")
      .map((v) => ({ id: v.id, titolo: titoloDi(v.id) }));
  }
  /** Le schermate di «Altro»: tutte quelle accese tranne Altro stessa, nell'ordine scelto. */
  get altro(): readonly { id: Principale; titolo: string }[] {
    return this.pref.voci
      .filter((v) => v.dove !== "spenta" && v.id !== "altro")
      .map((v) => ({ id: v.id, titolo: titoloDi(v.id) }));
  }
  /** La principale evidenziata nella colonna (per la Stanza: Casa). */
  get principale(): Principale {
    return this.attuale.tipo === "stanza" ? "casa" : this.attuale.tipo;
  }

  /** Una schermata spenta non si apre (nemmeno da un vecchio segnalibro). */
  esiste(id: Principale): boolean {
    return this.pref.voci.find((v) => v.id === id)?.dove !== "spenta";
  }

  private accesa(p: Pagina | null): Pagina | null {
    if (p && p.tipo !== "stanza" && !this.esiste(p.tipo)) return { tipo: "casa" };
    return p;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /**
   * Va a una pagina. Le principali si sostituiscono nella cronologia (non si
   * accumulano: Indietro non ripercorre ogni tocco della colonna); la Stanza è
   * un secondo livello, quindi aggiunge una voce: Indietro torna a Casa.
   */
  vai(richiesta: Pagina, motivo = ""): void {
    this.attivita();
    const p = this.accesa(richiesta) ?? { tipo: "casa" };
    if (ugualePagina(p, this.attuale)) return;
    const daStanza = this.attuale.tipo === "stanza";
    this.attuale = p;
    const url = hashDi(p) || location.pathname + location.search;
    try {
      if (p.tipo === "stanza" && !daStanza) this.dip.cronologia?.pushState({ jarvis: "pagina" }, "", url);
      else this.dip.cronologia?.replaceState(history.state, "", url);
    } catch (errore) {
      log.avviso(`Navigazione: indirizzo non aggiornato (${descriviErrore(errore)})`);
    }
    log.info(`Schermata: ${hashDi(p) || "#casa"}${motivo ? ` (${motivo})` : ""}`);
    this.notifica();
  }

  /** L'indirizzo è cambiato da fuori (Indietro, #meteo scritto a mano). */
  suIndirizzo(hash: string): void {
    const p = this.accesa(paginaDaHash(hash));
    if (!p || ugualePagina(p, this.attuale)) return;
    this.attuale = p;
    this.notifica();
  }

  attivita(): void {
    this.ultimaAttivita = this.adesso();
  }

  /** Da chiamare ogni tanto: senza tocchi si torna alla schermata iniziale. */
  controlla(): void {
    const s = this.pref.ritornoSecondi;
    if (s <= 0 || ugualePagina(this.attuale, { tipo: this.pref.iniziale })) return;
    if (this.adesso() - this.ultimaAttivita < s * 1000) return;
    this.vai({ tipo: this.pref.iniziale }, `${s} s senza tocchi`);
  }

  /** `null` = valore di serie. */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeNavigazione]?: PreferenzeNavigazione[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi))
      unito[k] = v === null ? PREFERENZE_NAVIGAZIONE_DI_SERIE[k as keyof PreferenzeNavigazione] : v;
    this.pref = leggiPreferenzeNavigazione(JSON.stringify(unito));
    try {
      (this.dip.archivio === undefined ? localStorage : this.dip.archivio)?.setItem(
        CHIAVE,
        JSON.stringify(this.pref),
      );
    } catch (errore) {
      log.avviso(
        `Navigazione: preferenze non salvate (${descriviErrore(errore)}): valgono fino alla ricarica`,
      );
    }
    const dove = (d: Dove) =>
      this.pref.voci
        .filter((v) => v.dove === d)
        .map((v) => titoloDi(v.id))
        .join(", ") || "nessuna";
    log.info(
      `Navigazione: colonna ${dove("colonna")}; in Altro ${dove("altro")}; spente ${dove("spenta")}; ` +
        `iniziale ${this.pref.iniziale}; ` +
        `ritorno ${this.pref.ritornoSecondi ? `dopo ${this.pref.ritornoSecondi} s` : "mai"}`,
    );
    // la schermata aperta è stata spenta: si torna a Casa
    if (this.attuale.tipo !== "stanza" && !this.esiste(this.attuale.tipo)) {
      this.vai({ tipo: "casa" }, "schermata spenta");
      return;
    }
    this.notifica();
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Navigazione: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
