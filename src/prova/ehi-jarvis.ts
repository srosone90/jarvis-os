/**
 * Pagina della PROVA DI FATTIBILITÀ di "Ehi Jarvis" (prova-ehi-jarvis.html).
 * Non fa parte del pannello: build a parte (vite.prova.config.ts), fuori dal
 * service worker e dai limiti del bundle del pannello.
 *
 * Misura quello che serve per decidere (CLAUDE.md, "Ehi Jarvis"): tempo di
 * calcolo per frame, riconoscimenti su 20 prove a 1 m e 3 m, falsi positivi in
 * un'ora con la TV accesa, batteria; il calore lo annota chi prova. Tutto gira
 * sul telefono (onnxruntime-web, WASM in un solo thread): nessun audio va a HA.
 */
import * as ort from "onnxruntime-web/wasm";
import urlEmbedding from "../../modelli/openwakeword/embedding_model.onnx?url";
import urlClassificatore from "../../modelli/openwakeword/hey_jarvis_v0.1.onnx?url";
import urlMel from "../../modelli/openwakeword/melspectrogram.onnx?url";
import { descriviErrore } from "../diagnostica/log";
import { ArchivioParola, verificatoreValido, type Esempio } from "../parola/archivio";
import { caricaImpostazioni } from "../parola/impostazioni";
import { MemoriaCircolare } from "../parola/memoria";
import {
  CAMPIONI_FRAME,
  RilevatoreOpenWakeWord,
  type DescrizioneModello,
  type EsitoFrame,
} from "../parola/rilevatore";
import {
  LUNGHEZZA_CARATTERISTICHE,
  SOGLIA_BASE_PREDEFINITA,
  addestra,
  punteggioFinale,
  scegliNegativi,
  scegliPositivi,
  sogliaBaseConsigliata,
  type FrameRegistrato,
  type Verificatore,
} from "../parola/verificatore";
import { passaAllOrigineVeloce, statoOrigine } from "../pwa/origine";
import { Bip } from "../voce/audio";
import { Microfono } from "../voce/microfono";

// Come il pannello: dal link di riserva (lento sui dati) si passa alla veloce se risponde.
passaAllOrigineVeloce();

/**
 * Il modello di questa prova. Sostituibile senza release: `parola.json` accanto
 * alla pagina può indicarne un altro (vedi src/parola/impostazioni.ts).
 */
let modello: DescrizioneModello = {
  id: "hey_jarvis_v0.1",
  parola: "Ehi Jarvis",
  licenza: "CC BY-NC-SA 4.0",
  commerciale: false,
};
/** Dopo un'attivazione, per quanto non se ne conta un'altra (una frase = un'attivazione). */
const PAUSA_DOPO_ATTIVAZIONE_MS = 2000;
/** Se il telefono resta indietro di tanto, si butta l'audio vecchio (e lo si dice). */
const RITARDO_MASSIMO_FRAME = 25;
const BATTERIA_OGNI_MS = 5 * 60_000;
/** Audio tenuto DOPO la parola nello scatto di prova (la funzione vera userà il fine-parlato). */
const SECONDI_DOPO = 4;

// --- elementi della pagina ---------------------------------------------------
const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`manca ${sel}`);
  return e;
};
const pulsante = (azione: string) => $<HTMLButtonElement>(`[data-azione="${azione}"]`);
const campo = (nome: string) => $<HTMLElement>(`[data-test="${nome}"]`);
const numero = (n: number, cifre = 2) => n.toFixed(cifre).replace(".", ",");
const ora = () => new Date().toLocaleTimeString("it-IT");

let urlModello: string = urlClassificatore;
function mostraModello(): void {
  for (const e of document.querySelectorAll("[data-parola]")) e.textContent = modello.parola;
  $("[data-modello]").textContent = modello.id;
  $("[data-licenza]").textContent = modello.licenza;
}
mostraModello();

const righeRegistro: string[] = [];
function registra(testo: string): void {
  const riga = `${ora()}  ${testo}`;
  righeRegistro.push(riga);
  if (righeRegistro.length > 500) righeRegistro.shift();
  const pre = campo("registro");
  pre.textContent = righeRegistro.join("\n");
  pre.scrollTop = pre.scrollHeight;
  aggiornaRisultati();
}
function stato(testo: string): void {
  campo("stato").textContent = testo;
}

// --- stato della prova ------------------------------------------------------
let rilevatore: RilevatoreOpenWakeWord | null = null;
let msCaricamento = 0;
const microfono = new Microfono();
const bip = new Bip();
let attivo = false;
let frequenza = 16000;
let soglia = 0.5;
let attivazioni = 0;
let ultimaAttivazione = 0;
let inCoda = 0;
let frameScartati = 0;
let avviatoAlle = 0;
const tempi: number[] = [];
let frameTotali = 0;
const storico: number[] = []; // punteggi degli ultimi 10 s (125 frame)
let wakeLock: { release(): Promise<void> } | null = null;

interface Serie {
  distanza: string;
  come: string;
  soglia: number;
  /** "no" oppure la soglia base con cui decideva il verificatore */
  verificatore: string;
  detti: number;
  riconosciuti: number;
  inizio: number;
  fine: number | null;
}
const serie: Serie[] = [];
let serieInCorso: Serie | null = null;
let falsi: { inizio: number; fine: number | null; attivazioni: number; verificatore: string } | null = null;
const letture: string[] = [];
// Memoria circolare: SOLO in RAM, mai inviata né salvata (qui non si invia niente del tutto)
const memoria = new MemoriaCircolare(3.5);
let scatto: { prima: Int16Array; dopo: Int16Array[]; mancano: number } | null = null;

