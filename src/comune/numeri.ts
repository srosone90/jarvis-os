/**
 * Piccoli aiuti sui numeri usati da più moduli (riordino del 02/10: prima
 * ogni file aveva la sua copia identica).
 */

/** 1.5 → "1,5": decimali fissi, virgola italiana. */
export const virgola = (n: number, cifre = 0): string => n.toFixed(cifre).replace(".", ",");

/** Intero tra `min` e `max` (arrotondato). */
export const limitaIntero = (v: number, [min, max]: readonly [number, number]): number =>
  Math.round(Math.min(max, Math.max(min, v)));
