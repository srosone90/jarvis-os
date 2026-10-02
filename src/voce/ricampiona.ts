/**
 * Ricampionamento lineare a 16 kHz, a pezzi (tiene il resto tra un pezzo e
 * l'altro). Serve quando il browser non concede un AudioContext a 16 kHz: il
 * rilevatore della parola e HA ricevono sempre 16 kHz. Stesso algoritmo della
 * pagina di prova del 29/09.
 */
export class Ricampionatore {
  private resto = 0;
  private ultimo = 0;

  constructor(private readonly frequenza: number) {}

  get serve(): boolean {
    return this.frequenza !== 16000;
  }

  a16k(pcm: Int16Array): Int16Array {
    if (!this.serve) return pcm;
    const passo = this.frequenza / 16000;
    const uscita: number[] = [];
    // posizione relativa al pezzo: -1 è l'ultimo campione del pezzo precedente
    let pos = this.resto;
    for (; pos < pcm.length - 1; pos += passo) {
      const i = Math.floor(pos);
      const f = pos - i;
      const a = i < 0 ? this.ultimo : (pcm[i] ?? 0);
      const b = pcm[i + 1] ?? 0;
      uscita.push(Math.round(a * (1 - f) + b * f));
    }
    this.resto = pos - pcm.length;
    this.ultimo = pcm[pcm.length - 1] ?? 0;
    return Int16Array.from(uscita);
  }
}
