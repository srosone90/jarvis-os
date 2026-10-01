/**
 * Quando un frame fa scattare «Jarvis» (v0.5.4, falsi scatti con la TV).
 *
 * Fatto del 01/10: in cucina 10 scatti in 13 minuti con la TV del salotto
 * accesa, trascrizione sempre vuota. Misurato con 10 minuti di "TV"
 * sintetica e il modello vero (test/unit/parola-falsi-scatti.test.ts):
 *  - un solo frame sopra 0,5 bastava: 24 falsi scatti all'ora;
 *  - due frame di fila (160 ms): 6 all'ora, a 0,6 zero, e il riconoscimento
 *    di «hey jarvis» non cambia (la parola vera resta sopra 0,9 per 5-9 frame);
 *  - un verificatore con pochi negativi, consultato già da punteggi base
 *    minimi, peggiora: la TV lo convince più spesso del modello di base.
 *
 * Quindi:
 *  1. **conferma**: servono `pazienza` frame di fila sopra soglia (di serie 2);
 *  2. la **soglia personale** (v0.5.3) vale solo quando il punteggio viene dal
 *     verificatore e il verificatore dice sì; altrimenti vale quella di serie;
 *  3. **soglia che si adatta**: più di `vuoti` scatti con la trascrizione vuota
 *     in `finestra` → la soglia sale di un `passo`; dopo `quiete` senza scatti
 *     vuoti scende di un passo, mai sotto la sua base. Ogni cambio va nel
 *     registro (lo scrive chi la usa, con `cambio`).
 *
 * Logica pura: il pannello (`AscoltoParola`) e le prove col modello vero
 * usano la stessa classe.
 */

export interface OpzioniAdattiva {
  attiva: boolean;
  /** Quanto sale (o scende) a ogni cambio. */
  passo: number;
  /** Finestra in cui si contano gli scatti a vuoto. */
  finestraMs: number;
  /** Sale quando gli scatti a vuoto nella finestra sono PIÙ di questi. */
  vuoti: number;
  /** Scende di un passo dopo questo tempo senza scatti a vuoto. */
  quieteMs: number;
}

export interface OpzioniDecisione {
  /** Frame di fila (da 80 ms) sopra soglia per scattare. */
  pazienza: number;
  adattiva: OpzioniAdattiva;
}

export const DECISIONE_DI_SERIE: OpzioniDecisione = {
  pazienza: 2,
  adattiva: { attiva: true, passo: 0.05, finestraMs: 10 * 60_000, vuoti: 3, quieteMs: 30 * 60_000 },
};

/** La soglia non sale mai oltre: sopra, anche la parola vera non passerebbe più. */
export const SOGLIA_MASSIMA = 0.95;

export interface Soglie {
  /** Soglia di serie (0,5, o quella scelta in Impostazioni / parola.json). */
  serie: number;
  /** Soglia personale dagli esempi (v0.5.3), null se non c'è. */
  personale: number | null;
}

export interface CambioSoglia {
  aumento: number;
  motivo: string;
}

export class DecisioneScatto {
  private fila = 0;
  private vuotiRecenti: number[] = [];
  private aumentoAttuale = 0;
  private ultimoMovimento = 0;

  constructor(private opzioni: OpzioniDecisione = DECISIONE_DI_SERIE) {}

  get aumento(): number {
    return this.aumentoAttuale;
  }

  imposta(opzioni: OpzioniDecisione): void {
    this.opzioni = opzioni;
    if (!opzioni.adattiva.attiva) this.aumentoAttuale = 0;
  }

  /** La soglia che vale per questo frame. */
  soglia(e: { verificato: boolean }, s: Soglie): number {
    const base = e.verificato && s.personale !== null ? s.personale : s.serie;
    return Math.min(SOGLIA_MASSIMA, base + this.aumentoAttuale);
  }

  /** Un frame: true se completa la conferma (e allora la fila riparte da zero). */
  frame(e: { punteggio: number; verificato: boolean }, s: Soglie): boolean {
    this.fila = e.punteggio >= this.soglia(e, s) ? this.fila + 1 : 0;
    if (this.fila < Math.max(1, this.opzioni.pazienza)) return false;
    this.fila = 0;
    return true;
  }

  /** Dopo uno scatto: la trascrizione era vuota? Ritorna il cambio di soglia, se c'è. */
  esito(vuoto: boolean, adesso: number): CambioSoglia | null {
    const a = this.opzioni.adattiva;
    if (!vuoto || !a.attiva) return null;
    this.vuotiRecenti = [...this.vuotiRecenti.filter((t) => adesso - t < a.finestraMs), adesso];
    if (this.vuotiRecenti.length <= a.vuoti) return null;
    this.vuotiRecenti = [];
    const prima = this.aumentoAttuale;
    this.aumentoAttuale = arrotonda(Math.min(SOGLIA_MASSIMA, this.aumentoAttuale + a.passo));
    this.ultimoMovimento = adesso;
    if (this.aumentoAttuale === prima) return null;
    return {
      aumento: this.aumentoAttuale,
      motivo: `più di ${a.vuoti} scatti senza parole in ${Math.round(a.finestraMs / 60_000)} minuti`,
    };
  }

  /** Da chiamare ogni tanto: dopo la quiete la soglia scende di un passo. */
  controlla(adesso: number): CambioSoglia | null {
    const a = this.opzioni.adattiva;
    if (this.aumentoAttuale <= 0) return null;
    const ultimoVuoto = this.vuotiRecenti.at(-1) ?? 0;
    if (adesso - Math.max(this.ultimoMovimento, ultimoVuoto) < a.quieteMs) return null;
    this.aumentoAttuale = arrotonda(Math.max(0, this.aumentoAttuale - a.passo));
    this.ultimoMovimento = adesso;
    return {
      aumento: this.aumentoAttuale,
      motivo: `${Math.round(a.quieteMs / 60_000)} minuti senza scatti a vuoto`,
    };
  }

  /** Riparte da zero (microfono riaperto). L'aumento resta: la TV non è sparita. */
  azzeraFila(): void {
    this.fila = 0;
  }
}

const arrotonda = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Falsi scatti che insegnano (v0.5.4, `MotoreParola.imparaDaFalsoScatto`):
 * gli ultimi frame prima di uno scatto con la trascrizione vuota diventano
 * esempi "non è «Jarvis»" (solo numeri, niente audio). Si tengono 16 frame
 * (1,3 s): la "parola", se c'era, sta lì.
 */
export const FRAME_FALSO_SCATTO = 16;
/** Persona con cui si salvano nell'archivio (tipo "normale"). */
export const FALSO_SCATTO = "(falso scatto)";
/** Dopo tanti falsi scatti nuovi il verificatore si riaddestra da solo. */
export const FALSI_PER_RIADDESTRARE = 2;