// Verificatore personale (vedi src/parola/verificatore.ts)
let archivio: ArchivioParola | null = null;
let verificatore: Verificatore | null = null;
let origineVerificatore = "";
let usaVerificatore = false;
let sogliaBase = SOGLIA_BASE_PREDEFINITA;
/** Scelta a mano o da parola.json: allora non la si cambia più da soli. */
let sogliaBaseScelta = false;
let ultimoBase = 0;
let ultimoVerificato = false;
let testoImpostazioni = "valori predefiniti (parola.json assente)";
/** Registrazione guidata in corso: esempi della parola o parlato normale. */
let registrazione: {
  tipo: "parola" | "normale";
  persona: string;
  /** Frame dall'inizio della registrazione, con indice. */
  frame: FrameRegistrato[];
  pcm: Int16Array[];
  quanti: number;
  fatti: number;
  /** Indice del frame del prossimo invito ("di' Jarvis adesso"). */
  prossimoInvito: number;
  /** Inviti già dati e non ancora salvati: indice del frame dell'invito. */
  inAttesa: number[];
  frameFine: number;
} | null = null;

// --- avvio e arresto --------------------------------------------------------
async function caricaModello(): Promise<RilevatoreOpenWakeWord> {
  if (rilevatore) return rilevatore;
  // un solo thread: su HA non ci sono gli header per SharedArrayBuffer (e sui telefoni vecchi è meglio)
  ort.env.wasm.numThreads = 1;
  const t0 = performance.now();
  stato("Carico il modello…");
  rilevatore = await RilevatoreOpenWakeWord.crea(ort, modello, {
    melspettrogramma: urlMel,
    embedding: urlEmbedding,
    classificatore: urlModello,
  });
  msCaricamento = performance.now() - t0;
  registra(`Modello ${modello.id} caricato in ${Math.round(msCaricamento)} ms`);
  return rilevatore;
}

async function avvia(): Promise<void> {
  pulsante("avvia").disabled = true;
  try {
    const r = await caricaModello();
    await r.azzera();
    frequenza = await microfono.avvia({
      pezzo: (pcm) => void suAudio(new Int16Array(pcm)),
      livello: () => undefined,
      interrotto: () => {
        registra("Il sistema ha chiuso il microfono (pagina in secondo piano o schermo spento?)");
        annullaRegistrazione("microfono chiuso dal sistema");
        attivo = false;
        memoria.svuota();
        mostraPrivacy();
        stato('Microfono chiuso dal sistema: tocca "Avvia" o torna sulla pagina.');
        pulsante("avvia").disabled = false;
        pulsante("ferma").disabled = true;
      },
    });
    attivo = true;
    mostraPrivacy();
    if (!avviatoAlle) avviatoAlle = Date.now();
    registra(`Microfono aperto a ${frequenza} Hz${frequenza === 16000 ? "" : " (ricampiono a 16000)"}`);
    stato(`In ascolto. Di' «${modello.parola}».`);
    pulsante("ferma").disabled = false;
    await tieniSchermoAcceso();
  } catch (errore) {
    registra(`Errore all'avvio: ${descriviErrore(errore)}`);
    stato(`Non riesco ad avviare: ${descriviErrore(errore)}`);
    pulsante("avvia").disabled = false;
  }
}

function ferma(motivo: string): void {
  if (!attivo) return;
  annullaRegistrazione(motivo);
  attivo = false;
  microfono.ferma();
  memoria.svuota();
  mostraPrivacy();
  registra(`Ascolto fermato (${motivo}); memoria circolare svuotata`);
  stato("Fermo.");
  pulsante("avvia").disabled = false;
  pulsante("ferma").disabled = true;
}

/** Indicatore sempre visibile quando il microfono ascolta (privacy). */
function mostraPrivacy(): void {
  campo("privacy").classList.toggle("attiva", attivo);
}

async function tieniSchermoAcceso(): Promise<void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> };
  };
  if (!nav.wakeLock || wakeLock) return;
  try {
    wakeLock = await nav.wakeLock.request("screen");
    registra("Schermo tenuto acceso (Wake Lock)");
  } catch (errore) {
    registra(`Wake Lock non disponibile: ${descriviErrore(errore)}. Tieni lo schermo acceso a mano.`);
  }
}

// Android: con la pagina in secondo piano il microfono si ferma; al ritorno si riprende.
document.addEventListener("visibilitychange", () => {
  registra(
    `Pagina ${document.visibilityState === "visible" ? "di nuovo in primo piano" : "in secondo piano"}`,
  );
  if (document.visibilityState === "visible") {
    wakeLock = null; // il Wake Lock si perde in secondo piano: va richiesto di nuovo
    if (!attivo && avviatoAlle && !pulsante("avvia").disabled) {
      registra("Riprendo l'ascolto");
      void avvia();
    } else if (attivo) void tieniSchermoAcceso();
  }
});

// --- audio → rilevatore ------------------------------------------------------
let restoRicampionamento = 0;
/** Ricampionamento lineare a 16 kHz, solo se il browser non ha dato 16 kHz. */
function a16k(pcm: Int16Array): Int16Array {
  if (frequenza === 16000) return pcm;
  const passo = frequenza / 16000;
  const uscita: number[] = [];
  let pos = restoRicampionamento;
  for (; pos < pcm.length - 1; pos += passo) {
    const i = Math.floor(pos);
    const f = pos - i;
    uscita.push((pcm[i] ?? 0) * (1 - f) + (pcm[i + 1] ?? 0) * f);
  }
  restoRicampionamento = pos - pcm.length;
  return Int16Array.from(uscita);
}

async function suAudio(pcm: Int16Array): Promise<void> {
  if (!attivo || !rilevatore) return;
  const campioni = a16k(pcm);
  memoria.scrivi(campioni);
  if (scatto && scatto.mancano > 0) {
    scatto.dopo.push(campioni);
    scatto.mancano -= campioni.length;
    if (scatto.mancano <= 0) scattoPronto();
  }
  // il telefono non sta al passo: meglio buttare audio vecchio che rispondere in ritardo
  if (inCoda * (campioni.length / CAMPIONI_FRAME) > RITARDO_MASSIMO_FRAME) {
    frameScartati += campioni.length / CAMPIONI_FRAME;
    return;
  }
  inCoda += 1;
  try {
    const esiti = await rilevatore.elabora(campioni);
    if (registrazione?.tipo === "parola") registrazione.pcm.push(campioni);
    for (const e of esiti) suFrame(e);
  } catch (errore) {
    registra(`Errore del modello: ${descriviErrore(errore)}`);
  } finally {
    inCoda -= 1;
  }
}

