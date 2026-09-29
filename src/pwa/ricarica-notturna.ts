/**
 * Ricarica di sicurezza notturna: il pannello resta acceso per mesi, una
 * ricarica al giorno azzera qualunque accumulo (memoria, timer, stato del
 * browser) e applica gli aggiornamenti dell'app.
 *
 * Regola: tra le 04:00 e le 04:59, se nessuno tocca lo schermo da almeno
 * 10 minuti e oggi non si è già ricaricato.
 */
export const ORA_RICARICA = 4;
export const INATTIVITA_MINIMA_MS = 10 * 60_000;

export function deveRicaricare(
  adesso: Date,
  ultimaInterazione: number,
  ultimaRicarica: string | null,
): boolean {
  if (adesso.getHours() !== ORA_RICARICA) return false;
  if (adesso.getTime() - ultimaInterazione < INATTIVITA_MINIMA_MS) return false;
  return ultimaRicarica !== giornoDi(adesso);
}

export function giornoDi(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
