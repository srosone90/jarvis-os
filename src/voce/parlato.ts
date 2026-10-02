import { RMS_MINIMO_VOCE, VOLTE_IL_FONDO } from "./inizio-frase";
import type { SensibilitaParlato } from "./preferenze-voce";

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
const RMS_CERTAMENTE_VOCE = 1000;
const PEZZI_DI_FILA = 2;

function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let somma = 0;
  for (const x of pcm) somma += x * x;
  return Math.sqrt(somma / pcm.length);
}

/**
 * Sensibilità (v0.5.8, Impostazioni → Voce): "normale" è la misura della
 * v0.5.3; "alta" prende anche una voce più bassa o lontana (soglie × 0,6),
 * "bassa" vuole una voce più forte e più lunga (soglie × 1,6, tre pezzi di
 * fila: ~200 ms), per una stanza con la TV accesa.
 */
export const SENSIBILITA: Record<SensibilitaParlato, { fattore: number; pezzi: number }> = {
  alta: { fattore: 0.6, pezzi: PEZZI_DI_FILA },
  normale: { fattore: 1, pezzi: PEZZI_DI_FILA },
  bassa: { fattore: 1.6, pezzi: 3 },
};

export class RilevaParlato {
  private fondo = Infinity;
  private diFila = 0;
  private readonly fattore: number;
  private readonly pezzi: number;

  constructor(sensibilita: SensibilitaParlato = "normale") {
    ({ fattore: this.fattore, pezzi: this.pezzi } = SENSIBILITA[sensibilita]);
  }

  /** Un pezzo di microfono (16 kHz). True quando il parlato è appena cominciato. */
  pezzo(pcm: Int16Array): boolean {
    const e = rms(pcm);
    this.fondo = Math.min(this.fondo, e);
    const f = this.fattore;
    const soglia = Math.max(
      RMS_MINIMO_VOCE * f,
      Math.min(this.fondo * VOLTE_IL_FONDO * f, RMS_CERTAMENTE_VOCE * f),
    );
    this.diFila = e >= soglia ? this.diFila + 1 : 0;
    return this.diFila >= this.pezzi;
  }
}
