/**
 * Da dove comincia la frase in cui è stata detta «Jarvis» (v0.5.2, requisito
 * di Salvatore: "C'è un po' di freddo in questa stanza, cosa ne pensi,
 * Jarvis?" deve arrivare INTERA).
 *
 * Negli ultimi 10 s della memoria (la parola è alla fine) si torna indietro fino
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
const PAUSA_FINE_FRASE_S = 1.0;
/** Un po' di silenzio prima della voce: la prima sillaba non si taglia. */
export const MARGINE_PRIMA_S = 0.25;
const FINESTRA = 320; // 20 ms a 16 kHz
/** Sotto questo RMS (int16) non è mai voce: circa -47 dBFS. */
export const RMS_MINIMO_VOCE = 150;
/** Voce = almeno tante volte il rumore di fondo (10° percentile delle finestre). */
export const VOLTE_IL_FONDO = 3;

/**
 * La frase della richiesta si cerca solo negli ultimi 10 s (come la v0.5.2):
 * la memoria ora è di 60 s (v0.5.3), e senza un limite una chiacchierata
 * senza pause diventerebbe una "domanda" di un minuto. Quello che c'è prima
 * va a HA come contesto, non si perde.
 */
const FINESTRA_FRASE_S = 10;
/** Contesto (v0.5.3): sotto questo parlato (somma delle finestre di voce) non si manda niente. */
export const MINIMO_PARLATO_S = 0.5;

/** RMS di ogni finestra da 20 ms. */
function energie(pcm: Int16Array): Float32Array {
  const n = Math.floor(pcm.length / FINESTRA);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let somma = 0;
    for (let i = f * FINESTRA; i < (f + 1) * FINESTRA; i++) somma += (pcm[i] ?? 0) * (pcm[i] ?? 0);
    e[f] = Math.sqrt(somma / FINESTRA);
  }
  return e;
}

/** Soglia voce/silenzio: tante volte il rumore di fondo (10° percentile), mai sotto il minimo. */
function sogliaVoce(e: Float32Array): number {
  const ordinate = Float32Array.from(e).sort();
  const fondo = ordinate[Math.floor(ordinate.length * 0.1)] ?? 0;
  return Math.max(RMS_MINIMO_VOCE, fondo * VOLTE_IL_FONDO);
}

/**
 * Indice del primo campione da mandare a HA. 0 = tutta la memoria (nessuna
 * pausa di 1 s dentro). La pausa dopo la parola (fino allo scatto) non conta.
 */
export function inizioFrase(pcm: Int16Array, frequenza = 16000): number {
  const e = energie(pcm);
  if (e.length === 0) return 0;
  const soglia = sogliaVoce(e);
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

/**
 * Dove comincia la richiesta nella memoria di 60 s (v0.5.3): l'inizio della
 * frase cercato solo negli ultimi `FINESTRA_FRASE_S` secondi.
 */
export function inizioRichiesta(memoria: Int16Array, frequenza = 16000): number {
  const da = Math.max(0, memoria.length - Math.round(FINESTRA_FRASE_S * frequenza));
  return da + inizioFrase(memoria.subarray(da), frequenza);
}

/**
 * Il contesto PRIMA della richiesta (v0.5.3, "persona sempre presente"):
 * l'audio fino a `fine`, senza il silenzio all'inizio e alla fine (col solito
 * margine). null se lì dentro non c'è parlato: allora non si manda niente.
 * Voce o silenzio con la stessa energia di `inizioFrase`, con la soglia presa
 * da tutta la memoria (richiesta compresa: è la voce di chi parla adesso).
 */
export function contestoPrima(memoria: Int16Array, fine: number, frequenza = 16000): Int16Array | null {
  const i = intervalloContesto(memoria, fine, frequenza);
  return i ? memoria.slice(i[0], i[1]) : null;
}

/** Dove sta il contesto nella memoria: [da, a), o null se non c'è parlato. */
export function intervalloContesto(
  memoria: Int16Array,
  fine: number,
  frequenza = 16000,
): [number, number] | null {
  const e = energie(memoria);
  const finestre = Math.min(e.length, Math.floor(fine / FINESTRA));
  if (finestre === 0) return null;
  const soglia = sogliaVoce(e);
  let prima = -1;
  let ultima = -1;
  let voce = 0;
  for (let f = 0; f < finestre; f++)
    if ((e[f] ?? 0) >= soglia) {
      if (prima < 0) prima = f;
      ultima = f;
      voce += 1;
    }
  if (voce * FINESTRA < MINIMO_PARLATO_S * frequenza) return null;
  const margine = Math.round(MARGINE_PRIMA_S * frequenza);
  const da = Math.max(0, prima * FINESTRA - margine);
  const a = Math.min(fine, (ultima + 1) * FINESTRA + margine);
  return [da, a];
}