function suFrame(esito: EsitoFrame): void {
  const ms = esito.msCalcolo;
  const { punteggio, verificato } = punteggioFinale(
    esito.punteggio,
    esito.caratteristiche,
    usaVerificatore ? verificatore : null,
    sogliaBase,
  );
  ultimoBase = esito.punteggio;
  ultimoVerificato = verificato;
  if (registrazione) suFrameRegistrato(esito);
  frameTotali += 1;
  tempi.push(ms);
  if (tempi.length > 2000) tempi.shift();
  storico.push(punteggio);
  if (storico.length > 125) storico.shift();
  const adesso = Date.now();
  // mentre si registrano esempi non si conta niente (e niente bip, che finirebbe nella registrazione)
  if (!registrazione && punteggio >= soglia && adesso - ultimaAttivazione > PAUSA_DOPO_ATTIVAZIONE_MS) {
    ultimaAttivazione = adesso;
    attivazioni += 1;
    if (serieInCorso) serieInCorso.riconosciuti += 1;
    if (falsi && falsi.fine === null) falsi.attivazioni += 1;
    bip.suona("apri");
    // scatto: i secondi PRIMA della parola (memoria) + i 4 s dopo
    scatto = { prima: memoria.ultimi(), dopo: [], mancano: SECONDI_DOPO * 16000 };
    pulsante("ascolta-scatto").disabled = true;
    pulsante("cancella-scatto").disabled = false;
    const zona = campo("zona-punteggio");
    zona.classList.remove("attivazione");
    void zona.offsetWidth;
    zona.classList.add("attivazione");
    registra(
      `ATTIVAZIONE (punteggio ${numero(punteggio)}${
        verificato ? `, dal verificatore; modello base ${numero(esito.punteggio)}` : ""
      }, soglia ${numero(soglia)})`,
    );
  }
  aggiornaSubito(punteggio);
}

// --- disegno (al massimo ~30 volte al secondo, fermo quando la pagina non si vede) ---
let ultimoPunteggio = 0;
let disegnoProgrammato = false;
function aggiornaSubito(p: number): void {
  ultimoPunteggio = p;
  if (disegnoProgrammato) return;
  disegnoProgrammato = true;
  requestAnimationFrame(disegna);
}

function statistiche(): { media: number; p95: number; max: number } {
  if (tempi.length === 0) return { media: 0, p95: 0, max: 0 };
  const ordinati = [...tempi].sort((a, b) => a - b);
  const media = tempi.reduce((s, x) => s + x, 0) / tempi.length;
  return { media, p95: ordinati[Math.floor(ordinati.length * 0.95)] ?? 0, max: ordinati.at(-1) ?? 0 };
}

function disegna(): void {
  disegnoProgrammato = false;
  const p = campo("punteggio");
  p.textContent = numero(ultimoPunteggio);
  const base = campo("punteggio-base");
  base.hidden = !usaVerificatore || !verificatore;
  base.textContent = `Modello base ${numero(ultimoBase)}${
    ultimoVerificato ? " · deciso dal verificatore" : ` · sotto la soglia base ${numero(sogliaBase, 3)}`
  }`;
  p.classList.toggle("sopra", ultimoPunteggio >= soglia);
  campo("attivazioni").textContent = String(attivazioni);
  const s = statistiche();
  const t = (k: string, v: string) => ($(`[data-t="${k}"]`).textContent = v);
  t("ultimo", `${numero(tempi.at(-1) ?? 0, 1)} ms`);
  t("media", `${numero(s.media, 1)} ms`);
  t("p95", `${numero(s.p95, 1)} ms`);
  t("max", `${numero(s.max, 1)} ms`);
  t("carico", `${Math.round((s.media / 80) * 100)}%`);
  t("frame", `${frameTotali}${frameScartati ? ` (${Math.round(frameScartati)} scartati)` : ""}`);
  const c = $<HTMLCanvasElement>("canvas");
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, c.width, c.height);
    const y = (v: number) => c.height - v * (c.height - 8) - 4;
    g.strokeStyle = "#f0a33a";
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(0, y(soglia));
    g.lineTo(c.width, y(soglia));
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "#5b8def";
    g.lineWidth = 2;
    g.beginPath();
    storico.forEach((v, i) => {
      const x = (i / 124) * c.width;
      if (i === 0) g.moveTo(x, y(v));
      else g.lineTo(x, y(v));
    });
    g.stroke();
  }
  if (falsi) {
    const fine = falsi.fine ?? Date.now();
    const minuti = (fine - falsi.inizio) / 60_000;
    campo("falsi").textContent =
      `${falsi.attivazioni} in ${numero(minuti, 1)} min` +
      (minuti >= 1 ? ` (≈ ${numero((falsi.attivazioni / minuti) * 60, 1)} all'ora)` : "");
  }
  aggiornaRisultati();
}

// --- serie e falsi positivi ---------------------------------------------------
pulsante("serie").addEventListener("click", () => {
  const b = pulsante("serie");
  if (!serieInCorso) {
    const detti = Number($<HTMLInputElement>('[data-test="detti"]').value) || 20;
    serieInCorso = {
      distanza: $<HTMLSelectElement>('[data-test="distanza"]').value,
      come: $<HTMLSelectElement>('[data-test="come"]').value,
      soglia,
      verificatore: descriviVerificatoreInUso(),
      detti,
      riconosciuti: 0,
      inizio: Date.now(),
      fine: null,
    };
    b.textContent = "Fine serie";
    registra(
      `Serie iniziata: ${detti} ${serieInCorso.come} a ${serieInCorso.distanza}, soglia ${numero(soglia)}`,
    );
    return;
  }
  serieInCorso.detti = Number($<HTMLInputElement>('[data-test="detti"]').value) || serieInCorso.detti;
  serieInCorso.fine = Date.now();
  serie.push(serieInCorso);
  registra(`Serie finita: ${serieInCorso.riconosciuti}/${serieInCorso.detti} a ${serieInCorso.distanza}`);
  serieInCorso = null;
  b.textContent = "Inizia serie";
  $("table[data-test=serie]").innerHTML =
    "<tr><th>Come</th><th>Distanza</th><th>Soglia</th><th>Verificatore</th><th>Detti</th><th>Riconosciuti</th><th>%</th></tr>" +
    serie
      .map(
        (s) =>
          `<tr><td>${s.come}</td><td>${s.distanza}</td><td>${numero(s.soglia)}</td><td>${s.verificatore}</td><td>${s.detti}</td><td>${s.riconosciuti}</td><td>${Math.round(
            (Math.min(s.riconosciuti, s.detti) / s.detti) * 100,
          )}%</td></tr>`,
      )
      .join("");
  aggiornaRisultati();
});

