/**
 * Memoria circolare degli ultimi secondi di audio (PCM 16 bit a 16 kHz), per
 * la parola in qualsiasi punto della frase ("spegni la TV, Jarvis"): allo scatto
 * si prende anche quello che è stato detto PRIMA.
 *
 * Privacy (CLAUDE.md, "Ehi Jarvis"): vive SOLO in RAM, si sovrascrive di
 * continuo, non si invia e non si salva finché la parola non scatta. `svuota()`
 * azzera davvero i campioni (non solo l'indice).
 */
export class MemoriaCircolare {
  private dati: Int16Array;
  private pos = 0;
  private pieni = 0;

  constructor(
    secondi: number,
    private readonly frequenza = 16000,
  ) {
    this.dati = new Int16Array(Math.max(1, Math.round(secondi * frequenza)));
  }

  get secondi(): number {
    return this.dati.length / this.frequenza;
  }

  /** Cambia la durata: si riparte vuoti (niente audio vecchio tenuto per sbaglio). */
  ridimensiona(secondi: number): void {
    this.dati.fill(0);
    this.dati = new Int16Array(Math.max(1, Math.round(secondi * this.frequenza)));
    this.pos = 0;
    this.pieni = 0;
  }

  scrivi(pcm: Int16Array): void {
    // se il pezzo è più lungo della memoria contano solo i suoi ultimi campioni
    const pezzo = pcm.length > this.dati.length ? pcm.subarray(pcm.length - this.dati.length) : pcm;
    const primo = Math.min(pezzo.length, this.dati.length - this.pos);
    this.dati.set(pezzo.subarray(0, primo), this.pos);
    this.dati.set(pezzo.subarray(primo), 0);
    this.pos = (this.pos + pezzo.length) % this.dati.length;
    this.pieni = Math.min(this.dati.length, this.pieni + pezzo.length);
  }

  /** Copia degli ultimi campioni, dal più vecchio al più recente. */
  ultimi(): Int16Array {
    const fuori = new Int16Array(this.pieni);
    const inizio = (this.pos - this.pieni + this.dati.length) % this.dati.length;
    const primo = Math.min(this.pieni, this.dati.length - inizio);
    fuori.set(this.dati.subarray(inizio, inizio + primo));
    fuori.set(this.dati.subarray(0, this.pieni - primo), primo);
    return fuori;
  }

  svuota(): void {
    this.dati.fill(0);
    this.pos = 0;
    this.pieni = 0;
  }
}
