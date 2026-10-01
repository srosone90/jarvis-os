/**
 * Da dove comincia la frase in cui è stata detta «Jarvis» (v0.5.2, requisito
 * di Salvatore: "C'è un po' di freddo in questa stanza, cosa ne pensi,
 * Jarvis?" deve arrivare INTERA).
 *
 * Nella memoria (fino a 10 s, la parola è alla fine) si torna indietro fino
 * all'ultima pausa di almeno 1,0 s: la stessa soglia di fine frase del server
 * (`jarvis_voce`, silenzio_secondi 1.0). Se si mandasse anche quella pausa, il
 * server ci vedrebbe una fine frase e chiuderebbe PRIMA di «Jarvis». Senza
 * pause, si manda tutta la memoria.
 *
 * Voce o silenzio si decidono con l'energia (RMS) a finestre da 20 ms, con
 * una soglia relativa al rumore di fondo della memoria stessa. Nel dubbio
 * conviene vedere voce come silenzio (si manda un po' meno contesto) e non il
 * contrario (una pausa vera dentro la frase farebbe chiudere il server).
 */
export const PAUSA_FINE_FRASE_S = 1.0;
/** Un po' di silenzio prima della voce: la prima sillaba non si taglia. */
export const MARGINE_PRIMA_S = 0.25;
const FINESTRA = 320; // 20 ms a 16 kHz
/** Sotto questo RMS (int16) non è mai voce: circa -47 dBFS. */
export const RMS_MINIMO_VOCE = 150;
/** Voce = almeno tante volte il rumore di fondo (10° percentile delle finestre). */
export const VOLTE_IL_FONDO = 3;

/** RMS di ogni finestra da 20 ms. */
export function energie(pcm: Int16Array): Float32Array {
  const n = Math.floor(pcm.length / FINESTRA);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let somma = 0;
    for (let i = f * FINESTRA; i < (f + 1) * FINESTRA; i++) somma += (pcm[i] ?? 0) * (pcm[i] ?? 0);
    e[f] = Math.sqrt(somma / FINESTRA);
  }
  return e;
}

/**
 * Indice del primo campione da mandare a HA. 0 = tutta la memoria (nessuna
 * pausa di 1 s dentro). La pausa dopo la parola (fino allo scatto) non conta.
 */
export function inizioFrase(pcm: Int16Array, frequenza = 16000): number {
  const e = energie(pcm);
  if (e.length === 0) return 0;
  const ordinate = Float32Array.from(e).sort();
  const fondo = ordinate[Math.floor(ordinate.length * 0.1)] ?? 0;
  const soglia = Math.max(RMS_MINIMO_VOCE, fondo * VOLTE_IL_FONDO);
  const finestreDiPausa = Math.round((PAUSA_FINE_FRASE_S * frequenza) / FINESTRA);
  const margine = Math.round(MARGINE_PRIMA_S * frequenza);
  let silenzio = 0;
  let vistaVoce = false;
  for (let f = e.length - 1; f >= 0; f--) {
    if ((e[f] ?? 0) >= soglia) {
      silenzio = 0;
      vistaVoce = true;
      continue;
    }
    silenzio += 1;
    // la pausa conta solo se c'è voce dopo (la parola): il silenzio finale no
    if (vistaVoce && silenzio >= finestreDiPausa) {
      const primaVoce = (f + silenzio) * FINESTRA;
      return Math.max(0, primaVoce - margine);
    }
  }
  return 0;
}