pulsante("falsi").addEventListener("click", () => {
  const b = pulsante("falsi");
  if (!falsi || falsi.fine !== null) {
    falsi = { inizio: Date.now(), fine: null, attivazioni: 0, verificatore: descriviVerificatoreInUso() };
    b.textContent = "Fine conteggio";
    registra("Conteggio dei falsi positivi iniziato (TV accesa, nessuno dice la parola)");
  } else {
    falsi.fine = Date.now();
    b.textContent = "Nuovo conteggio";
    registra(`Conteggio finito: ${falsi.attivazioni} attivazioni`);
  }
  disegna();
});

// --- scatto: riascolto locale di quello che verrebbe inviato ---------------------
function audioScatto(): Int16Array {
  if (!scatto) return new Int16Array(0);
  const dopo = scatto.dopo.reduce((n, p) => n + p.length, 0);
  const tutto = new Int16Array(scatto.prima.length + dopo);
  tutto.set(scatto.prima);
  let pos = scatto.prima.length;
  for (const p of scatto.dopo) {
    tutto.set(p, pos);
    pos += p.length;
  }
  return tutto;
}
function scattoPronto(): void {
  const s = scatto;
  if (!s) return;
  const prima = s.prima.length / 16000;
  campo("scatto").textContent =
    `Ultimo scatto alle ${ora()}: ${numero(prima, 1)} s prima della parola + ${SECONDI_DOPO} s dopo. ` +
    "Solo in memoria: riascoltalo per sentire se la frase è intera, poi si cancella.";
  pulsante("ascolta-scatto").disabled = false;
}
function cancellaScatto(): void {
  if (scatto) {
    scatto.prima.fill(0);
    for (const p of scatto.dopo) p.fill(0);
  }
  scatto = null;
  pulsante("ascolta-scatto").disabled = true;
  pulsante("cancella-scatto").disabled = true;
  campo("scatto").textContent = "Scatto cancellato.";
}
pulsante("ascolta-scatto").addEventListener("click", () => {
  const pcm = audioScatto();
  if (pcm.length === 0) return;
  const contesto = new AudioContext();
  const buffer = contesto.createBuffer(1, pcm.length, 16000);
  const canale = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) canale[i] = (pcm[i] ?? 0) / 32768;
  const sorgente = contesto.createBufferSource();
  sorgente.buffer = buffer;
  sorgente.connect(contesto.destination);
  sorgente.onended = () => {
    void contesto.close();
    registra("Scatto riascoltato e cancellato");
    cancellaScatto();
  };
  sorgente.start();
});
pulsante("cancella-scatto").addEventListener("click", cancellaScatto);
$<HTMLInputElement>('[data-test="secondi-memoria"]').addEventListener("change", (e) => {
  const secondi = Math.min(8, Math.max(1, Number((e.target as HTMLInputElement).value) || 3.5));
  memoria.ridimensiona(secondi);
  $("[data-memoria]").textContent = numero(secondi, 1);
  registra(`Memoria circolare: ${numero(secondi, 1)} s (ripartita vuota)`);
});

// --- batteria ------------------------------------------------------------------
async function leggiBatteria(): Promise<void> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
  if (!nav.getBattery) return;
  try {
    const b = await nav.getBattery();
    const riga = `${ora()} ${Math.round(b.level * 100)}%${b.charging ? " in carica" : ""}`;
    letture.push(riga);
    registra(`Batteria ${riga.slice(9)}`);
  } catch (errore) {
    registra(`Batteria non leggibile: ${descriviErrore(errore)}`);
  }
}
void leggiBatteria();
setInterval(() => void leggiBatteria(), BATTERIA_OGNI_MS);

// --- risultati da copiare ------------------------------------------------------------
function testoOrigine(): string {
  const { uso, motivo } = statoOrigine();
  const nome = { veloce: "origine veloce", riserva: "origine di riserva", altra: "altra origine" }[uso];
  return motivo ? `${nome}, ${motivo}` : nome;
}

function aggiornaRisultati(): void {
  const s = statistiche();
  const durata = avviatoAlle ? (Date.now() - avviatoAlle) / 60_000 : 0;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const righe = [
    `PROVA «${modello.parola}» — ${new Date().toLocaleString("it-IT")}`,
    `Modello: ${modello.id} (${modello.licenza}), caricato in ${Math.round(msCaricamento)} ms`,
    `Indirizzo: ${location.origin} (${testoOrigine()})`,
    `Dispositivo: ${navigator.userAgent}`,
    `Core: ${navigator.hardwareConcurrency}, memoria: ${nav.deviceMemory ?? "?"} GB, microfono a ${frequenza} Hz`,
    `Ascolto: ${numero(durata, 1)} min, frame ${frameTotali}, scartati ${Math.round(frameScartati)}`,
    `Tempo per frame: media ${numero(s.media, 1)} ms, 95% ${numero(s.p95, 1)} ms, max ${numero(s.max, 1)} ms, carico ${Math.round((s.media / 80) * 100)}%`,
    `Soglia: ${numero(soglia)}  Attivazioni totali: ${attivazioni}`,
    `Impostazioni: ${testoImpostazioni}`,
    `Verificatore: ${testoVerificatore()}`,
    ...riepilogoEsempi(),
    ...serie.map(
      (x) =>
        `Serie ${x.come} a ${x.distanza}, soglia ${numero(x.soglia)}, verificatore ${x.verificatore}: ${x.riconosciuti}/${x.detti} riconosciuti`,
    ),
    `Memoria circolare: ${numero(memoria.secondi, 1)} s`,
    falsi
      ? `Falsi positivi (TV), verificatore ${falsi.verificatore}: ${falsi.attivazioni} in ${numero(((falsi.fine ?? Date.now()) - falsi.inizio) / 60_000, 1)} min`
      : "Falsi positivi: non misurati",
    `Temperatura batteria dopo 1 h: ${$<HTMLInputElement>('[data-test="temperatura"]').value || "?"} °C, al tatto: ${$<HTMLSelectElement>('[data-test="calore"]').value || "?"}`,
    `Batteria: ${letture.join(" · ") || "non leggibile"}`,
  ];
  $<HTMLTextAreaElement>('[data-test="risultati"]').value = righe.join("\n");
}

