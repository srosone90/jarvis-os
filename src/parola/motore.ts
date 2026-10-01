/**
 * Motore della parola «Jarvis» (v0.5.0), caricato SOLO quando serve con un
 * `import()`: onnxruntime-web e i modelli pesano ~17 MB e stanno in `parola/`,
 * fuori dal bundle iniziale del pannello (scripts/dopo-build.mjs) e in una
 * cache a parte del service worker, che si riscarica solo se cambiano.
 *
 * Qui: rilevatore openWakeWord, verificatore della pronuncia di casa
 * (addestrato sul dispositivo o condiviso da `parola.json`) e la registrazione
 * guidata di "Insegna a Jarvis la tua pronuncia", ripresa dalla pagina di prova
 * del 30/09 (CLAUDE.md, "Verificatore della pronuncia").
 */
import * as ort from "onnxruntime-web/wasm";
import urlEmbedding from "../../modelli/openwakeword/embedding_model.onnx?url";
import urlClassificatore from "../../modelli/openwakeword/hey_jarvis_v0.1.onnx?url";
import urlMel from "../../modelli/openwakeword/melspectrogram.onnx?url";
import { descriviErrore, log } from "../diagnostica/log";
import { ArchivioParola, verificatoreValido, type Esempio } from "./archivio";
import { caricaImpostazioni } from "./impostazioni";
import {
  CAMPIONI_FRAME,
  RilevatoreOpenWakeWord,
  type DescrizioneModello,
  type EsitoFrame,
} from "./rilevatore";
import {
  addestra,
  punteggioFinale,
  scegliNegativi,
  scegliPositivi,
  SOGLIA_BASE_PREDEFINITA,
  sogliaBaseConsigliata,
  sogliaPersonale,
  type FrameRegistrato,
  type Verificatore,
} from "./verificatore";

/** Il modello di serie. `parola.json` accanto alla pagina può indicarne un altro. */
const MODELLO_DI_SERIE: DescrizioneModello = {
  id: "hey_jarvis_v0.1",
  parola: "Jarvis",
  licenza: "CC BY-NC-SA 4.0",
  commerciale: false,
};
export const SOGLIA_DI_SERIE = 0.5;

/** Frame da 80 ms: 12,5 al secondo. */
const FRAME_AL_SECONDO = 16000 / CAMPIONI_FRAME;
/** Registrazione: un invito ogni 3 s, il primo dopo 1,5 s; si guarda la finestra di 2,5 s dopo l'invito. */
const FRAME_TRA_INVITI = Math.round(3 * FRAME_AL_SECONDO);
const FRAME_FINESTRA = Math.round(2.5 * FRAME_AL_SECONDO);
const FRAME_PRIMA_DEL_PRIMO = Math.round(1.5 * FRAME_AL_SECONDO);
/** Audio tenuto per riascoltare un esempio: 0,5 s prima dell'invito + la finestra. */
const CAMPIONI_PRIMA = 8000;

export interface EsitoParola {
  /** Punteggio finale (dal verificatore, se ha deciso lui). */
  punteggio: number;
  /** Punteggio del modello di base. */
  base: number;
  verificato: boolean;
  /** Tempo di calcolo del frame. */
  ms: number;
}

export interface StatoRegistrazione {
  tipo: "parola" | "normale";
  persona: string;
  quanti: number;
  fatti: number;
  /** Cosa dire a schermo adesso, e se è il momento di parlare. */
  invito: string;
  adesso: boolean;
}

export interface RiepilogoEsempi {
  persone: { nome: string; esempi: number; massimoMedio: number }[];
  secondiNormale: number;
}

interface Registrazione {
  tipo: "parola" | "normale";
  persona: string;
  frame: FrameRegistrato[];
  pcm: Int16Array[];
  quanti: number;
  fatti: number;
  prossimoInvito: number;
  inAttesa: number[];
  frameFine: number;
  invito: string;
  adesso: boolean;
}

