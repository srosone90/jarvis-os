/**
 * Quando un frame fa scattare «Jarvis» (v0.5.4, falsi scatti con la TV;
 * v0.6.5, soglia fissa).
 *
 * Fatto del 01/10: in cucina 10 scatti in 13 minuti con la TV del salotto
 * accesa, trascrizione sempre vuota. Misurato con 10 minuti di "TV"
 * sintetica e il modello vero (test/unit/parola/parola-falsi-scatti.test.ts):
 *  - un solo frame sopra 0,5 bastava: 24 falsi scatti all'ora;
 *  - due frame di fila (160 ms): molti meno, e il riconoscimento di
 *    «hey jarvis» non cambia (la parola vera resta sopra 0,9 per 5-9 frame).
 *
 * Quindi:
 *  1. **conferma**: servono `pazienza` frame di fila sopra soglia (di serie 2);
 *  2. la **soglia personale** (v0.5.3) vale solo quando il punteggio viene dal
 *     verificatore e il verificatore dice sì; altrimenti vale quella di serie.
 *
 * **La soglia è fissa** (v0.6.5, richiesta di Salvatore del 03/10: «Jarvis»
 * deve scattare uguale vicino e lontano). Tolti la soglia che saliva da sola
 * dopo gli scatti a vuoto (v0.5.4: con la TV accesa saliva e restava su per
 * mezz'ora, proprio quando si chiama dal divano) e lo sconto con qualcuno
 * vicino alla fotocamera (v0.6.0: vicino scattava più facilmente che da
 * lontano). Misure in test/unit/parola/parola-distanza.test.ts.
 *
 * Logica pura: il pannello (`AscoltoParola`) e le prove col modello vero
 * usano la stessa classe.
 */

export interface OpzioniDecisione {
  /** Frame di fila (da 80 ms) sopra soglia per scattare. */
  pazienza: number;
}

export const DECISIONE_DI_SERIE: OpzioniDecisione = { pazienza: 2 };

export interface Soglie {
  /** Soglia di serie (0,5, o quella scelta in Impostazioni / parola.json). */
  serie: number;
  /** Soglia personale dagli esempi (v0.5.3), null se non c'è. */
  personale: number | null;
}

export class DecisioneScatto {
  private fila = 0;

  constructor(private opzioni: OpzioniDecisione = DECISIONE_DI_SERIE) {}

  imposta(opzioni: OpzioniDecisione): void {
    this.opzioni = opzioni;
  }

  /** La soglia che vale per questo frame. */
  soglia(e: { verificato: boolean }, s: Soglie): number {
    return e.verificato && s.personale !== null ? s.personale : s.serie;
  }

  /** Un frame: true se completa la conferma (e allora la fila riparte da zero). */
  frame(e: { punteggio: number; verificato: boolean }, s: Soglie): boolean {
    this.fila = e.punteggio >= this.soglia(e, s) ? this.fila + 1 : 0;
    if (this.fila < Math.max(1, this.opzioni.pazienza)) return false;
    this.fila = 0;
    return true;
  }

  /** Riparte da zero (microfono riaperto). */
  azzeraFila(): void {
    this.fila = 0;
  }
}

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