pulsante("copia").addEventListener("click", () => {
  aggiornaRisultati();
  const testo = $<HTMLTextAreaElement>('[data-test="risultati"]').value;
  navigator.clipboard.writeText(testo).then(
    () => registra("Risultati copiati"),
    (errore: unknown) => {
      registra(`Copia non riuscita (${descriviErrore(errore)}): seleziona il testo a mano`);
      $<HTMLTextAreaElement>('[data-test="risultati"]').select();
    },
  );
});

// --- verificatore: registrazione degli esempi, addestramento, uso ----------------

/** Frame da 80 ms: 12,5 al secondo. */
const FRAME_AL_SECONDO = 16000 / CAMPIONI_FRAME;
/** Un invito ogni 3 s; si guarda la finestra di 2,5 s dopo l'invito. */
const FRAME_TRA_INVITI = Math.round(3 * FRAME_AL_SECONDO);
const FRAME_FINESTRA = Math.round(2.5 * FRAME_AL_SECONDO);
const FRAME_PRIMA_DEL_PRIMO = Math.round(1.5 * FRAME_AL_SECONDO);
/** Audio tenuto per riascoltare un esempio: 0,5 s prima dell'invito + la finestra. */
const CAMPIONI_PRIMA = 8000;

function descriviVerificatoreInUso(): string {
  return usaVerificatore && verificatore ? `sì (soglia base ${numero(sogliaBase, 3)})` : "no";
}

function testoVerificatore(): string {
  if (!verificatore) return "nessuno";
  const i = verificatore.info;
  return (
    `${usaVerificatore ? "attivo" : "spento"}, ${origineVerificatore}: ${i.positivi} esempi della parola` +
    `${i.persone.length ? ` (${i.persone.join(", ")})` : ""} e ${i.negativi} di parlato normale, ` +
    `accuratezza sugli esempi ${Math.round(i.accuratezza * 100)}%, soglia base ${numero(sogliaBase, 3)}`
  );
}

let elencoEsempi: Esempio[] = [];
function riepilogoEsempi(): string[] {
  const persone = new Map<string, Esempio[]>();
  for (const e of elencoEsempi.filter((x) => x.tipo === "parola"))
    persone.set(e.persona, [...(persone.get(e.persona) ?? []), e]);
  const normale = elencoEsempi.filter((x) => x.tipo === "normale").reduce((s, e) => s + e.secondi, 0);
  return [
    ...[...persone].map(
      ([p, es]) =>
        `Esempi di ${p}: ${es.length}, punteggio base massimo medio ${numero(es.reduce((s, e) => s + e.massimo, 0) / es.length, 3)}`,
    ),
    `Parlato normale registrato: ${numero(normale / 60, 1)} min`,
  ];
}

function mostraInvito(testo: string | null, adesso = false): void {
  const el = campo("invito");
  el.hidden = testo === null;
  el.textContent = testo ?? "";
  el.classList.toggle("adesso", adesso);
}

