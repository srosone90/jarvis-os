import type { Assistente } from "../assistente/assistente";
import { messaggioMicrofono, problemaDaErrore, type MessaggioMicrofono } from "../assistente/messaggi";
import { descriviErrore, log } from "../diagnostica/log";
import type { Timer } from "../timer/timer";
import { Microfono, MicrofonoNonDisponibile } from "../voce/microfono";
import type { MicrofonoCondiviso } from "../voce/microfono-condiviso";
import type { DoveVoce, Voce } from "../voce/voce";
import type { Presenza } from "../fotocamera/presenza";
import { RilevaParlato } from "../voce/parlato";
import { MemoriaCircolare } from "./memoria";
import type { EsitoParola, MotoreParola } from "./motore";
import { DecisioneScatto, type CambioSoglia, type Soglie } from "./decisione";
import { contestoPrima, inizioRichiesta } from "./inizio-frase";
import {
  leggiPreferenzeParola,
  opzioniDecisione,
  PREFERENZE_PAROLA_DI_SERIE,
  type PreferenzeParola,
} from "./preferenze";
import { eComandoStop } from "./stop";

/**
 * «Jarvis» sempre in ascolto (v0.5.0, decisioni del 30/09 in CLAUDE.md).
 *
 *  - Il microfono resta aperto e l'audio passa dal motore della parola, sul
 *    dispositivo. Una memoria circolare di 60 s, SOLO in RAM, tiene la frase
 *    in cui la parola è detta: allo scatto va a HA dal suo INIZIO (l'ultima
 *    pausa di almeno 1 s negli ultimi 10 s, `inizioRichiesta`) insieme
 *    all'audio dal vivo (v0.5.2: "C'è freddo qui, cosa ne pensi, Jarvis?"
 *    arriva intera).
 *  - Il parlato PRIMA di quella frase (v0.5.3, "persona sempre presente") va
 *    a HA solo allo scatto, con una pipeline a parte (`inviaContesto`): il
 *    server lo trascrive e lo dà a Gemini come contesto. Se prima nessuno
 *    parlava, non si manda niente.
 *  - Allo scatto parte la pipeline normale (stt → tts) SENZA `no_vad`: la
 *    fine della frase la decide jarvis_voce, tarato sul server.
 *  - Mentre suona un timer la parola zittisce la suoneria; «stop», «basta» o
 *    «ferma» lo chiudono, altrimenti è una domanda (scelta di Salvatore, 30/09).
 *  - Acceso di serie; si spegne in Impostazioni → Voce. Indicatore sempre
 *    visibile mentre ascolta.
 *  - Android: il microfono vive solo con la pagina in primo piano e lo schermo
 *    acceso. Wake Lock mentre ascolta, e ripresa quando la pagina torna visibile.
 */
export type StatoAscolto = "spento" | "carica" | "ascolta" | "fermo" | "nonDisponibile";

const CHIAVE = "jarvis-parola";
/**
 * Memoria circolare: 60 s (v0.5.3, annulla i 10 s della v0.5.2). Il minuto
 * PRIMA di «Jarvis» è un requisito di Salvatore. Solo RAM, mai inviata se la
 * parola non scatta; si svuota con «Jarvis» spento e a ogni riavvio.
 */
export const SECONDI_MEMORIA = 60;
/** Dopo uno scatto, per quanto non se ne conta un altro (una frase = una domanda). */
export const PAUSA_DOPO_SCATTO_MS = 2000;
/** Dopo la risposta di Jarvis: la coda dell'audio dall'altoparlante non deve farlo ripartire. */
export const PAUSA_DOPO_VOCE_MS = 1500;
/** Indicatore dal vivo delle impostazioni: il punteggio più alto di questa finestra. */
export const FINESTRA_DAL_VIVO_MS = 3000;
/**
 * Riepilogo nel registro (v0.5.1): ogni 30 s nei primi 10 minuti di ascolto e
 * ogni volta che qualcosa somiglia alla parola (≥ 0,05); dopo, uno ogni 10
 * minuti. Il registro tiene 200 voci: un riepilogo fisso ogni 30 s le
 * riempirebbe in meno di due ore, buttando via gli errori veri.
 */
