/**
 * Verificatore personale della parola: il "custom verifier" di openWakeWord
 * 0.6.0 (openwakeword/custom_verifier_model.py), rifatto per girare e
 * addestrarsi SUL TELEFONO. Gli esempi di voce non escono mai dal dispositivo.
 *
 * Com'è fatto l'originale (letto nel codice):
 * - caratteristiche: `preprocessor.get_features(16)`, cioè gli ultimi 16
 *   embedding da 96 valori (lo stesso ingresso del classificatore), appiattiti;
 * - modello: `make_pipeline(flatten, StandardScaler(), LogisticRegression(C=0.001,
 *   max_iter=2000))`;
 * - uso (`Model.predict`): se il punteggio del modello base è ≥
 *   `custom_verifier_threshold` (0,1), il punteggio diventa la probabilità del
 *   verificatore; poi vale la soglia di attivazione di sempre.
 *
 * Qui: stessa normalizzazione (deviazione standard con ddof=0, 1 dove è
 * zero), stesso obiettivo della regressione logistica di scikit-learn
 * (½‖w‖² + C·Σ perdita logistica, intercetta non penalizzata), risolto con
 * L-BFGS. Verificato contro scikit-learn 1.9.1 (test/unit/verificatore.test.ts).
 *
 * Unica differenza voluta, nella SCELTA degli esempi positivi (vedi
 * `scegliPositivi`): l'originale li prende solo dove il modello base supera
 * 0,5, ma con la pronuncia italiana "Giàrvis" il modello base (addestrato su
 * voci inglesi) non ci arriva quasi mai.
 */

/** `custom_verifier_threshold` predefinito di openWakeWord. */
export const SOGLIA_BASE_PREDEFINITA = 0.1;
/** `LogisticRegression(C=0.001)` di openWakeWord. */
const C_PREDEFINITO = 0.001;

export interface Verificatore {
  versione: 1;
  /** Modello base con cui sono stati scelti gli esempi (le caratteristiche non ne dipendono). */
  modello: string;
  media: number[];
  scala: number[];
  pesi: number[];
  intercetta: number;
  /**
   * Soglia personale di scatto (v0.5.3, "strada veloce"), calcolata dai
   * vostri esempi con `sogliaPersonale`. Assente = soglia di serie.
   */
  soglia?: number;
  /** Dati per la diagnostica: quanti esempi, quando, da chi. */
  info: {
    positivi: number;
    negativi: number;
    persone: string[];
    creato: string;
    iterazioni: number;
    accuratezza: number;
  };
}