async function aggiornaElenco(): Promise<void> {
  if (!archivio) return;
  elencoEsempi = await archivio.elenco();
  const persone = [...new Set(elencoEsempi.filter((e) => e.tipo === "parola").map((e) => e.persona))];
  const normali = elencoEsempi.filter((e) => e.tipo === "normale");
  const righe = persone.map((p) => {
    const es = elencoEsempi.filter((e) => e.tipo === "parola" && e.persona === p);
    const media = es.reduce((s, e) => s + e.massimo, 0) / es.length;
    return `<div class="esempio"><span><b>${esc(p)}</b> · ${es.length} esempi · modello base al massimo ${numero(media, 3)} in media</span>
      <span class="riga"><button data-ascolta="${esc(p)}">Ascolta l'ultimo</button><button data-cancella="${esc(p)}">Cancella</button></span></div>`;
  });
  if (normali.length)
    righe.push(
      `<div class="esempio"><span><b>Parlato normale</b> · ${numero(normali.reduce((s, e) => s + e.secondi, 0) / 60, 1)} min (solo numeri, niente audio)</span>
      <span class="riga"><button data-cancella-normale>Cancella</button></span></div>`,
    );
  campo("esempi").innerHTML = righe.length
    ? righe.join("")
    : '<p class="nota">Nessun esempio registrato.</p>';
  const massimi = elencoEsempi.filter((e) => e.tipo === "parola").map((e) => e.massimo);
  const consigliata = sogliaBaseConsigliata(massimi);
  // se nessuno l'ha scelta, si usa la consigliata: con una soglia base sopra i
  // punteggi della vostra pronuncia il verificatore non verrebbe mai consultato
  if (massimi.length && !sogliaBaseScelta && consigliata !== sogliaBase) {
    sogliaBase = consigliata;
    $<HTMLInputElement>('[data-test="soglia-base"]').value = String(consigliata);
    registra(`Soglia base impostata a ${numero(consigliata, 3)} (consigliata dai vostri esempi)`);
  }
  campo("consiglio-soglia-base").textContent = massimi.length
    ? `Il verificatore decide solo quando il modello di base supera la soglia base. Con i vostri esempi il modello base arriva almeno a ${numero(Math.min(...massimi), 3)}: soglia base consigliata ${numero(consigliata, 3)}${sogliaBaseScelta ? " (tu ne hai scelta un'altra)" : ", già impostata"}.`
    : "Il verificatore decide solo quando il modello di base supera la soglia base.";
  aggiornaRisultati();
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function iniziaRegistrazione(tipo: "parola" | "normale"): Promise<void> {
  if (registrazione) return;
  if (!archivio) {
    registra("Archivio locale non disponibile: non posso salvare esempi");
    return;
  }
  const persona = $<HTMLInputElement>('[data-test="persona"]').value.trim();
  if (tipo === "parola" && !persona) {
    stato("Scrivi prima chi parla (serve per distinguere le voci di casa).");
    $<HTMLInputElement>('[data-test="persona"]').focus();
    return;
  }
  if (!attivo) await avvia();
  if (!attivo) return;
  const quanti = Math.min(60, Math.max(3, Number($<HTMLInputElement>('[data-test="quanti"]').value) || 30));
  const secondi = Math.min(
    600,
    Math.max(5, Number($<HTMLInputElement>('[data-test="secondi-normale"]').value) || 120),
  );
  registrazione = {
    tipo,
    persona: tipo === "parola" ? persona : "",
    frame: [],
    pcm: [],
    quanti,
    fatti: 0,
    prossimoInvito: FRAME_PRIMA_DEL_PRIMO,
    inAttesa: [],
    frameFine: tipo === "normale" ? Math.round(secondi * FRAME_AL_SECONDO) : Infinity,
  };
  for (const a of ["registra-parola", "registra-normale", "addestra"]) pulsante(a).disabled = true;
  if (tipo === "parola") {
    registra(`Registrazione: ${quanti} «${modello.parola}» di ${persona}`);
    mostraInvito(`Preparati: tra poco «${modello.parola}» (1/${quanti})`);
  } else {
    registra(`Registrazione di ${secondi} s di parlato normale (senza la parola)`);
    mostraInvito(`Parla normalmente o lascia la TV accesa, senza dire «${modello.parola}»`);
  }
}

function suFrameRegistrato(esito: EsitoFrame): void {
  const r = registrazione;
  if (!r) return;
  const indice = r.frame.length;
  r.frame.push({ punteggio: esito.punteggio, caratteristiche: esito.caratteristiche });
  if (r.tipo === "normale") {
    const mancano = Math.max(0, Math.ceil((r.frameFine - indice) / FRAME_AL_SECONDO));
    if (indice % 6 === 0) mostraInvito(`Parla normalmente o lascia la TV accesa · mancano ${mancano} s`);
    if (indice + 1 >= r.frameFine) void chiudiRegistrazione();
    return;
  }
  // inviti: ogni 3 s "di' Jarvis adesso", poi 2,5 s di ascolto per quell'esempio
  if (indice === r.prossimoInvito && r.fatti + r.inAttesa.length < r.quanti) {
    r.inAttesa.push(indice);
    mostraInvito(`Di' «${modello.parola}» adesso · ${r.fatti + r.inAttesa.length}/${r.quanti}`, true);
    r.prossimoInvito += FRAME_TRA_INVITI;
  } else if (r.inAttesa.length && indice === (r.inAttesa.at(-1) ?? 0) + Math.round(1.2 * FRAME_AL_SECONDO)) {
    mostraInvito(
      r.fatti + r.inAttesa.length < r.quanti
        ? `… (${r.fatti + r.inAttesa.length + 1}/${r.quanti} tra poco)`
        : "… ultimo esempio",
    );
  }
  const primo = r.inAttesa[0];
  if (primo !== undefined && indice >= primo + FRAME_FINESTRA) {
    r.inAttesa.shift();
    void salvaEsempioParola(r, primo);
  }
}

async function salvaEsempioParola(r: NonNullable<typeof registrazione>, invito: number): Promise<void> {
  const finestra = r.frame.slice(invito, invito + FRAME_FINESTRA);
  // audio: dall'inizio della registrazione i frame sono allineati ai campioni (±80 ms)
  const fineInvito = (invito + 1) * CAMPIONI_FRAME;
  const pcm = ritaglia(
    r.pcm,
    Math.max(0, fineInvito - CAMPIONI_PRIMA),
    fineInvito + FRAME_FINESTRA * CAMPIONI_FRAME,
  );
  const massimo = Math.max(...finestra.map((f) => f.punteggio));
  r.fatti += 1;
  try {
    await archivio?.salva(
      {
        tipo: "parola",
        persona: r.persona,
        creato: Date.now(),
        secondi: pcm.length / 16000,
        massimo,
        frame: finestra.length,
        modello: modello.id,
      },
      pcm,
      finestra,
    );
  } catch (errore) {
    registra(`Esempio non salvato: ${descriviErrore(errore)}`);
  }
  registra(`Esempio ${r.fatti}/${r.quanti} di ${r.persona}: modello base al massimo ${numero(massimo, 3)}`);
  if (r.fatti >= r.quanti) await chiudiRegistrazione();
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

/** Microfono fermato a metà: la registrazione si butta (gli esempi già salvati restano). */
function annullaRegistrazione(motivo: string): void {
  const r = registrazione;
  if (!r) return;
  registrazione = null;
  for (const p of r.pcm) p.fill(0);
  mostraInvito(null);
  for (const a of ["registra-parola", "registra-normale", "addestra"]) pulsante(a).disabled = false;
  registra(
    r.tipo === "parola"
      ? `Registrazione interrotta (${motivo}): salvati ${r.fatti} esempi su ${r.quanti}`
      : `Registrazione del parlato normale interrotta (${motivo}): non salvata`,
  );
  void aggiornaElenco();
}

async function chiudiRegistrazione(): Promise<void> {
  const r = registrazione;
  if (!r) return;
  registrazione = null;
  if (r.tipo === "normale") {
    try {
      await archivio?.salva(
        {
          tipo: "normale",
          persona: "",
          creato: Date.now(),
          secondi: r.frame.length / FRAME_AL_SECONDO,
          massimo: Math.max(0, ...r.frame.map((f) => f.punteggio)),
          frame: r.frame.length,
          modello: modello.id,
        },
        null, // del parlato normale NON si tiene l'audio
        r.frame,
      );
      registra(
        `Parlato normale salvato: ${numero(r.frame.length / FRAME_AL_SECONDO, 0)} s (solo numeri, niente audio)`,
      );
    } catch (errore) {
      registra(`Parlato normale non salvato: ${descriviErrore(errore)}`);
    }
  } else registra(`Registrazione finita: ${r.fatti} esempi di ${r.persona}`);
  for (const p of r.pcm) p.fill(0);
  mostraInvito(null);
  for (const a of ["registra-parola", "registra-normale", "addestra"]) pulsante(a).disabled = false;
  await aggiornaElenco();
}

async function addestraVerificatore(): Promise<void> {
  if (!archivio || registrazione) return;
  const b = pulsante("addestra");
  b.disabled = true;
  const t0 = performance.now();
  try {
    sogliaBase = leggiSogliaBase();
    const esempi = await archivio.elenco();
    const positivi: Float32Array[] = [];
    const negativi: FrameRegistrato[] = [];
    let ripunteggiati = 0;
    for (const e of esempi) {
      const d = await archivio.dati(e.id);
      if (!d) continue;
      // punteggi di un altro modello base: si rifanno dalle caratteristiche
      if (e.modello !== modello.id) {
        const r = await caricaModello();
        for (const f of d.frame) f.punteggio = await r.valuta(f.caratteristiche);
        ripunteggiati++;
      }
      if (e.tipo === "parola") positivi.push(...scegliPositivi(d.frame, sogliaBase));
      else negativi.push(...d.frame);
    }
    if (!positivi.length || !negativi.length) {
      stato("Servono sia esempi della parola sia parlato normale.");
      return;
    }
    stato(`Addestro il verificatore su ${positivi.length} + ${negativi.length} esempi…`);
    const persone = [...new Set(esempi.filter((e) => e.tipo === "parola").map((e) => e.persona))];
    const v = await addestra(
      positivi,
      scegliNegativi(negativi),
      { modello: modello.id, persone },
      {
        avanzamento: async (i) => {
          campo("stato-verificatore").textContent = `Addestramento… (passo ${i})`;
          await new Promise((ok) => setTimeout(ok, 0));
        },
      },
    );
    await archivio.salvaVerificatore(v);
    impostaVerificatore(v, "addestrato su questo telefono", true);
    const secondi = (performance.now() - t0) / 1000;
    registra(
      `Verificatore addestrato in ${numero(secondi, 1)} s: ${v.info.positivi} + ${v.info.negativi} esempi, accuratezza ${Math.round(v.info.accuratezza * 100)}%` +
        (ripunteggiati ? `, ${ripunteggiati} esempi ripunteggiati col modello ${modello.id}` : ""),
    );
    stato(`Verificatore pronto. Rifai le serie con «Usa il verificatore» acceso e confronta.`);
  } catch (errore) {
    registra(`Addestramento non riuscito: ${descriviErrore(errore)}`);
    stato(`Addestramento non riuscito: ${descriviErrore(errore)}`);
  } finally {
    b.disabled = false;
  }
}

function leggiSogliaBase(): number {
  const v = Number($<HTMLInputElement>('[data-test="soglia-base"]').value);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : SOGLIA_BASE_PREDEFINITA;
}

function impostaVerificatore(v: Verificatore | null, origine: string, usa: boolean): void {
  verificatore = v;
  origineVerificatore = origine;
  usaVerificatore = !!v && usa;
  const casella = $<HTMLInputElement>('[data-test="usa-verificatore"]');
  casella.disabled = !v;
  casella.checked = usaVerificatore;
  pulsante("esporta").disabled = !v;
  campo("stato-verificatore").textContent = v
    ? `Verificatore ${origine}: ${v.info.positivi} esempi della parola${v.info.persone.length ? ` (${v.info.persone.join(", ")})` : ""}, ${v.info.negativi} di parlato normale, accuratezza sugli esempi ${Math.round(v.info.accuratezza * 100)}%.` +
      (v.modello !== modello.id
        ? ` Attenzione: preparato col modello ${v.modello}, ora è attivo ${modello.id}.`
        : "")
    : "Nessun verificatore.";
  aggiornaRisultati();
}

pulsante("registra-parola").addEventListener("click", () => void iniziaRegistrazione("parola"));
pulsante("registra-normale").addEventListener("click", () => void iniziaRegistrazione("normale"));
pulsante("addestra").addEventListener("click", () => void addestraVerificatore());
$<HTMLInputElement>('[data-test="usa-verificatore"]').addEventListener("change", (e) => {
  usaVerificatore = (e.target as HTMLInputElement).checked && !!verificatore;
  registra(`Verificatore ${usaVerificatore ? "acceso" : "spento"}`);
  aggiornaRisultati();
});
$<HTMLInputElement>('[data-test="soglia-base"]').addEventListener("change", () => {
  sogliaBase = leggiSogliaBase();
  sogliaBaseScelta = true;
  registra(`Soglia base a ${numero(sogliaBase, 3)}`);
  aggiornaRisultati();
});
campo("esempi").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b || !archivio) return;
  const persona = b.dataset["ascolta"] ?? b.dataset["cancella"];
  if (b.dataset["ascolta"] !== undefined && persona !== undefined) {
    const ultimo = elencoEsempi.filter((x) => x.tipo === "parola" && x.persona === persona).at(-1);
    if (ultimo) void archivio.dati(ultimo.id).then((d) => d?.pcm && suona(d.pcm));
    return;
  }
  const ids =
    b.dataset["cancellaNormale"] !== undefined
      ? elencoEsempi.filter((x) => x.tipo === "normale").map((x) => x.id)
      : elencoEsempi.filter((x) => x.tipo === "parola" && x.persona === persona).map((x) => x.id);
  const chi = b.dataset["cancellaNormale"] !== undefined ? "il parlato normale" : `gli esempi di ${persona}`;
  if (
    !confirm(
      `Cancello ${chi} da questo telefono? Non si recuperano. Il verificatore già addestrato resta finché non lo riaddestri o lo cancelli.`,
    )
  )
    return;
  void archivio.cancella(ids).then(async () => {
    registra(`Cancellati ${chi}`);
    await aggiornaElenco();
  });
});
pulsante("cancella-tutto").addEventListener("click", () => {
  if (!archivio) return;
  if (!confirm("Cancello da questo telefono tutti gli esempi di voce e il verificatore? Non si recuperano."))
    return;
  void archivio.svuota().then(async () => {
    impostaVerificatore(null, "", false);
    registra("Esempi e verificatore cancellati");
    await aggiornaElenco();
  });
});
pulsante("esporta").addEventListener("click", () => {
  if (!verificatore) return;
  // solo i numeri del verificatore: nessun audio, nessuna caratteristica degli esempi
  const blob = new Blob([JSON.stringify(verificatore)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `verificatore-${modello.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  registra("Verificatore esportato (solo i pesi, nessun audio)");
});
$<HTMLInputElement>('[data-test="importa"]').addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  void file.text().then(async (testo) => {
    try {
      const v = JSON.parse(testo) as unknown;
      if (!verificatoreValido(v) || v.pesi.length !== LUNGHEZZA_CARATTERISTICHE)
        throw new Error("non è un verificatore di questa versione");
      await archivio?.salvaVerificatore(v);
      impostaVerificatore(v, `importato da ${file.name}`, true);
      registra(`Verificatore importato da ${file.name}`);
    } catch (errore) {
      registra(`Importazione non riuscita: ${descriviErrore(errore)}`);
      stato(`Importazione non riuscita: ${descriviErrore(errore)}`);
    }
  });
});

function suona(pcm: Int16Array): void {
  const contesto = new AudioContext();
  const buffer = contesto.createBuffer(1, pcm.length, 16000);
  const canale = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) canale[i] = (pcm[i] ?? 0) / 32768;
  const sorgente = contesto.createBufferSource();
  sorgente.buffer = buffer;
  sorgente.connect(contesto.destination);
  sorgente.onended = () => void contesto.close();
  sorgente.start();
}

/** All'apertura: parola.json (se c'è), archivio locale, verificatore salvato. */
async function preparaVerificatore(): Promise<void> {
  const { impostazioni, trovato, avvisi } = await caricaImpostazioni();
  for (const a of avvisi) registra(`parola.json: ${a}`);
  if (impostazioni.modello) {
    const { url, ...descrizione } = impostazioni.modello;
    modello = descrizione;
    urlModello = new URL(url, location.href).href;
    mostraModello();
  }
  if (impostazioni.soglia !== undefined) {
    soglia = impostazioni.soglia;
    $<HTMLInputElement>("#soglia").value = String(soglia);
    campo("soglia").textContent = numero(soglia);
  }
  if (impostazioni.sogliaBase !== undefined) {
    sogliaBase = impostazioni.sogliaBase;
    sogliaBaseScelta = true;
    $<HTMLInputElement>('[data-test="soglia-base"]').value = String(sogliaBase);
  }
  testoImpostazioni = trovato
    ? `parola.json (${
        [
          impostazioni.modello ? `modello ${impostazioni.modello.id}` : null,
          impostazioni.soglia !== undefined ? `soglia ${numero(impostazioni.soglia)}` : null,
          impostazioni.sogliaBase !== undefined ? `soglia base ${numero(impostazioni.sogliaBase, 3)}` : null,
          impostazioni.verificatore ? "verificatore condiviso" : null,
        ]
          .filter(Boolean)
          .join(", ") || "vuoto"
      })${avvisi.length ? `, ${avvisi.length} avvisi nel registro` : ""}`
    : "valori predefiniti (parola.json assente)";
  if (trovato) registra(`Impostazioni lette da parola.json: ${testoImpostazioni}`);
  try {
    archivio = await ArchivioParola.apri();
    const locale = await archivio.verificatore();
    if (locale) impostaVerificatore(locale, "addestrato su questo telefono", true);
    await aggiornaElenco();
  } catch (errore) {
    registra(`Archivio locale non disponibile (${descriviErrore(errore)}): niente esempi né verificatore`);
    for (const a of ["registra-parola", "registra-normale", "addestra"]) pulsante(a).disabled = true;
  }
  // verificatore condiviso da parola.json, solo se su questo telefono non ce n'è uno
  if (!verificatore && impostazioni.verificatore) {
    try {
      const risposta = await fetch(impostazioni.verificatore, { cache: "no-store" });
      const v = (await risposta.json()) as unknown;
      if (!risposta.ok || !verificatoreValido(v)) throw new Error(`risposta ${risposta.status} non valida`);
      impostaVerificatore(v, `condiviso (${impostazioni.verificatore})`, true);
    } catch (errore) {
      registra(`Verificatore di parola.json non caricato: ${descriviErrore(errore)}`);
    }
  }
  aggiornaRisultati();
}
void preparaVerificatore();

// --- comandi ---------------------------------------------------------------------
pulsante("avvia").addEventListener("click", () => void avvia());
pulsante("ferma").addEventListener("click", () => ferma("tocco"));
$<HTMLInputElement>("#soglia").addEventListener("input", (e) => {
  soglia = Number((e.target as HTMLInputElement).value);
  campo("soglia").textContent = numero(soglia);
  registra(`Soglia a ${numero(soglia)}`);
});
for (const sel of ['[data-test="temperatura"]', '[data-test="calore"]'])
  $(sel).addEventListener("change", aggiornaRisultati);
window.addEventListener("error", (e) => registra(`Errore: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => registra(`Errore: ${descriviErrore(e.reason)}`));
aggiornaRisultati();
