import type { InferenceSession, Tensor } from "onnxruntime-web";

/**
 * Rilevatore della parola di attivazione ("Ehi Jarvis"). Per ora serve solo
 * alla PROVA DI FATTIBILITÀ (pagina prova-ehi-jarvis.html), non al pannello.
 *
 * Il modello è sostituibile: chi usa il rilevatore conosce solo l'interfaccia
 * `RilevatoreParola`. I modelli pre-addestrati di openWakeWord sono CC BY-NC-SA
 * 4.0 (non commerciali): per un servizio a pagamento servirà un altro modello
 * (es. microWakeWord, Apache 2.0) che implementi la stessa interfaccia. Anche la
 * parola mostrata viene dalla descrizione del modello, mai scritta nel codice.
 */
export interface RilevatoreParola {
  /** La parola come la si mostra ("Ehi Jarvis"). */
  readonly parola: string;
  /** Audio PCM 16 bit mono a 16 kHz, a pezzi di qualunque lunghezza. Un esito per ogni frame da 80 ms. */
  elabora(pcm: Int16Array): Promise<EsitoFrame[]>;
  /** Riparte da zero (dopo una pausa del microfono). */
  azzera(): Promise<void>;
}

export interface EsitoFrame {
  /** 0..1: quanto il modello è sicuro di aver sentito la parola. */
  punteggio: number;
  /**
   * Ingresso del classificatore: gli ultimi 16 embedding × 96, cioè
   * `preprocessor.get_features(16)` di openWakeWord. Serve al verificatore.
   */
  caratteristiche: Float32Array;
  /** Tempo di calcolo del frame (melspettrogramma + embedding + classificatore). */
  msCalcolo: number;
}

export interface DescrizioneModello {
  id: string;
  parola: string;
  /** Licenza dei pesi del modello, da mostrare. */
  licenza: string;
  commerciale: boolean;
}

/** Il minimo di onnxruntime-web che serve (così si prova anche in Node). */
export interface Ort {
  InferenceSession: { create(modello: Uint8Array | ArrayBuffer | string): Promise<InferenceSession> };
  Tensor: new (tipo: "float32", dati: Float32Array, forma: number[]) => Tensor;
}

// --- Costanti di openWakeWord 0.6.0 (openwakeword/utils.py e model.py) ---
/** Frame da 80 ms a 16 kHz. */
export const CAMPIONI_FRAME = 1280;
/** Contesto in più per il melspettrogramma: `[-n_samples-160*3:]`. */
const CONTESTO = 160 * 3;
/** Righe del melspettrogramma per un embedding. */
const FINESTRA_MEL = 76;
const RIGHE_MEL_MAX = 10 * 97;
const EMBEDDING_MAX = 120;
/** Le prime 5 previsioni valgono 0 (inizializzazione del modello). */
const PREVISIONI_A_ZERO = 5;

/**
 * openWakeWord nel browser, riga per riga come `AudioFeatures._streaming_features`
 * e `Model.predict` (openWakeWord 0.6.0), con i 3 modelli ONNX:
 *   audio → melspettrogramma (/10 + 2) → embedding (finestre da 76 righe, ogni 8)
 *   → classificatore sugli ultimi N embedding (N dal modello: 16 per hey_jarvis).
 * Verificato contro l'originale in Python sulle stesse clip (CLAUDE.md).
 */