export class MotoreParola {
  private verificatore: Verificatore | null = null;
  private origineVerificatore = "";
  private sogliaBase = SOGLIA_BASE_PREDEFINITA;
  /** Scelta da parola.json: allora non la si cambia più da soli. */
  private sogliaBaseScelta = false;
  private registrazione: Registrazione | null = null;
  private readonly ascoltatori = new Set<() => void>();

  private constructor(
    private readonly rilevatore: RilevatoreOpenWakeWord,
    readonly modello: DescrizioneModello,
    /** Soglia scelta in parola.json: vince su quella personale. */
    private readonly sogliaDaFile: number | undefined,
    private readonly archivio: ArchivioParola | null,
    /** Cosa si è letto da parola.json, in parole (per la diagnostica). */
    readonly fonteImpostazioni: string,
    readonly msCaricamento: number,
  ) {}

  static async crea(): Promise<MotoreParola> {
    const t0 = performance.now();
    const { impostazioni, trovato, avvisi } = await caricaImpostazioni();
    for (const a of avvisi) log.avviso(`parola.json: ${a}`);
    let modello = MODELLO_DI_SERIE;
    let urlModello: string = urlClassificatore;
    if (impostazioni.modello) {
      const { url, ...descrizione } = impostazioni.modello;
      modello = descrizione;
      urlModello = new URL(url, location.href).href;
    }
    // un solo thread: su HA non ci sono gli header per SharedArrayBuffer (e sui telefoni vecchi è meglio)
    ort.env.wasm.numThreads = 1;
    const rilevatore = await RilevatoreOpenWakeWord.crea(ort, modello, {
      melspettrogramma: urlMel,
      embedding: urlEmbedding,
      classificatore: urlModello,
    });
    let archivio: ArchivioParola | null = null;
    try {
      archivio = await ArchivioParola.apri();
    } catch (errore) {
      log.avviso(
        `Parola: archivio locale non disponibile (${descriviErrore(errore)}): niente pronuncia di casa`,
      );
    }
    const fonte = trovato
      ? `parola.json (${
          [
            impostazioni.modello ? `modello ${impostazioni.modello.id}` : null,
            impostazioni.soglia !== undefined ? `soglia ${impostazioni.soglia}` : null,
            impostazioni.sogliaBase !== undefined ? `soglia base ${impostazioni.sogliaBase}` : null,
            impostazioni.verificatore ? "verificatore condiviso" : null,
          ]
            .filter(Boolean)
            .join(", ") || "vuoto"
        })`
      : "valori di serie";
    const motore = new MotoreParola(
      rilevatore,
      modello,
      impostazioni.soglia,
      archivio,
      fonte,
      performance.now() - t0,
    );
    if (impostazioni.sogliaBase !== undefined) {
      motore.sogliaBase = impostazioni.sogliaBase;
      motore.sogliaBaseScelta = true;
    }
    await motore.preparaVerificatore(impostazioni.verificatore);
    // esempi e pronuncia stanno nella memoria del browser DI QUESTO indirizzo (v0.5.1)
    const r = await motore.riepilogo().catch((errore: unknown) => {
      log.avviso(`Parola: esempi salvati non letti: ${descriviErrore(errore)}`);
      return null;
    });
    if (r)
      log.info(
        `Parola: su ${location.host} ${r.persone.reduce((n, p) => n + p.esempi, 0)} esempi della parola` +
          `${r.persone.length ? ` (${r.persone.map((p) => p.nome).join(", ")})` : ""}, ` +
          `${Math.round(r.secondiNormale)} s di parlato normale`,
      );
    log.info(
      `Parola: modello ${modello.id} («${modello.parola}») pronto in ${Math.round(motore.msCaricamento)} ms, ${fonte}, verificatore ${motore.descriviVerificatore()}`,
    );
    return motore;
  }

