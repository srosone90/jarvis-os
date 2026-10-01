import type { TimerAttivo } from "./timer";

/**
 * Timer dalla schermata Timer (v0.5.7). Il server non ha un servizio per
 * crearli o annullarli: nascono e si annullano parlando con Jarvis, con il
 * device_id di questo pannello (così suonano qui, come a voce). I pulsanti
 * mandano a Jarvis la stessa frase che si direbbe: è la strada già provata
 * in casa. Proposta per la sessione server in STATO.md: `jarvis_voce.timer_avvia`
 * e `timer_annulla`, da usare al posto delle frasi quando ci saranno.
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

/** La frase per un timer nuovo: «Imposta un timer di 10 minuti». */
export function fraseNuovoTimer(minuti: number): string {
  return `Imposta un timer di ${durataParlata(minuti * 60)}`;
}

/**
 * La frase per annullare un timer: per nome se ce l'ha, altrimenti per la
 * durata con cui è partito (come li riconosce Assist). null = non si può
 * dire quale (nessuno dei due).
 */
export function fraseAnnullaTimer(t: Pick<TimerAttivo, "nome" | "secondiTotali">): string | null {
  if (t.nome?.trim()) return `Annulla il timer ${t.nome.trim()}`;
  if (t.secondiTotali && t.secondiTotali > 0) return `Annulla il timer di ${durataParlata(t.secondiTotali)}`;
  return null;
}

/** L'etichetta di un pulsante rapido: "5 min", "1 h", "1 h 30". */
export function etichettaDurata(minuti: number): string {
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}
