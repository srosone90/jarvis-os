/**
 * Attesa prima del prossimo tentativo di riconnessione: esponenziale con
 * "equal jitter". Metà dell'attesa è fissa, metà casuale: così più pannelli (o
 * più schede) non martellano Home Assistant tutti nello stesso istante quando
 * torna su dopo un blackout.
 *
 * tentativo 0 → subito; poi ~1 s, 2 s, 4 s, 8 s, 16 s, fino a un massimo di 30 s.
 */
const ATTESA_BASE_MS = 1000;
export const ATTESA_MASSIMA_MS = 30_000;

export function calcolaAttesa(tentativo: number, casuale: () => number = Math.random): number {
  if (tentativo <= 0) return 0;
  const tetto = Math.min(ATTESA_MASSIMA_MS, ATTESA_BASE_MS * 2 ** (tentativo - 1));
  return Math.round(tetto / 2 + casuale() * (tetto / 2));
}