export class RilevatoreOpenWakeWord implements RilevatoreParola {
  private coda = new Int16Array(0);
  /** Ultimi campioni per il contesto del melspettrogramma. */
  private readonly grezzi = new Int16Array(CAMPIONI_FRAME + CONTESTO);
  private campioniVisti = 0;
  private mel: Float32Array[] = [];
  private embedding: Float32Array[] = [];
  private previsioni = 0;
  private catena: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly ort: Ort,
    readonly descrizione: DescrizioneModello,
    private readonly melspettrogramma: InferenceSession,
    private readonly embedder: InferenceSession,
    private readonly classificatore: InferenceSession,
    private readonly finestreClassificatore: number,
    private readonly caso: () => number,
  ) {}

  get parola(): string {
    return this.descrizione.parola;
  }

  static async crea(
    ort: Ort,
    descrizione: DescrizioneModello,
    file: {
      melspettrogramma: Uint8Array | string;
      embedding: Uint8Array | string;
      classificatore: Uint8Array | string;
    },
    caso: () => number = Math.random,
  ): Promise<RilevatoreOpenWakeWord> {
    const [mel, emb, cls] = await Promise.all([
      ort.InferenceSession.create(file.melspettrogramma),
      ort.InferenceSession.create(file.embedding),
      ort.InferenceSession.create(file.classificatore),
    ]);
    // quanti embedding vuole il classificatore: la seconda dimensione del suo ingresso
    const forma = (cls.inputMetadata[0] as { shape?: readonly unknown[] } | undefined)?.shape;
    const finestre = typeof forma?.[1] === "number" ? forma[1] : 16;
    const r = new RilevatoreOpenWakeWord(ort, descrizione, mel, emb, cls, finestre, caso);
    await r.azzera();
    return r;
  }

  /** Come `AudioFeatures.reset()`: melspettrogramma a 1, embedding da 4 s di rumore. */
  async azzera(): Promise<void> {
    this.coda = new Int16Array(0);
    this.grezzi.fill(0);
    this.campioniVisti = 0;
    this.previsioni = 0;
    this.mel = Array.from({ length: FINESTRA_MEL }, () => new Float32Array(32).fill(1));
    const rumore = new Float32Array(16000 * 4).map(() => Math.floor(this.caso() * 2000) - 1000);
    const spettro = await this.melspettro(rumore);
    const finestre: Float32Array[][] = [];
    for (let i = 0; i + FINESTRA_MEL <= spettro.length; i += 8)
      finestre.push(spettro.slice(i, i + FINESTRA_MEL));
    this.embedding = await this.incorpora(finestre);
  }

  elabora(pcm: Int16Array): Promise<EsitoFrame[]> {
    // un frame alla volta, nell'ordine di arrivo
    const lavoro = this.catena.then(() => this.elaboraOra(pcm));
    // la catena va avanti anche dopo un errore; l'errore arriva comunque a chi ha chiamato
    this.catena = lavoro.catch((e: unknown) => e);
    return lavoro;
  }

  private async elaboraOra(pcm: Int16Array): Promise<EsitoFrame[]> {
    const tutto = new Int16Array(this.coda.length + pcm.length);
    tutto.set(this.coda);
    tutto.set(pcm, this.coda.length);
    const esiti: EsitoFrame[] = [];
    let inizio = 0;
    for (; inizio + CAMPIONI_FRAME <= tutto.length; inizio += CAMPIONI_FRAME)
      esiti.push(await this.frame(tutto.subarray(inizio, inizio + CAMPIONI_FRAME)));
    this.coda = tutto.slice(inizio);
    return esiti;
  }

  private async frame(frame: Int16Array): Promise<EsitoFrame> {
    const t0 = performance.now();
    // contesto: gli ultimi 1280+480 campioni (all'inizio solo quelli che ci sono)
    this.grezzi.copyWithin(0, CAMPIONI_FRAME);
    this.grezzi.set(frame, CONTESTO);
    this.campioniVisti += CAMPIONI_FRAME;
    const disponibili = Math.min(this.campioniVisti, this.grezzi.length);
    const ingresso = Float32Array.from(this.grezzi.subarray(this.grezzi.length - disponibili));

    this.mel.push(...(await this.melspettro(ingresso)));
    if (this.mel.length > RIGHE_MEL_MAX) this.mel.splice(0, this.mel.length - RIGHE_MEL_MAX);

    const finestra = this.mel.slice(-FINESTRA_MEL);
    if (finestra.length === FINESTRA_MEL) this.embedding.push(...(await this.incorpora([finestra])));
    if (this.embedding.length > EMBEDDING_MAX)
      this.embedding.splice(0, this.embedding.length - EMBEDDING_MAX);

    const ultimi = this.embedding.slice(-this.finestreClassificatore);
    const dati = new Float32Array(ultimi.length * 96);
    ultimi.forEach((e, i) => dati.set(e, i * 96));
    const valore = await this.classifica(dati);
    this.previsioni += 1;
    const punteggio = this.previsioni <= PREVISIONI_A_ZERO ? 0 : valore;
    return { punteggio, caratteristiche: dati, msCalcolo: performance.now() - t0 };
  }

  /**
   * Punteggio del classificatore su caratteristiche già calcolate (per esempio
   * quelle degli esempi registrati, se nel frattempo è cambiato il modello).
   */
  valuta(caratteristiche: Float32Array): Promise<number> {
    const lavoro = this.catena.then(() => this.classifica(caratteristiche));
    this.catena = lavoro.catch((e: unknown) => e);
    return lavoro;
  }

  private async classifica(dati: Float32Array): Promise<number> {
    const uscita = await this.classificatore.run({
      [this.classificatore.inputNames[0] ?? "input"]: new this.ort.Tensor("float32", dati, [
        1,
        dati.length / 96,
        96,
      ]),
    });
    const valore = uscita[this.classificatore.outputNames[0] ?? "output"]?.data[0];
    return typeof valore === "number" && Number.isFinite(valore) ? valore : 0;
  }

  /** Melspettrogramma con la trasformazione di openWakeWord (x/10 + 2): righe da 32. */
  private async melspettro(audio: Float32Array): Promise<Float32Array[]> {
    const uscita = await this.melspettrogramma.run({
      [this.melspettrogramma.inputNames[0] ?? "input"]: new this.ort.Tensor("float32", audio, [
        1,
        audio.length,
      ]),
    });
    const t = uscita[this.melspettrogramma.outputNames[0] ?? "output"];
    if (!t) throw new Error("melspettrogramma senza uscita");
    const dati = t.data as Float32Array;
    const righe: Float32Array[] = [];
    for (let i = 0; i + 32 <= dati.length; i += 32) righe.push(dati.slice(i, i + 32).map((v) => v / 10 + 2));
    return righe;
  }

  /** Embedding (96 valori) per ogni finestra da 76×32. */
  private async incorpora(finestre: Float32Array[][]): Promise<Float32Array[]> {
    if (finestre.length === 0) return [];
    const dati = new Float32Array(finestre.length * FINESTRA_MEL * 32);
    finestre.forEach((f, i) => f.forEach((riga, j) => dati.set(riga, (i * FINESTRA_MEL + j) * 32)));
    const uscita = await this.embedder.run({
      [this.embedder.inputNames[0] ?? "input_1"]: new this.ort.Tensor("float32", dati, [
        finestre.length,
        FINESTRA_MEL,
        32,
        1,
      ]),
    });
    const t = uscita[this.embedder.outputNames[0] ?? "output"];
    if (!t) throw new Error("embedding senza uscita");
    const valori = t.data as Float32Array;
    return finestre.map((_, i) => valori.slice(i * 96, (i + 1) * 96));
  }
}