function sigmoide(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/** Probabilità che le caratteristiche siano la parola detta da una voce di casa. */
export function probabilita(v: Verificatore, x: ArrayLike<number>): number {
  let z = v.intercetta;
  for (let j = 0; j < v.pesi.length; j++)
    z += (v.pesi[j] ?? 0) * (((x[j] ?? 0) - (v.media[j] ?? 0)) / (v.scala[j] ?? 1));
  return sigmoide(z);
}

/**
 * Punteggio finale come `Model.predict` di openWakeWord: il verificatore
 * decide solo quando il modello base ha già un minimo di sospetto.
 */
export function punteggioFinale(
  base: number,
  caratteristiche: ArrayLike<number> | undefined,
  v: Verificatore | null,
  sogliaBase: number,
): { punteggio: number; verificato: boolean } {
  if (!v || !caratteristiche || base < sogliaBase) return { punteggio: base, verificato: false };
  return { punteggio: probabilita(v, caratteristiche), verificato: true };
}

// --- Scelta degli esempi --------------------------------------------------------

export interface FrameRegistrato {
  punteggio: number;
  caratteristiche: Float32Array;
}

/**
 * Esempi positivi di una registrazione "di' Jarvis" (i frame dopo l'invito):
 * tutti quelli con punteggio base ≥ sogliaBase (a runtime il verificatore
 * decide solo lì); se nessuno ci arriva, i 3 frame attorno al punteggio più
 * alto, cioè il momento più "Jarvis" della registrazione.
 */
export function scegliPositivi(frame: FrameRegistrato[], sogliaBase: number): Float32Array[] {
  if (frame.length === 0) return [];
  const sopra = frame.filter((f) => f.punteggio >= sogliaBase);
  if (sopra.length > 0) return sopra.map((f) => f.caratteristiche);
  let migliore = 0;
  frame.forEach((f, i) => {
    if (f.punteggio > (frame[migliore]?.punteggio ?? -1)) migliore = i;
  });
  return frame.slice(Math.max(0, migliore - 1), migliore + 2).map((f) => f.caratteristiche);
}

/** Negativi: tutti i frame (come l'originale, soglia 0), al massimo `massimo` presi a intervalli regolari. */
export function scegliNegativi(frame: FrameRegistrato[], massimo = 2000): Float32Array[] {
  if (frame.length <= massimo) return frame.map((f) => f.caratteristiche);
  const passo = frame.length / massimo;
  return Array.from(
    { length: massimo },
    (_, i) => frame[Math.floor(i * passo)]?.caratteristiche ?? new Float32Array(0),
  );
}

/** Soglia base da proporre: sotto il più basso dei massimi delle registrazioni positive. */
export function sogliaBaseConsigliata(massimi: number[]): number {
  if (massimi.length === 0) return SOGLIA_BASE_PREDEFINITA;
  const minimo = Math.min(...massimi);
  return Math.min(SOGLIA_BASE_PREDEFINITA, Math.max(0.005, Math.round(minimo * 0.8 * 1000) / 1000));
}

// --- Addestramento ----------------------------------------------------------------

interface OpzioniAddestramento {
  C?: number;
  iterazioniMassime?: number;
  /** Tolleranza sul gradiente (norma infinito, obiettivo diviso per N). */
  tolleranza?: number;
  /** Chiamata ogni tanto: per aggiornare la pagina (e cedere il passo al browser). */
  avanzamento?: (iterazione: number) => Promise<void> | void;
}

/**
 * StandardScaler + LogisticRegression(C) come scikit-learn, risolto con L-BFGS.
 * Obiettivo (diviso per N, stesso minimo): mean(perdita) + ‖w‖²/(2·C·N).
 */
export async function addestra(
  positivi: ArrayLike<number>[],
  negativi: ArrayLike<number>[],
  meta: { modello: string; persone: string[] },
  opzioni: OpzioniAddestramento = {},
): Promise<Verificatore> {
  const C = opzioni.C ?? C_PREDEFINITO;
  const iterazioniMassime = opzioni.iterazioniMassime ?? 2000;
  const tolleranza = opzioni.tolleranza ?? 1e-9;
  if (positivi.length === 0 || negativi.length === 0)
    throw new Error("servono esempi sia della parola sia di parlato normale");
  const righe = [...positivi, ...negativi];
  const etichette = Float64Array.from([...positivi.map(() => 1), ...negativi.map(() => 0)]);
  const n = righe.length;
  const d = righe[0]?.length ?? 0;

  // StandardScaler: media e deviazione standard (ddof=0); dove è ~0, scala 1
  const media = new Float64Array(d);
  const scala = new Float64Array(d);
  for (const r of righe) for (let j = 0; j < d; j++) media[j] = (media[j] ?? 0) + (r[j] ?? 0) / n;
  for (const r of righe)
    for (let j = 0; j < d; j++) {
      const s = (r[j] ?? 0) - (media[j] ?? 0);
      scala[j] = (scala[j] ?? 0) + (s * s) / n;
    }
  for (let j = 0; j < d; j++) {
    const dev = Math.sqrt(scala[j] ?? 0);
    scala[j] = dev < 10 * Number.EPSILON * Math.max(1, Math.abs(media[j] ?? 0)) ? 1 : dev;
  }
  // righe normalizzate, tutte in fila: X[i·d + j]
  const X = new Float64Array(n * d);
  righe.forEach((r, i) => {
    for (let j = 0; j < d; j++) X[i * d + j] = ((r[j] ?? 0) - (media[j] ?? 0)) / (scala[j] ?? 1);
  });

  // parametri: [w_0..w_{d-1}, b]
  const lambda = 1 / (C * n);
  const valuta = (p: Float64Array, g: Float64Array): number => {
    g.fill(0);
    let perdita = 0;
    const b = p[d] ?? 0;
    for (let i = 0; i < n; i++) {
      const riga = i * d;
      let z = b;
      for (let j = 0; j < d; j++) z += (p[j] ?? 0) * (X[riga + j] ?? 0);
      const y = etichette[i] ?? 0;
      // log(1+e^z) - y·z, stabile
      perdita += (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z))) - y * z;
      const r = (sigmoide(z) - y) / n;
      for (let j = 0; j < d; j++) g[j] = (g[j] ?? 0) + r * (X[riga + j] ?? 0);
      g[d] = (g[d] ?? 0) + r;
    }
    let norma = 0;
    for (let j = 0; j < d; j++) {
      const w = p[j] ?? 0;
      norma += w * w;
      g[j] = (g[j] ?? 0) + lambda * w;
    }
    return perdita / n + (lambda * norma) / 2;
  };

  const { punto, iterazioni } = await lbfgs(
    valuta,
    d + 1,
    iterazioniMassime,
    tolleranza,
    opzioni.avanzamento,
  );
  const v: Verificatore = {
    versione: 1,
    modello: meta.modello,
    media: Array.from(media),
    scala: Array.from(scala),
    pesi: Array.from(punto.subarray(0, d)),
    intercetta: punto[d] ?? 0,
    info: {
      positivi: positivi.length,
      negativi: negativi.length,
      persone: meta.persone,
      creato: new Date().toISOString(),
      iterazioni,
      accuratezza: 0,
    },
  };
  let giusti = 0;
  righe.forEach((r, i) => {
    if (probabilita(v, r) >= 0.5 === (etichette[i] === 1)) giusti++;
  });
  v.info.accuratezza = giusti / n;
  return v;
}

