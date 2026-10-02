/**
 * Come si dicono e si scrivono le durate dei timer (schermata Timer, v0.5.7).
 * Dalla v0.5.8 i timer si creano e si annullano con i servizi di jarvis_voce
 * 0.3.0 (src/timer/timer.ts), non più con le frasi mandate a Jarvis.
 */

/** In secondi: 5400 → "1 ora e 30 minuti", 60 → "1 minuto", 45 → "45 secondi". */
export function durataParlata(secondi: number): string {
  const s = Math.max(0, Math.round(secondi));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parti: string[] = [];
  if (h) parti.push(h === 1 ? "1 ora" : `${h} ore`);
  if (m) parti.push(m === 1 ? "1 minuto" : `${m} minuti`);
  if (sec && !h) parti.push(sec === 1 ? "1 secondo" : `${sec} secondi`);
  return parti.length ? parti.join(" e ") : "0 secondi";
}

/** L'etichetta di un pulsante rapido: "5 min", "1 h", "1 h 30". */
export function etichettaDurata(minuti: number): string {
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}
