import { RMS_MINIMO_VOCE, VOLTE_IL_FONDO } from "../parola/inizio-frase";

/**
 * C'è qualcuno che parla? (v0.5.3, conversazione continua). Dopo la risposta
 * il pannello riascolta 8 s senza «Jarvis», ma la domanda verso HA parte solo
 * se qui sente parlare: se nessuno parla non esce niente dal pannello.
 *
 * Energia (RMS) di ogni pezzo del microfono contro il rumore di fondo (il
 * pezzo più basso visto finora): voce = almeno 3 volte il fondo e mai sotto
 * -47 dBFS, come `inizioFrase`. Sopra `RMS_CERTAMENTE_VOCE` (-30 dBFS, una
 * voce a un metro) conta anche se il fondo non si conosce ancora: chi risponde
 * subito non deve aspettare. Servono due pezzi di fila (~130 ms): un colpo
 * secco o un clic non apre una domanda.
 */
export const RMS_CERTAMENTE_VOCE = 1000;
export const PEZZI_DI_FILA = 2;

export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let somma = 0;
  for (const x of pcm) somma += x * x;
  return Math.sqrt(somma / pcm.length);
}

export class RilevaParlato {
  private fondo = Infinity;
  private diFila = 0;

  /** Un pezzo di microfono (16 kHz). True quando il parlato è appena cominciato. */
  pezzo(pcm: Int16Array): boolean {
    const e = rms(pcm);
    this.fondo = Math.min(this.fondo, e);
    const soglia = Math.max(RMS_MINIMO_VOCE, Math.min(this.fondo * VOLTE_IL_FONDO, RMS_CERTAMENTE_VOCE));
    this.diFila = e >= soglia ? this.diFila + 1 : 0;
    return this.diFila >= PEZZI_DI_FILA;
  }
}