export const RIEPILOGO_OGNI_MS = 30_000;
export const RIEPILOGO_FITTO_PER_MS = 10 * 60_000;
export const RIEPILOGO_RADO_OGNI_MS = 10 * 60_000;
export const RIEPILOGO_SE_ALMENO = 0.05;

/** Il riepilogo di questa finestra va nel registro? Logica pura. */
export function riepilogoDaScrivere(
  massimo: number,
  daInizioAscolto: number,
  daUltimoScritto: number,
): boolean {
  if (daInizioAscolto < RIEPILOGO_FITTO_PER_MS || massimo >= RIEPILOGO_SE_ALMENO) return true;
  return daUltimoScritto >= RIEPILOGO_RADO_OGNI_MS;
}

export interface DalVivo {
  /** Punteggio finale più alto degli ultimi 3 s. */
  punteggio: number;
  /** Punteggio del modello di base più alto degli ultimi 3 s. */
  base: number;
  /** Livello del microfono adesso (0..1). */
  livello: number;
  soglia: number;
}

/** Se il dispositivo resta indietro di tanto, si butta l'audio vecchio (e lo si dice). */
const RITARDO_MASSIMO_FRAME = 25;

export interface DipendenzeAscolto {
  micro: Pick<MicrofonoCondiviso, "apriContinuo" | "chiudiContinuo" | "livello">;
  /** Il contesto prima della frase va a HA da qui (v0.5.3). */
  assistente: Pick<Assistente, "inviaContesto" | "occupato">;
  voce: Pick<Voce, "attiva" | "fase" | "ascolta" | "parla">;
  timer: Pick<Timer, "suonano" | "silenzia" | "ferma">;
  /**
   * La fotocamera (v0.6.0): AIUTA l'attivazione, non la limita mai. Con
   * qualcuno vicino al pannello la soglia scende di un passo; chi guarda il
   * tablet può parlare senza «Jarvis». Nessuno visibile = come prima.
   */
  presenza?: Pick<Presenza, "scontoSoglia" | "staGuardando">;
  /** Carica il motore (di serie con un import() pigro: onnxruntime e modelli non sono nel bundle iniziale). */
  carica?: () => Promise<MotoreParola>;
  adesso?: () => number;
}

export interface Statistiche {
  frame: number;
  scartati: number;
  msMedio: number;
  scatti: number;
  ultimoScatto: number | null;
  /** Punteggio più alto degli ultimi ~2 s (per vedere se "ci era vicino"). */
  punteggioRecente: number;
}

export function leggiAcceso(grezzo: string | null): boolean {
  return leggiPreferenzeParola(grezzo).acceso;
}

/** Suono breve allo scatto (v0.5.3): acceso di serie, come un Echo. */
export function leggiSuono(grezzo: string | null): boolean {
  return leggiPreferenzeParola(grezzo).suono;
}

/** Si può far partire uno scatto adesso? Logica pura, provata a parte. */
export function puoScattare(
  e: Pick<EsitoParola, "punteggio">,
  soglia: number,
  adesso: number,
  ultimoScatto: number,
  voceAttiva: boolean,
  fineVoce: number,
  inRegistrazione: boolean,
): boolean {
  if (inRegistrazione || voceAttiva || e.punteggio < soglia) return false;
  if (adesso - ultimoScatto < PAUSA_DOPO_SCATTO_MS) return false;
  return adesso - fineVoce >= PAUSA_DOPO_VOCE_MS;
}

