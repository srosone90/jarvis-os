import { descriviErrore, log } from "../diagnostica/log";

/**
 * Quale vista mostra il pannello (fase G, v0.4.8; scelte di Salvatore del 30/09
 * in CLAUDE.md): il pannello completo di sempre, lo schermo a riposo con la
 * sfera (variante C) e l'Hub con la sfera al centro (H1).
 *
 * Cambia SOLO cosa si disegna: connessione, timer, voce e musica restano accesi
 * (vincolo: il riposo non ferma nessun processo).
 *  - completo → riposo: dopo `attesaMin` senza tocchi (di serie 2 minuti), solo
 *    se niente è in corso (voce, risposta, impostazioni aperte, login);
 *  - riposo → Hub: tocco sulla sfera (e parte l'ascolto); tocco altrove → completo;
 *  - Hub → riposo: 30 s dopo l'ultima attività (tocco o voce finita);
 *  - Hub → completo: tasto "griglia".
 */
export type Vista = "completo" | "riposo" | "hub";
export type Momento = "mattina" | "giorno" | "sera" | "notte";

export interface ImpostazioniRiposo {
  /** Minuti senza tocchi prima del riposo; null = mai da solo. */
  attesaMin: number | null;
  /** Ora (0-23) in cui inizia e finisce la notte: luce al minimo, solo ora e timer. */
  notteDa: number;
  notteA: number;
}

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniRiposo = { attesaMin: 2, notteDa: 23, notteA: 7 };
export const ATTESE_POSSIBILI = [1, 2, 5, 10] as const;
/** Dall'Hub si torna al riposo dopo tanto senza attività. */
export const HUB_A_RIPOSO_MS = 30_000;
const CHIAVE = "jarvis-riposo";
const CONTROLLO_OGNI_MS = 1000;

/** Legge le impostazioni salvate; valori strani → quelli di serie (mai un pannello che non va a riposo per un errore). */
export function leggiImpostazioni(testo: string | null): ImpostazioniRiposo {
  if (!testo) return { ...IMPOSTAZIONI_PREDEFINITE };
  try {
    const d = JSON.parse(testo) as Partial<ImpostazioniRiposo>;
    const ora = (v: unknown, def: number): number =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : def;
    const attesa =
      d.attesaMin === null
        ? null
        : typeof d.attesaMin === "number" && d.attesaMin > 0 && d.attesaMin <= 60
          ? d.attesaMin
          : IMPOSTAZIONI_PREDEFINITE.attesaMin;
    return {
      attesaMin: attesa,
      notteDa: ora(d.notteDa, IMPOSTAZIONI_PREDEFINITE.notteDa),
      notteA: ora(d.notteA, IMPOSTAZIONI_PREDEFINITE.notteA),
    };
  } catch (errore) {
    log.avviso(`Impostazioni del riposo illeggibili, uso quelle di serie: ${descriviErrore(errore)}`);
    return { ...IMPOSTAZIONI_PREDEFINITE };
  }
}

/** È notte a quell'ora? La notte può scavalcare la mezzanotte (23 → 7). */
export function eNotte(ora: number, da: number, a: number): boolean {
  if (da === a) return false;
  return da < a ? ora >= da && ora < a : ora >= da || ora < a;
}

/** Momento del giorno per i colori del riposo: la notte decisa dall'utente vince sempre. */
export function momentoDi(adesso: Date, imp: ImpostazioniRiposo): Momento {
  const h = adesso.getHours();
  if (eNotte(h, imp.notteDa, imp.notteA)) return "notte";
  if (h >= 5 && h < 11) return "mattina";
  if (h >= 11 && h < 18) return "giorno";
  return "sera";
}

/** Dove andare adesso, se da qualche parte (funzione pura: la prova la usa da sola). */
export function prossimaVista(
  vista: Vista,
  adesso: number,
  ultimaAttivita: number,
  imp: ImpostazioniRiposo,
  puoRiposare: boolean,
): Vista | null {
  if (!puoRiposare) return null;
  if (vista === "completo" && imp.attesaMin !== null && adesso - ultimaAttivita >= imp.attesaMin * 60_000)
    return "riposo";
  if (vista === "hub" && adesso - ultimaAttivita >= HUB_A_RIPOSO_MS) return "riposo";
  return null;
}

export class ControlloVista {
  private attuale: Vista = "completo";
  private ultima: number;
  private imp: ImpostazioniRiposo;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly ascoltatori = new Set<() => void>();

  /**
   * `puoRiposare`: niente in corso che il riposo nasconderebbe (voce attiva,
   * risposta in arrivo, impostazioni, login, procedura guidata).
   */
  constructor(
    private readonly puoRiposare: () => boolean,
    private readonly adesso: () => number = Date.now,
    private readonly archivio: Pick<Storage, "getItem" | "setItem"> | null = sicuro(),
  ) {
    this.ultima = adesso();
    this.imp = leggiImpostazioni(this.leggi());
  }

  get vista(): Vista {
    return this.attuale;
  }
  get impostazioni(): ImpostazioniRiposo {
    return this.imp;
  }
  momento(data = new Date(this.adesso())): Momento {
    return momentoDi(data, this.imp);
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Tocchi e tasti su tutto il documento, e la fine di ogni attività della voce. */
  avvia(): void {
    const tocco = (): void => this.attivita();
    document.addEventListener("pointerdown", tocco, { capture: true, passive: true });
    document.addEventListener("keydown", tocco, { capture: true, passive: true });
    this.timer ??= setInterval(() => this.controlla(), CONTROLLO_OGNI_MS);
  }

  /** Qualcuno ha fatto qualcosa: il conto per il riposo riparte. */
  attivita(): void {
    this.ultima = this.adesso();
  }

  controlla(): void {
    const dove = prossimaVista(this.attuale, this.adesso(), this.ultima, this.imp, this.puoRiposare());
    if (dove) this.vai(dove, dove === "riposo" ? "nessun tocco" : "");
  }

  vai(vista: Vista, motivo = ""): void {
    this.attivita();
    if (vista === this.attuale) return;
    log.info(`Vista: ${this.attuale} → ${vista}${motivo ? ` (${motivo})` : ""}`);
    this.attuale = vista;
    this.notifica();
  }

  imposta(nuove: Partial<ImpostazioniRiposo>): void {
    this.imp = { ...this.imp, ...nuove };
    try {
      this.archivio?.setItem(CHIAVE, JSON.stringify(this.imp));
    } catch (errore) {
      log.avviso(`Impostazioni del riposo non salvate: ${descriviErrore(errore)}`);
    }
    const a = this.imp.attesaMin === null ? "mai da solo" : `dopo ${this.imp.attesaMin} min`;
    log.info(`Schermo a riposo: ${a}, notte ${this.imp.notteDa}:00–${this.imp.notteA}:00`);
    this.attivita();
    this.notifica();
  }

  private leggi(): string | null {
    try {
      return this.archivio?.getItem(CHIAVE) ?? null;
    } catch (errore) {
      log.avviso(`Impostazioni del riposo illeggibili: ${descriviErrore(errore)}`);
      return null;
    }
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Vista: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

function sicuro(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (errore) {
    log.avviso(`localStorage non disponibile: ${descriviErrore(errore)}`);
    return null;
  }
}
