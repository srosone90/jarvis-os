/**
 * Volti dal modello UltraFace RFB-320 (v0.6.0, `modelli/volto/LICENZA.md`).
 * Il grafo fa già softmax e decodifica: `scores` [4420, 2] (1 = volto) e
 * `boxes` [4420, 4] con gli angoli normalizzati 0-1 (x1, y1, x2, y2). Qui
 * restano la soglia, la NMS e le stime che servono al pannello: quanto è
 * lontano e se è di fronte. Logica pura, provata senza fotocamera.
 */

export const LARGHEZZA_MODELLO = 320;
export const ALTEZZA_MODELLO = 240;

export interface Volto {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  punteggio: number;
}

/**
 * Larghezza del volto (frazione dell'inquadratura) a 1 m: volto di 16 cm, e
 * campo visivo orizzontale della fotocamera frontale di ~60° (2·tan 30° =
 * 1,155 m a 1 m). Misurato sulle immagini di prova: 0,18 a ~0,8 m, 0,07 a
 * ~2 m. Da tarare col tablet vero (la distanza è personalizzabile).
 */
const LARGHEZZA_A_UN_METRO = 0.139;

/** L'immagine 320×240 (RGBA) come la vuole il modello: NCHW, (pixel − 127) / 128. */
export function ingresso(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const n = LARGHEZZA_MODELLO * ALTEZZA_MODELLO;
  if (rgba.length < n * 4) throw new Error(`fotogramma di ${rgba.length} byte, ne servono ${n * 4}`);
  const x = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    x[i] = ((rgba[i * 4] ?? 0) - 127) / 128;
    x[n + i] = ((rgba[i * 4 + 1] ?? 0) - 127) / 128;
    x[2 * n + i] = ((rgba[i * 4 + 2] ?? 0) - 127) / 128;
  }
  return x;
}

function iou(a: Volto, b: Volto): number {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = w * h;
  const area = (v: Volto) => Math.max(0, v.x2 - v.x1) * Math.max(0, v.y2 - v.y1);
  return inter / (area(a) + area(b) - inter + 1e-9);
}

/** Volti sopra `soglia`, senza doppioni (NMS come l'originale: IoU 0,3), dal più sicuro. */
export function volti(
  scores: ArrayLike<number>,
  boxes: ArrayLike<number>,
  soglia: number,
  maxIou = 0.3,
): Volto[] {
  const candidati: Volto[] = [];
  const n = Math.min(Math.floor(scores.length / 2), Math.floor(boxes.length / 4));
  for (let i = 0; i < n; i++) {
    const p = scores[i * 2 + 1] ?? 0;
    if (p < soglia) continue;
    candidati.push({
      x1: Math.max(0, boxes[i * 4] ?? 0),
      y1: Math.max(0, boxes[i * 4 + 1] ?? 0),
      x2: Math.min(1, boxes[i * 4 + 2] ?? 0),
      y2: Math.min(1, boxes[i * 4 + 3] ?? 0),
      punteggio: p,
    });
  }
  candidati.sort((a, b) => b.punteggio - a.punteggio);
  const tenuti: Volto[] = [];
  for (const c of candidati) if (tenuti.every((t) => iou(t, c) <= maxIou)) tenuti.push(c);
  return tenuti;
}

/** Distanza stimata in metri dalla larghezza del volto. */
export function distanza(v: Volto): number {
  const larghezza = v.x2 - v.x1;
  return larghezza > 0 ? LARGHEZZA_A_UN_METRO / larghezza : Infinity;
}