export class AscoltoParola {
  private statoAttuale: StatoAscolto = "spento";
  private problemaMic: MessaggioMicrofono | null = null;
  private pref: PreferenzeParola;
  /** Conferma su più frame e soglia che si adatta ai falsi scatti (v0.5.4). */
  private readonly decisione: DecisioneScatto;
  private caricamento: Promise<MotoreParola> | null = null;
  private motoreCaricato: MotoreParola | null = null;
  private readonly memoria = new MemoriaCircolare(SECONDI_MEMORIA);
  private inCoda = 0;
  private ultimoScatto = -Infinity;
  /** Guarda e parla (v0.6.0): si ascolta se qualcuno comincia a parlare mentre guarda. */
  private sguardo: RilevaParlato | null = null;
  private fineVoce = -Infinity;
  private eraAttiva = false;
  private tempi: number[] = [];
  private recenti: number[] = [];
  /** Ultimi 3 s di punteggi, per l'indicatore dal vivo. */
  private vivo: { t: number; p: number; b: number }[] = [];
  private riepilogo = { da: 0, massimo: 0, base: 0, livello: 0, frame: 0 };
  private inizioAscolto = 0;
  private ultimoRiepilogo = 0;
  private stat: Statistiche = {
    frame: 0,
    scartati: 0,
    msMedio: 0,
    scatti: 0,
    ultimoScatto: null,
    punteggioRecente: 0,
  };
  private wakeLock: { release(): Promise<void> } | null = null;
  private generazione = 0;
  private readonly adesso: () => number;
  private readonly ascoltatori = new Set<() => void>();
  /** Dove si vede la domanda nata dalla parola: la decide l'interfaccia (riposo → Hub, chat aperta → chat). */
  doveParlare: () => DoveVoce = () => "riquadro";

  constructor(private readonly dip: DipendenzeAscolto) {
    this.adesso = dip.adesso ?? Date.now;
    let letto: string | null = null;
    try {
      letto = localStorage.getItem(CHIAVE);
    } catch (errore) {
      log.avviso(`Parola: impostazione non letta (${descriviErrore(errore)}): acceso di serie`);
    }
    this.pref = leggiPreferenzeParola(letto);
    this.decisione = new DecisioneScatto(opzioniDecisione(this.pref));
    dip.voce.ascolta(() => {
      const attiva = this.voceOccupata();
      if (this.eraAttiva && !attiva) this.fineVoce = this.adesso();
      this.eraAttiva = attiva;
    });
  }

  /**
   * La voce sta ascoltando, pensando o rispondendo. Un errore a schermo ("Non
   * ho capito") non conta: la voce ripartirebbe da lì anche col tocco, e
   * «Jarvis» non deve restare sordo finché qualcuno lo chiude.
   */
  private voceOccupata(): boolean {
    return this.dip.voce.attiva && this.dip.voce.fase !== "errore";
  }