  get parola(): string {
    return this.modello.parola;
  }
  /**
   * Soglia di scatto: quella di parola.json, se c'è; altrimenti quella
   * personale calcolata dagli esempi (v0.5.3, strada veloce); altrimenti 0,5.
   */
  get soglia(): number {
    return this.sogliaDaFile ?? this.verificatore?.soglia ?? SOGLIA_DI_SERIE;
  }
  /** Da dove viene la soglia, in parole (Impostazioni → Voce). */
  get origineSoglia(): string {
    if (this.sogliaDaFile !== undefined) return "da parola.json";
    if (this.verificatore?.soglia !== undefined) return "personale, dai vostri esempi";
    return "di serie";
  }
  get inRegistrazione(): StatoRegistrazione | null {
    const r = this.registrazione;
    return r
      ? {
          tipo: r.tipo,
          persona: r.persona,
          quanti: r.quanti,
          fatti: r.fatti,
          invito: r.invito,
          adesso: r.adesso,
        }
      : null;
  }
  get haVerificatore(): boolean {
    return this.verificatore !== null;
  }
  get archivioDisponibile(): boolean {
    return this.archivio !== null;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Audio a 16 kHz, pezzi di qualunque lunghezza: un esito ogni 80 ms. */
  async elabora(pcm: Int16Array): Promise<EsitoParola[]> {
    const esiti = await this.rilevatore.elabora(pcm);
    if (this.registrazione?.tipo === "parola") this.registrazione.pcm.push(pcm);
    return esiti.map((e) => this.suFrame(e));
  }

  /** Riparte da zero (dopo una pausa del microfono). */
  azzera(): Promise<void> {
    return this.rilevatore.azzera();
  }

  descriviVerificatore(): string {
    const v = this.verificatore;
    if (!v) return "nessuno";
    const i = v.info;
    return (
      `${this.origineVerificatore}: ${i.positivi} esempi della parola` +
      `${i.persone.length ? ` (${i.persone.join(", ")})` : ""} e ${i.negativi} di parlato normale, ` +
      `soglia base ${this.sogliaBase.toFixed(3).replace(".", ",")}, ` +
      `soglia di scatto ${this.soglia.toFixed(2).replace(".", ",")} (${this.origineSoglia})`
    );
  }

  private suFrame(e: EsitoFrame): EsitoParola {
    const { punteggio, verificato } = punteggioFinale(
      e.punteggio,
      e.caratteristiche,
      this.verificatore,
      this.sogliaBase,
    );
    if (this.registrazione) this.suFrameRegistrato(e);
    return { punteggio, base: e.punteggio, verificato, ms: e.msCalcolo };
  }

  // --- verificatore -------------------------------------------------------------

  private async preparaVerificatore(condiviso: string | undefined): Promise<void> {
    try {
      const locale = (await this.archivio?.verificatore()) ?? null;
      if (locale) this.impostaVerificatore(locale, "addestrato su questo dispositivo");
    } catch (errore) {
      log.avviso(`Parola: verificatore salvato non letto: ${descriviErrore(errore)}`);
    }
    await this.aggiornaSogliaBase();
    // quello condiviso da parola.json vale solo se qui non ce n'è uno
    if (this.verificatore || !condiviso) return;
    try {
      const risposta = await fetch(condiviso, { cache: "no-store" });
      const v = (await risposta.json()) as unknown;
      if (!risposta.ok || !verificatoreValido(v)) throw new Error(`risposta ${risposta.status} non valida`);
      this.impostaVerificatore(v, `condiviso (${condiviso})`);
    } catch (errore) {
      log.avviso(`Parola: verificatore di parola.json non caricato: ${descriviErrore(errore)}`);
    }
  }

  private impostaVerificatore(v: Verificatore | null, origine: string): void {
    this.verificatore = v;
    this.origineVerificatore = origine;
    if (v && v.modello !== this.modello.id)
      log.avviso(`Parola: il verificatore è del modello ${v.modello}, ora è attivo ${this.modello.id}`);
  }

  /**
   * Soglia base dalla pronuncia di casa: con una soglia sopra i punteggi dei
   * vostri esempi il verificatore non verrebbe mai consultato.
   */
  private async aggiornaSogliaBase(): Promise<void> {
    if (!this.archivio || this.sogliaBaseScelta) return;
    const massimi = (await this.archivio.elenco()).filter((e) => e.tipo === "parola").map((e) => e.massimo);
    if (massimi.length) this.sogliaBase = sogliaBaseConsigliata(massimi);
  }

  async riepilogo(): Promise<RiepilogoEsempi> {
    const elenco: Esempio[] = (await this.archivio?.elenco()) ?? [];
    const persone = new Map<string, number[]>();
    for (const e of elenco.filter((x) => x.tipo === "parola"))
      persone.set(e.persona, [...(persone.get(e.persona) ?? []), e.massimo]);
    return {
      persone: [...persone].map(([nome, m]) => ({
        nome,
        esempi: m.length,
        massimoMedio: m.reduce((s, x) => s + x, 0) / m.length,
      })),
      secondiNormale: elenco.filter((x) => x.tipo === "normale").reduce((s, e) => s + e.secondi, 0),
    };
  }

  /** Cancella gli esempi di una persona, o il parlato normale (`null`). Il verificatore resta. */
  async cancella(persona: string | null): Promise<void> {
    if (!this.archivio) return;
    const elenco = await this.archivio.elenco();
    const ids = elenco
      .filter((e) => (persona === null ? e.tipo === "normale" : e.tipo === "parola" && e.persona === persona))
      .map((e) => e.id);
    await this.archivio.cancella(ids);
    log.info(`Parola: cancellati ${persona === null ? "il parlato normale" : `gli esempi di ${persona}`}`);
    this.notifica();
  }

  /** Tutti gli esempi e il verificatore di questo dispositivo. */
  async svuota(): Promise<void> {
    await this.archivio?.svuota();
    this.impostaVerificatore(null, "");
    log.info("Parola: esempi e verificatore cancellati");
    this.notifica();
  }

  /** Addestra il verificatore sugli esempi salvati. Ritorna cosa è successo, in parole. */
  async addestra(avanzamento?: (passo: number) => void): Promise<string> {
    if (!this.archivio) return "Archivio locale non disponibile.";
    if (this.registrazione) return "Aspetta la fine della registrazione.";
    const t0 = performance.now();
    await this.aggiornaSogliaBase();
    const esempi = await this.archivio.elenco();
    const positivi: Float32Array[] = [];
    const negativi: FrameRegistrato[] = [];
    /** I frame di ogni esempio della parola, per la soglia personale. */
    const perEsempio: FrameRegistrato[][] = [];
    for (const e of esempi) {
      const d = await this.archivio.dati(e.id);
      if (!d) continue;
      // punteggi di un altro modello base: si rifanno dalle caratteristiche
      if (e.modello !== this.modello.id)
        for (const f of d.frame) f.punteggio = await this.rilevatore.valuta(f.caratteristiche);
      if (e.tipo === "parola") {
        positivi.push(...scegliPositivi(d.frame, this.sogliaBase));
        perEsempio.push(d.frame);
      } else negativi.push(...d.frame);
    }
    if (!positivi.length) return "Registra prima gli esempi della parola.";
    if (!negativi.length) return "Registra prima un po' di parlato normale.";
    const persone = [...new Set(esempi.filter((e) => e.tipo === "parola").map((e) => e.persona))];
    const v = await addestra(
      positivi,
      scegliNegativi(negativi),
      { modello: this.modello.id, persone },
      {
        avanzamento: async (i) => {
          avanzamento?.(i);
          await new Promise((ok) => setTimeout(ok, 0));
        },
      },
    );
    // strada veloce (v0.5.3): la soglia di scatto dai punteggi finali dei vostri esempi
    const finale = (f: FrameRegistrato): number =>
      punteggioFinale(f.punteggio, f.caratteristiche, v, this.sogliaBase).punteggio;
    const massimiEsempi = perEsempio.map((frame) => Math.max(0, ...frame.map(finale)));
    let negativoMassimo = 0;
    for (const f of negativi) negativoMassimo = Math.max(negativoMassimo, finale(f));
    const soglia = sogliaPersonale(massimiEsempi, negativoMassimo);
    if (soglia !== null) v.soglia = soglia;
    const f2 = (n: number): string => n.toFixed(2).replace(".", ",");
    log.info(
      `Parola: soglia personale ${soglia === null ? "non calcolabile (parlato normale troppo vicino), resta quella di serie" : f2(soglia)}; ` +
        `esempi da ${f2(Math.min(...massimiEsempi))} a ${f2(Math.max(...massimiEsempi))}, parlato normale fino a ${f2(negativoMassimo)}`,
    );
    await this.archivio.salvaVerificatore(v);
    this.impostaVerificatore(v, "addestrato su questo dispositivo");
    const secondi = ((performance.now() - t0) / 1000).toFixed(1).replace(".", ",");
    const testo =
      `Pronuncia imparata in ${secondi} s: ${v.info.positivi} esempi della parola e ${v.info.negativi} di parlato normale, riconosciuti bene il ${Math.round(v.info.accuratezza * 100)}%. ` +
      (soglia === null
        ? "Soglia di scatto di serie: il parlato normale somiglia troppo ai tuoi esempi."
        : `Soglia di scatto personale: ${f2(soglia)}${this.sogliaDaFile !== undefined ? " (ma vale quella di parola.json)" : ""}.`);
    log.info(`Parola: ${testo}`);
    this.notifica();
    return testo;
  }

  // --- registrazione guidata ----------------------------------------------------

  /** Inizia a registrare: `quanti` esempi della parola, o `secondi` di parlato normale. */
  iniziaRegistrazione(tipo: "parola" | "normale", persona: string, quanti = 20, secondi = 60): boolean {
    if (this.registrazione || !this.archivio) return false;
    this.registrazione = {
      tipo,
      persona: tipo === "parola" ? persona : "",
      frame: [],
      pcm: [],
      quanti,
      fatti: 0,
      prossimoInvito: FRAME_PRIMA_DEL_PRIMO,
      inAttesa: [],
      frameFine: tipo === "normale" ? Math.round(secondi * FRAME_AL_SECONDO) : Infinity,
      invito:
        tipo === "parola"
          ? `Preparati: tra poco «${this.parola}» (1/${quanti})`
          : `Parla normalmente o lascia la TV accesa, senza dire «${this.parola}»`,
      adesso: false,
    };
    log.info(
      tipo === "parola"
        ? `Parola: registro ${quanti} «${this.parola}» di ${persona}`
        : `Parola: registro ${secondi} s di parlato normale`,
    );
    this.notifica();
    return true;
  }

  /** Microfono fermato o tocco su Annulla: la registrazione si butta (gli esempi già salvati restano). */
  annullaRegistrazione(motivo: string): void {
    const r = this.registrazione;
    if (!r) return;
    this.registrazione = null;
    for (const p of r.pcm) p.fill(0);
    log.info(
      r.tipo === "parola"
        ? `Parola: registrazione interrotta (${motivo}), salvati ${r.fatti} esempi su ${r.quanti}`
        : `Parola: registrazione del parlato normale interrotta (${motivo}), non salvata`,
    );
    this.notifica();
  }

  private suFrameRegistrato(esito: EsitoFrame): void {
    const r = this.registrazione;
    if (!r) return;
    const indice = r.frame.length;
    r.frame.push({ punteggio: esito.punteggio, caratteristiche: esito.caratteristiche });
    if (r.tipo === "normale") {
      const mancano = Math.max(0, Math.ceil((r.frameFine - indice) / FRAME_AL_SECONDO));
      if (indice % 6 === 0) {
        r.invito = `Parla normalmente o lascia la TV accesa · mancano ${mancano} s`;
        this.notifica();
      }
      if (indice + 1 >= r.frameFine) void this.chiudiRegistrazione();
      return;
    }
    // inviti: ogni 3 s "di' Jarvis adesso", poi 2,5 s di ascolto per quell'esempio
    if (indice === r.prossimoInvito && r.fatti + r.inAttesa.length < r.quanti) {
      r.inAttesa.push(indice);
      r.invito = `Di' «${this.parola}» adesso · ${r.fatti + r.inAttesa.length}/${r.quanti}`;
      r.adesso = true;
      r.prossimoInvito += FRAME_TRA_INVITI;
      this.notifica();
    } else if (
      r.inAttesa.length &&
      indice === (r.inAttesa.at(-1) ?? 0) + Math.round(1.2 * FRAME_AL_SECONDO)
    ) {
      r.invito =
        r.fatti + r.inAttesa.length < r.quanti
          ? `… (${r.fatti + r.inAttesa.length + 1}/${r.quanti} tra poco)`
          : "… ultimo esempio";
      r.adesso = false;
      this.notifica();
    }
    const primo = r.inAttesa[0];
    if (primo !== undefined && indice >= primo + FRAME_FINESTRA) {
      r.inAttesa.shift();
      void this.salvaEsempioParola(r, primo);
    }
  }

  private async salvaEsempioParola(r: Registrazione, invito: number): Promise<void> {
    const finestra = r.frame.slice(invito, invito + FRAME_FINESTRA);
    // dall'inizio della registrazione i frame sono allineati ai campioni (±80 ms)
    const fineInvito = (invito + 1) * CAMPIONI_FRAME;
    const pcm = ritaglia(
      r.pcm,
      Math.max(0, fineInvito - CAMPIONI_PRIMA),
      fineInvito + FRAME_FINESTRA * CAMPIONI_FRAME,
    );
    const massimo = Math.max(...finestra.map((f) => f.punteggio));
    r.fatti += 1;
    try {
      await this.archivio?.salva(
        {
          tipo: "parola",
          persona: r.persona,
          creato: Date.now(),
          secondi: pcm.length / 16000,
          massimo,
          frame: finestra.length,
          modello: this.modello.id,
        },
        pcm,
        finestra,
      );
    } catch (errore) {
      log.avviso(`Parola: esempio non salvato: ${descriviErrore(errore)}`);
    }
    this.notifica();
    if (r.fatti >= r.quanti) await this.chiudiRegistrazione();
  }

  private async chiudiRegistrazione(): Promise<void> {
    const r = this.registrazione;
    if (!r) return;
    this.registrazione = null;
    if (r.tipo === "normale") {
      try {
        await this.archivio?.salva(
          {
            tipo: "normale",
            persona: "",
            creato: Date.now(),
            secondi: r.frame.length / FRAME_AL_SECONDO,
            massimo: Math.max(0, ...r.frame.map((f) => f.punteggio)),
            frame: r.frame.length,
            modello: this.modello.id,
          },
          null, // del parlato normale NON si tiene l'audio
          r.frame,
        );
        log.info(
          `Parola: parlato normale salvato, ${Math.round(r.frame.length / FRAME_AL_SECONDO)} s (solo numeri)`,
        );
      } catch (errore) {
        log.avviso(`Parola: parlato normale non salvato: ${descriviErrore(errore)}`);
      }
    } else log.info(`Parola: registrazione finita, ${r.fatti} esempi di ${r.persona}`);
    for (const p of r.pcm) p.fill(0);
    await this.aggiornaSogliaBase();
    this.notifica();
  }

  /** L'ultimo esempio di una persona, per riascoltarlo. */
  async ultimoEsempio(persona: string): Promise<Int16Array | null> {
    const ultimo = ((await this.archivio?.elenco()) ?? [])
      .filter((x) => x.tipo === "parola" && x.persona === persona)
      .at(-1);
    return ultimo ? ((await this.archivio?.dati(ultimo.id))?.pcm ?? null) : null;
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Parola: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}

/** I campioni [da, a) dei pezzi messi in fila, senza ricopiare tutto. */
function ritaglia(pezzi: Int16Array[], da: number, a: number): Int16Array {
  const uscita = new Int16Array(Math.max(0, a - da));
  let inizio = 0;
  for (const p of pezzi) {
    const fine = inizio + p.length;
    if (fine > da && inizio < a) {
      const s = Math.max(da, inizio);
      uscita.set(p.subarray(s - inizio, Math.min(a, fine) - inizio), s - da);
    }
    inizio = fine;
    if (inizio >= a) break;
  }
  return uscita.subarray(0, Math.max(0, Math.min(a, inizio) - da));
}