function scalare(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function massimoAssoluto(v: Float64Array): number {
  return v.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
}

/** L-BFGS (memoria 10) con ricerca lineare all'indietro (Armijo). Problema convesso. */
async function lbfgs(
  valuta: (p: Float64Array, g: Float64Array) => number,
  dimensione: number,
  iterazioniMassime: number,
  tolleranza: number,
  avanzamento?: (iterazione: number) => Promise<void> | void,
): Promise<{ punto: Float64Array; iterazioni: number }> {
  const M = 10;
  let x = new Float64Array(dimensione);
  let g = new Float64Array(dimensione);
  let f = valuta(x, g);
  // coppie (s, y) più recenti in fondo
  const memoria: { s: Float64Array; y: Float64Array; rho: number; alfa: number }[] = [];
  const direzione = new Float64Array(dimensione);
  const punto = new Float64Array(dimensione);
  const gNuovo = new Float64Array(dimensione);

  let k = 0;
  for (; k < iterazioniMassime && massimoAssoluto(g) > tolleranza; k++) {
    // direzione = -H·g (ricorsione a due cicli)
    direzione.set(g);
    for (const m of [...memoria].reverse()) {
      m.alfa = m.rho * scalare(m.s, direzione);
      for (let j = 0; j < dimensione; j++) direzione[j] = (direzione[j] ?? 0) - m.alfa * (m.y[j] ?? 0);
    }
    const ultima = memoria.at(-1);
    const gamma = ultima
      ? scalare(ultima.s, ultima.y) / scalare(ultima.y, ultima.y)
      : 1 / Math.max(1, massimoAssoluto(g));
    for (let j = 0; j < dimensione; j++) direzione[j] = (direzione[j] ?? 0) * gamma;
    for (const m of memoria) {
      const beta = m.rho * scalare(m.y, direzione);
      for (let j = 0; j < dimensione; j++)
        direzione[j] = (direzione[j] ?? 0) + (m.s[j] ?? 0) * (m.alfa - beta);
    }
    for (let j = 0; j < dimensione; j++) direzione[j] = -(direzione[j] ?? 0);

    let pendenza = scalare(g, direzione);
    if (pendenza >= 0) {
      // direzione non di discesa (non dovrebbe capitare): si riparte dal gradiente
      memoria.length = 0;
      for (let j = 0; j < dimensione; j++) direzione[j] = -(g[j] ?? 0);
      pendenza = scalare(g, direzione);
    }
    let passo = 1;
    let fNuovo = f;
    for (let tentativo = 0; tentativo <= 40; tentativo++) {
      for (let j = 0; j < dimensione; j++) punto[j] = (x[j] ?? 0) + passo * (direzione[j] ?? 0);
      fNuovo = valuta(punto, gNuovo);
      if (fNuovo <= f + 1e-4 * passo * pendenza) break;
      passo /= 2;
    }
    const s = new Float64Array(dimensione);
    const y = new Float64Array(dimensione);
    for (let j = 0; j < dimensione; j++) {
      s[j] = (punto[j] ?? 0) - (x[j] ?? 0);
      y[j] = (gNuovo[j] ?? 0) - (g[j] ?? 0);
    }
    const sy = scalare(s, y);
    if (sy > 1e-12) {
      memoria.push({ s, y, rho: 1 / sy, alfa: 0 });
      if (memoria.length > M) memoria.shift();
    }
    x = Float64Array.from(punto);
    g = Float64Array.from(gNuovo);
    const fermo = Math.abs(f - fNuovo) <= 1e-15 * Math.max(1, Math.abs(f));
    f = fNuovo;
    if (fermo) {
      k++;
      break;
    }
    if (avanzamento && k % 10 === 0) await avanzamento(k);
  }
  return { punto: x, iterazioni: k };
}

// --- Soglia personale (v0.5.3) -------------------------------------------------------

/** Mai sotto: la soglia personale accelera lo scatto, non lo rende facile per chiunque. */
export const SOGLIA_PERSONALE_MINIMA = 0.2;
/** Mai sopra la soglia di serie: la strada veloce non rende «Jarvis» più duro d'orecchi. */
const SOGLIA_PERSONALE_MASSIMA = 0.5;
/** Distanza minima dal punteggio più alto del parlato normale. */
const MARGINE_DAI_NEGATIVI = 0.1;

/**
 * Soglia personale di scatto (v0.5.3, "strada veloce" per «Jarvis» detto da
 * solo): dai punteggi finali dei vostri esempi (il più alto di ognuno, col
 * verificatore) e dal più alto del vostro parlato normale.
 *
 * Il 10° percentile degli esempi (uno storto su venti non conta) per 0,8: il
 * punteggio sale lungo la parola, e una soglia più bassa di quella che la
 * vostra pronuncia raggiunge scatta uno o due frame (80-160 ms) prima, e
 * anche quando la dite più piano. Ma resta sopra il parlato normale di
 * almeno 0,1 e mai sotto 0,2. Se non c'è spazio tra i due: null, si resta
 * sulla soglia di serie (meglio lento che falsi scatti).
 */
export function sogliaPersonale(positivi: number[], negativoMassimo: number): number | null {
  if (positivi.length === 0) return null;
  const ordinati = [...positivi].sort((a, b) => a - b);
  const p10 = ordinati[Math.floor(ordinati.length * 0.1)] ?? 0;
  const proposta = Math.min(SOGLIA_PERSONALE_MASSIMA, Math.floor(p10 * 0.8 * 100) / 100);
  const minimo = Math.max(SOGLIA_PERSONALE_MINIMA, negativoMassimo + MARGINE_DAI_NEGATIVI);
  return proposta >= minimo ? proposta : null;
}