  get stato(): StatoAscolto {
    return this.statoAttuale;
  }
  /** L'utente vuole «Jarvis» acceso su questo dispositivo. */
  get acceso(): boolean {
    return this.pref.acceso;
  }
  /** Tutte le preferenze di «Jarvis» di questo pannello (Impostazioni → Voce). */
  get preferenze(): PreferenzeParola {
    return { ...this.pref };
  }
  /** Di quanto è salita la soglia per i falsi scatti (0 = non è salita). */
  get aumentoSoglia(): number {
    return this.decisione.aumento;
  }
  /** Perché il microfono non è aperto, in parole semplici (stato "fermo"). */
  get problema(): MessaggioMicrofono | null {
    return this.problemaMic;
  }
  get motore(): MotoreParola | null {
    return this.motoreCaricato;
  }
  get statistiche(): Statistiche {
    return { ...this.stat };
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** All'avvio del pannello. */
  avvia(): void {
    document.addEventListener("visibilitychange", () => this.suVisibilita());
    if (this.pref.acceso) void this.accendi("avvio");
  }

  /** Suono breve quando scatta «Jarvis». */
  get suono(): boolean {
    return this.pref.suono;
  }

  /** Interruttore del suono, in Impostazioni → Voce (v0.5.3). */
  impostaSuono(suono: boolean): void {
    this.cambiaPreferenze({ suono });
  }

  /**
   * Cambia una o più preferenze (Impostazioni → Voce) e le salva. `null` come
   * valore di un campo = torna a quello di serie ("Ripristina valore di serie").
   */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeParola]?: PreferenzeParola[K] | null }): void {
    const prima = this.pref;
    const unito: Record<string, unknown> = { ...prima };
    for (const [k, v] of Object.entries(cambi))
      unito[k] =
        v === null && k !== "sogliaManuale" ? PREFERENZE_PAROLA_DI_SERIE[k as keyof PreferenzeParola] : v;
    // passa dalla stessa lettura del localStorage: limiti e tipi controllati in un posto solo
    this.pref = leggiPreferenzeParola(JSON.stringify(unito));
    this.decisione.imposta(opzioniDecisione(this.pref));
    this.salva();
    const cambiati = Object.keys(cambi).filter(
      (k) =>
        JSON.stringify(prima[k as keyof PreferenzeParola]) !==
        JSON.stringify(this.pref[k as keyof PreferenzeParola]),
    );
    if (cambiati.length && !(cambiati.length === 1 && cambiati[0] === "acceso"))
      log.info(
        `«Jarvis», impostazioni cambiate: ${cambiati.map((k) => `${k} ${JSON.stringify(this.pref[k as keyof PreferenzeParola])}`).join(", ")}`,
      );
    this.notifica();
  }

  private salva(): void {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(this.pref));
    } catch (errore) {
      log.avviso(`Parola: impostazione non salvata (${descriviErrore(errore)}): vale fino alla ricarica`);
    }
  }

  /** Interruttore di Impostazioni → Voce (e della procedura guidata). */
  imposta(acceso: boolean): void {
    this.cambiaPreferenze({ acceso });
    log.info(`«Jarvis» sempre in ascolto: ${acceso ? "acceso" : "spento"}`);
    if (acceso) void this.accendi("acceso dalle impostazioni");
    else this.spegni("spento dalle impostazioni");
  }

  /** Riprova ad aprire il microfono (tocco su "Riprova" dopo un errore). */
  riprova(): void {
    if (this.pref.acceso) void this.accendi("riprova");
  }

  private async accendi(motivo: string): Promise<void> {
    if (this.statoAttuale === "ascolta" || this.statoAttuale === "carica") return;
    if (!Microfono.disponibile()) {
      this.problemaMic = messaggioMicrofono("https");
      this.cambia("nonDisponibile");
      log.avviso("«Jarvis» non può ascoltare: il microfono funziona solo sull'indirizzo https");
      return;
    }
    const generazione = ++this.generazione;
    this.problemaMic = null;
    this.cambia("carica");
    try {
      const motore = await this.carica();
      if (generazione !== this.generazione) return;
      await motore.azzera();
      this.decisione.azzeraFila();
      if (generazione !== this.generazione) return;
      await this.dip.micro.apriContinuo({
        pezzo: (pcm) => void this.suPezzo(pcm, generazione),
        interrotto: () => this.suInterrotto(),
      });
      if (generazione !== this.generazione) {
        this.dip.micro.chiudiContinuo();
        return;
      }
      log.info(`«Jarvis» in ascolto (${motivo}): memoria di ${SECONDI_MEMORIA} s solo in RAM`);
      this.inizioAscolto = this.adesso();
      this.ultimoRiepilogo = this.inizioAscolto;
      this.riepilogo = { da: this.inizioAscolto, massimo: 0, base: 0, livello: 0, frame: 0 };
      this.cambia("ascolta");
      void this.tieniSchermoAcceso();
    } catch (errore) {
      if (generazione !== this.generazione) return;
      const problema = errore instanceof MicrofonoNonDisponibile ? "https" : problemaDaErrore(errore);
      this.problemaMic =
        errore instanceof DOMException || errore instanceof MicrofonoNonDisponibile
          ? messaggioMicrofono(problema)
          : { problema: "altro", titolo: "«Jarvis» non è partito.", spiegazione: descriviErrore(errore) };
      log.errore(`«Jarvis» non in ascolto (${motivo}): ${descriviErrore(errore)}`);
      this.cambia("fermo");
    }
  }

  private carica(): Promise<MotoreParola> {
    this.caricamento ??= (
      this.dip.carica ?? (() => import("./motore").then((m) => m.MotoreParola.crea()))
    )().then(
      (motore) => {
        this.motoreCaricato = motore;
        motore.ascolta(() => this.notifica());
        return motore;
      },
      (errore: unknown) => {
        // si potrà riprovare (rete tornata, cache pronta)
        this.caricamento = null;
        throw errore;
      },
    );
    return this.caricamento;
  }

  private spegni(motivo: string): void {
    this.generazione += 1;
    this.dip.micro.chiudiContinuo();
    this.memoria.svuota();
    this.motoreCaricato?.annullaRegistrazione(motivo);
    this.problemaMic = null;
    void this.lasciaSchermo();
    if (this.statoAttuale !== "spento") log.info(`«Jarvis» non ascolta più (${motivo}); memoria svuotata`);
    this.cambia("spento");
  }

  private suInterrotto(): void {
    this.generazione += 1;
    this.memoria.svuota();
    this.motoreCaricato?.annullaRegistrazione("microfono chiuso dal sistema");
    this.problemaMic = {
      problema: "altro",
      titolo: "Il sistema ha chiuso il microfono.",
      spiegazione: "Riparte da solo quando il pannello torna in primo piano.",
    };
    this.cambia("fermo");
  }

  /** Android: in secondo piano il microfono si ferma e il Wake Lock si perde; al ritorno si riprende. */
  private suVisibilita(): void {
    if (document.visibilityState !== "visible") return;
    this.wakeLock = null;
    if (!this.pref.acceso) return;
    if (this.statoAttuale === "ascolta") void this.tieniSchermoAcceso();
    else if (this.statoAttuale === "fermo") void this.accendi("pagina di nuovo in primo piano");
  }

  private async suPezzo(pcm: Int16Array, generazione: number): Promise<void> {
    const motore = this.motoreCaricato;
    if (!motore || generazione !== this.generazione) return;
    // quando è arrivato l'audio: la "fine della parola" per la misura di reattività
    const arrivo = performance.now();
    this.memoria.scrivi(pcm);
    this.forseSguardo(pcm);
    // il dispositivo non sta al passo: meglio buttare audio vecchio che rispondere in ritardo
    if (this.inCoda * (pcm.length / 1280) > RITARDO_MASSIMO_FRAME) {
      this.stat.scartati += pcm.length / 1280;
      return;
    }
    this.inCoda += 1;
    try {
      const esiti = await motore.elabora(pcm);
      if (generazione !== this.generazione) return;
      for (const e of esiti) this.suEsito(e, motore, arrivo);
    } catch (errore) {
      log.errore(`Parola: errore del modello: ${descriviErrore(errore)}`);
    } finally {
      this.inCoda -= 1;
    }
  }

  private suEsito(e: EsitoParola, motore: MotoreParola, arrivo: number): void {
    this.stat.frame += 1;
    this.tempi.push(e.ms);
    if (this.tempi.length > 250) this.tempi.shift();
    this.recenti.push(e.punteggio);
    if (this.recenti.length > 25) this.recenti.shift();
    if (this.stat.frame % 25 === 0) {
      this.stat.msMedio = this.tempi.reduce((s, x) => s + x, 0) / this.tempi.length;
      this.stat.punteggioRecente = Math.max(...this.recenti);
      this.notifica();
    }
    const adesso = this.adesso();
    this.registraDalVivo(e, adesso);
    this.scriviCambio(this.decisione.controlla(adesso));
    const soglie = this.soglie(motore);
    const soglia = this.decisione.soglia(e, soglie);
    // conferma: `pazienza` frame di fila sopra soglia (v0.5.4)
    if (!this.decisione.frame(e, soglie)) return;
    if (
      !puoScattare(
        e,
        soglia,
        adesso,
        this.ultimoScatto,
        this.voceOccupata(),
        this.fineVoce,
        motore.inRegistrazione !== null,
      )
    )
      return;
    this.scatta(e, motore, adesso, arrivo, soglia, (soglie.sconto ?? 0) > 0);
  }

  /**
   * Le soglie di adesso: quella scelta a mano vince su tutto (anche sulla
   * personale). Con qualcuno vicino al pannello scendono tutte di un passo
   * (v0.6.0, fotocamera).
   */
  private soglie(motore: MotoreParola): Soglie {
    const manuale = this.pref.sogliaManuale;
    const sconto = this.dip.presenza?.scontoSoglia() ?? 0;
    return manuale !== null
      ? { serie: manuale, personale: null, sconto }
      : { serie: motore.sogliaSerie, personale: motore.sogliaPersonale, sconto };
  }

  private scriviCambio(c: CambioSoglia | null): void {
    if (!c) return;
    const f = (n: number): string => n.toFixed(2).replace(".", ",");
    log.info(
      `«Jarvis»: soglia ${c.aumento > 0 ? `+${f(c.aumento)} sopra la sua base` : "tornata alla sua base"} (${c.motivo})`,
    );
    this.notifica();
  }

  /** Punteggio più alto degli ultimi 3 s e livello del microfono: Impostazioni → Voce e Diagnostica. */
  get dalVivo(): DalVivo {
    const limite = this.adesso() - FINESTRA_DAL_VIVO_MS;
    const finestra = this.vivo.filter((x) => x.t >= limite);
    return {
      punteggio: finestra.reduce((m, x) => Math.max(m, x.p), 0),
      base: finestra.reduce((m, x) => Math.max(m, x.b), 0),
      livello: this.statoAttuale === "ascolta" ? this.dip.micro.livello : 0,
      soglia: this.motoreCaricato
        ? this.decisione.soglia({ verificato: false }, this.soglie(this.motoreCaricato))
        : 0.5,
    };
  }

  private registraDalVivo(e: EsitoParola, adesso: number): void {
    this.vivo.push({ t: adesso, p: e.punteggio, b: e.base });
    while ((this.vivo[0]?.t ?? adesso) < adesso - FINESTRA_DAL_VIVO_MS) this.vivo.shift();
    const r = this.riepilogo;
    r.frame += 1;
    r.massimo = Math.max(r.massimo, e.punteggio);
    r.base = Math.max(r.base, e.base);
    r.livello = Math.max(r.livello, this.dip.micro.livello);
    if (adesso - r.da < RIEPILOGO_OGNI_MS) return;
    if (riepilogoDaScrivere(r.massimo, adesso - this.inizioAscolto, adesso - this.ultimoRiepilogo)) {
      const f = (n: number): string => n.toFixed(2).replace(".", ",");
      log.info(
        `«Jarvis» negli ultimi ${Math.round((adesso - r.da) / 1000)} s: punteggio massimo ${f(r.massimo)}` +
          `${r.base !== r.massimo ? ` (modello base ${f(r.base)})` : ""}, livello del microfono fino a ${f(r.livello)}, ${r.frame} pezzi`,
      );
      this.ultimoRiepilogo = adesso;
    }
    this.riepilogo = { da: adesso, massimo: 0, base: 0, livello: 0, frame: 0 };
  }

  /**
   * Guarda e parla (v0.6.0, punto 7.4): mentre qualcuno guarda il tablet, se
   * comincia a parlare la domanda parte senza «Jarvis», con l'audio da poco
   * prima. Se HA non sente parole si chiude in silenzio.
   */
  private forseSguardo(pcm: Int16Array): void {
    const adesso = this.adesso();
    if (
      !this.dip.presenza?.staGuardando() ||
      this.voceOccupata() ||
      this.dip.assistente.occupato ||
      adesso - this.ultimoScatto < PAUSA_DOPO_SCATTO_MS ||
      adesso - this.fineVoce < PAUSA_DOPO_VOCE_MS
    ) {
      this.sguardo = null;
      return;
    }
    this.sguardo ??= new RilevaParlato();
    if (!this.sguardo.pezzo(pcm)) return;
    this.sguardo = null;
    this.ultimoScatto = adesso;
    // ~1 s prima del parlato: l'inizio della frase non si perde
    const preroll = this.memoria.ultimi().slice(-16000);
    this.memoria.svuota();
    log.info("Guarda e parla: qualcuno guarda il pannello e parla, ascolto senza «Jarvis»");
    void this.dip.voce.parla(this.doveParlare(), false, { preroll, silenziosoSeVuoto: true });
    this.notifica();
  }

  private scatta(
    e: EsitoParola,
    motore: MotoreParola,
    adesso: number,
    arrivo: number,
    soglia: number,
    vicino = false,
  ): void {
    const scatto = performance.now();
    this.ultimoScatto = adesso;
    this.stat.scatti += 1;
    this.stat.ultimoScatto = adesso;
    // la memoria va a HA una volta sola (frase e contesto), e poi si azzera davvero
    const memoria = this.memoria.ultimi();
    const inizio = inizioRichiesta(memoria);
    const preroll = memoria.slice(inizio);
    // il contesto parte PRIMA della richiesta, e solo se la richiesta può partire
    // (si può spegnere, o accorciare, in Impostazioni → Voce)
    const daContesto = Math.max(0, inizio - this.pref.secondiContesto * 16000);
    const contesto =
      this.dip.assistente.occupato || !this.pref.contesto
        ? null
        : contestoPrima(memoria.subarray(daContesto), inizio - daContesto);
    memoria.fill(0);
    this.memoria.svuota();
    const contestoInviato = contesto ? this.dip.assistente.inviaContesto(contesto) : false;
    const suonava = this.dip.timer.suonano.length > 0;
    const s = (n: number): string => (n / 16000).toFixed(1).replace(".", ",");
    // per imparare, se poi la trascrizione è vuota (v0.5.4)
    const istantanea = motore.istantanea();
    log.info(
      `«${motore.parola}» sentito (punteggio ${e.punteggio.toFixed(2)}${e.verificato ? `, dal verificatore; base ${e.base.toFixed(2)}` : ", modello di base"}, soglia ${soglia.toFixed(2)}${vicino ? ", più bassa: qualcuno vicino al pannello" : ""}), ` +
        `mando ${s(preroll.length)} s di frase` +
        `${contesto ? `${contestoInviato ? "" : " (contesto NON partito)"} e ${s(contesto.length)} s di contesto prima` : ", nessun parlato prima"}` +
        `${suonava ? "; suoneria zittita" : ""}`,
    );
    if (suonava) this.dip.timer.silenzia(`«${motore.parola}» sentito`);
    const parola = motore.parola;
    const fermaSeStop = (testo: string): "fermato" | "continua" => {
      if (!eComandoStop(testo, parola)) return "continua";
      this.dip.timer.ferma(`«${testo}» a voce`);
      return "fermato";
    };
    const quando = new Date(adesso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const dopoScatto = (testo: string | null): void => {
      log.info(
        `«${parola}» delle ${quando}: punteggio ${e.punteggio.toFixed(2)}${e.verificato ? " (verificatore)" : ""}, ` +
          (testo === null ? "trascrizione vuota: falso scatto" : `trascrizione «${testo.slice(0, 80)}»`),
      );
      this.scriviCambio(this.decisione.esito(testo === null, this.adesso()));
      if (testo === null && this.pref.impara) void motore.imparaDaFalsoScatto(istantanea);
    };
    const opzioni = {
      preroll,
      parola,
      suono: this.pref.suono,
      tempi: { finePezzo: arrivo, scatto },
      dopoScatto,
    };
    void this.dip.voce.parla(
      this.doveParlare(),
      false,
      suonava ? { ...opzioni, dopoTrascrizione: fermaSeStop } : opzioni,
    );
    this.notifica();
  }

  private async tieniSchermoAcceso(): Promise<void> {
    const nav = navigator as Navigator & {
      wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> };
    };
    if (!nav.wakeLock || this.wakeLock) return;
    try {
      this.wakeLock = await nav.wakeLock.request("screen");
      log.info("Schermo tenuto acceso mentre «Jarvis» ascolta (Wake Lock)");
    } catch (errore) {
      log.avviso(
        `Wake Lock non disponibile (${descriviErrore(errore)}): lo schermo va tenuto acceso dalle impostazioni del tablet`,
      );
    }
  }

  private async lasciaSchermo(): Promise<void> {
    const w = this.wakeLock;
    this.wakeLock = null;
    try {
      await w?.release();
    } catch (errore) {
      log.avviso(`Wake Lock non rilasciato: ${descriviErrore(errore)}`);
    }
  }

  private cambia(stato: StatoAscolto): void {
    this.statoAttuale = stato;
    this.notifica();
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
