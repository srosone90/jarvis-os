import type { FrameRegistrato, Verificatore } from "./verificatore";

/**
 * Archivio degli esempi di voce e del verificatore: SOLO sul dispositivo
 * (IndexedDB del browser), mai inviati a Home Assistant né altrove. Si
 * cancellano da qui (pagina di prova) o cancellando i dati del sito.
 *
 * - Esempi della parola: audio (per riascoltarli e buttare quelli venuti male)
 *   + caratteristiche e punteggio di ogni frame dopo l'invito.
 * - Parlato normale / TV: solo le caratteristiche, NIENTE audio: al
 *   verificatore bastano quelle, e di voce registrata ne teniamo il meno possibile.
 */
export interface Esempio {
  id: number;
  tipo: "parola" | "normale";
  persona: string;
  creato: number;
  /** Secondi di audio coperti. */
  secondi: number;
  /** Punteggio più alto del modello base nell'esempio. */
  massimo: number;
  /** Quanti frame (caratteristiche) contiene. */
  frame: number;
  /** Modello base che ha dato i punteggi (se cambia, si ricalcolano dalle caratteristiche). */
  modello: string;
}

interface Dati {
  id: number;
  pcm: ArrayBuffer | null;
  frame: FrameRegistrato[];
}

const NOME = "jarvis-parola";
const VERSIONE = 1;

function richiesta<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error ?? new Error("errore IndexedDB"));
  });
}

function fine(t: IDBTransaction): Promise<void> {
  return new Promise((ok, ko) => {
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error ?? new Error("errore IndexedDB"));
    t.onabort = () => ko(t.error ?? new Error("transazione annullata"));
  });
}

export class ArchivioParola {
  private constructor(private readonly db: IDBDatabase) {}

  static apri(): Promise<ArchivioParola> {
    return new Promise((ok, ko) => {
      const r = indexedDB.open(NOME, VERSIONE);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("esempi", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("dati", { keyPath: "id" });
        db.createObjectStore("verificatori");
      };
      r.onsuccess = () => ok(new ArchivioParola(r.result));
      r.onerror = () => ko(r.error ?? new Error("IndexedDB non disponibile"));
      r.onblocked = () => ko(new Error("archivio bloccato da un'altra scheda aperta"));
    });
  }

  async salva(
    esempio: Omit<Esempio, "id">,
    pcm: Int16Array | null,
    frame: FrameRegistrato[],
  ): Promise<number> {
    const t = this.db.transaction(["esempi", "dati"], "readwrite");
    const id = await richiesta(t.objectStore("esempi").add(esempio));
    const dati: Dati = {
      id: id as number,
      pcm: pcm ? pcm.slice().buffer : null,
      frame: frame.map((f) => ({ punteggio: f.punteggio, caratteristiche: f.caratteristiche.slice() })),
    };
    t.objectStore("dati").put(dati);
    await fine(t);
    return id as number;
  }

  async elenco(): Promise<Esempio[]> {
    return richiesta(this.db.transaction("esempi").objectStore("esempi").getAll() as IDBRequest<Esempio[]>);
  }

  async dati(id: number): Promise<{ pcm: Int16Array | null; frame: FrameRegistrato[] } | null> {
    const d = await richiesta(
      this.db.transaction("dati").objectStore("dati").get(id) as IDBRequest<Dati | undefined>,
    );
    return d ? { pcm: d.pcm ? new Int16Array(d.pcm) : null, frame: d.frame } : null;
  }

  async cancella(ids: number[]): Promise<void> {
    const t = this.db.transaction(["esempi", "dati"], "readwrite");
    for (const id of ids) {
      t.objectStore("esempi").delete(id);
      t.objectStore("dati").delete(id);
    }
    await fine(t);
  }

  /** Cancella TUTTO: esempi, audio, caratteristiche e verificatore. */
  async svuota(): Promise<void> {
    const t = this.db.transaction(["esempi", "dati", "verificatori"], "readwrite");
    t.objectStore("esempi").clear();
    t.objectStore("dati").clear();
    t.objectStore("verificatori").clear();
    await fine(t);
  }

  async verificatore(): Promise<Verificatore | null> {
    const v = await richiesta(
      this.db.transaction("verificatori").objectStore("verificatori").get("locale") as IDBRequest<
        Verificatore | undefined
      >,
    );
    return v ?? null;
  }

  async salvaVerificatore(v: Verificatore | null): Promise<void> {
    const t = this.db.transaction("verificatori", "readwrite");
    if (v) t.objectStore("verificatori").put(v, "locale");
    else t.objectStore("verificatori").delete("locale");
    await fine(t);
  }
}

/** Controllo minimo di un verificatore importato da file o da indirizzo. */
export function verificatoreValido(v: unknown): v is Verificatore {
  const x = v as Partial<Verificatore> | null;
  return (
    !!x &&
    x.versione === 1 &&
    Array.isArray(x.pesi) &&
    Array.isArray(x.media) &&
    Array.isArray(x.scala) &&
    x.pesi.length > 0 &&
    x.pesi.length === x.media.length &&
    x.pesi.length === x.scala.length &&
    x.pesi.every(Number.isFinite) &&
    typeof x.intercetta === "number" &&
    Number.isFinite(x.intercetta) &&
    // soglia personale (v0.5.3): facoltativa, ma se c'è dev'essere una soglia vera
    (x.soglia === undefined || (typeof x.soglia === "number" && x.soglia > 0 && x.soglia < 1))
  );
}
