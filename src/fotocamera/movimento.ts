/**
 * Movimento davanti alla fotocamera (v0.6.0): costa quasi niente e decide
 * quando far girare il modello del volto (che costa di più). Grigio 64×48,
 * differenza col fotogramma prima: la frazione di punti cambiati di più di
 * `SALTO` livelli. Logica pura.
 */
const LARGHEZZA_GRIGIO = 64;
const ALTEZZA_GRIGIO = 48;
/** Un punto "cambia" se la luminosità salta di tanto (su 255): il rumore della fotocamera sta sotto. */
const SALTO = 24;

/** RGBA w×h → grigio 64×48 (media dei punti di ogni cella). */
export function grigioPiccolo(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(LARGHEZZA_GRIGIO * ALTEZZA_GRIGIO);
  const sx = w / LARGHEZZA_GRIGIO;
  const sy = h / ALTEZZA_GRIGIO;
  for (let gy = 0; gy < ALTEZZA_GRIGIO; gy++)
    for (let gx = 0; gx < LARGHEZZA_GRIGIO; gx++) {
      let somma = 0;
      let quanti = 0;
      for (let y = Math.floor(gy * sy); y < Math.floor((gy + 1) * sy); y += 2)
        for (let x = Math.floor(gx * sx); x < Math.floor((gx + 1) * sx); x += 2) {
          const i = (y * w + x) * 4;
          somma += 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
          quanti += 1;
        }
      g[gy * LARGHEZZA_GRIGIO + gx] = quanti ? Math.round(somma / quanti) : 0;
    }
  return g;
}

export class Movimento {
  private prima: Uint8Array | null = null;

  /** Frazione (0-1) dei punti cambiati rispetto al fotogramma precedente; il primo conta come 1. */
  quanto(grigio: Uint8Array): number {
    const prima = this.prima;
    this.prima = grigio;
    if (!prima || prima.length !== grigio.length) return 1;
    let cambiati = 0;
    for (let i = 0; i < grigio.length; i++)
      if (Math.abs((grigio[i] ?? 0) - (prima[i] ?? 0)) > SALTO) cambiati += 1;
    return cambiati / grigio.length;
  }

  azzera(): void {
    this.prima = null;
  }
}
