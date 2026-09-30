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
import { MemoriaCircolare } from "../parola/memoria";
import { CAMPIONI_FRAME, RilevatoreOpenWakeWord, type DescrizioneModello } from "../parola/rilevatore";
import { passaAllOrigineVeloce, statoOrigine } from "../pwa/origine";
import { Bip } from "../voce/audio";
import { Microfono } from "../voce/microfono";

// Come il pannello: dal link di riserva (lento sui dati) si passa alla veloce se risponde.
passaAllOrigineVeloce();

/** Il modello di questa prova. Sostituibile: la pagina usa solo questi dati. */
const MODELLO: DescrizioneModello = {
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

for (const e of document.querySelectorAll("[data-parola]")) e.textContent = MODELLO.parola;
$("[data-modello]").textContent = MODELLO.id;
$("[data-licenza]").textContent = MODELLO.licenza;

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
  detti: number;
  riconosciuti: number;
  inizio: number;
  fine: number | null;
}
const serie: Serie[] = [];
let serieInCorso: Serie | null = null;
let falsi: { inizio: number; fine: number | null; attivazioni: number } | null = null;
const letture: string[] = [];
// Memoria circolare: SOLO in RAM, mai inviata né salvata (qui non si invia niente del tutto)
const memoria = new MemoriaCircolare(3.5);
let scatto: { prima: Int16Array; dopo: Int16Array[]; mancano: number } | null = null;

// --- avvio e arresto --------------------------------------------------------
async function caricaModello(): Promise<RilevatoreOpenWakeWord> {
  if (rilevatore) return rilevatore;
  // un solo thread: su HA non ci sono gli header per SharedArrayBuffer (e sui telefoni vecchi è meglio)
  ort.env.wasm.numThreads = 1;
  const t0 = performance.now();
  stato("Carico il modello…");
  rilevatore = await RilevatoreOpenWakeWord.crea(ort, MODELLO, {
    melspettrogramma: urlMel,
    embedding: urlEmbedding,
    classificatore: urlClassificatore,
  });
  msCaricamento = performance.now() - t0;
  registra(`Modello ${MODELLO.id} caricato in ${Math.round(msCaricamento)} ms`);
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
    stato(`In ascolto. Di' «${MODELLO.parola}».`);
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
    for (const e of esiti) suFrame(e.punteggio, e.msCalcolo);
  } catch (errore) {
    registra(`Errore del modello: ${descriviErrore(errore)}`);
  } finally {
    inCoda -= 1;
  }
}

function suFrame(punteggio: number, ms: number): void {
  frameTotali += 1;
  tempi.push(ms);
  if (tempi.length > 2000) tempi.shift();
  storico.push(punteggio);
  if (storico.length > 125) storico.shift();
  const adesso = Date.now();
  if (punteggio >= soglia && adesso - ultimaAttivazione > PAUSA_DOPO_ATTIVAZIONE_MS) {
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
    registra(`ATTIVAZIONE (punteggio ${numero(punteggio)}, soglia ${numero(soglia)})`);
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
    "<tr><th>Come</th><th>Distanza</th><th>Soglia</th><th>Detti</th><th>Riconosciuti</th><th>%</th></tr>" +
    serie
      .map(
        (s) =>
          `<tr><td>${s.come}</td><td>${s.distanza}</td><td>${numero(s.soglia)}</td><td>${s.detti}</td><td>${s.riconosciuti}</td><td>${Math.round(
            (Math.min(s.riconosciuti, s.detti) / s.detti) * 100,
          )}%</td></tr>`,
      )
      .join("");
  aggiornaRisultati();
});

pulsante("falsi").addEventListener("click", () => {
  const b = pulsante("falsi");
  if (!falsi || falsi.fine !== null) {
    falsi = { inizio: Date.now(), fine: null, attivazioni: 0 };
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
    `PROVA «${MODELLO.parola}» — ${new Date().toLocaleString("it-IT")}`,
    `Modello: ${MODELLO.id} (${MODELLO.licenza}), caricato in ${Math.round(msCaricamento)} ms`,
    `Indirizzo: ${location.origin} (${testoOrigine()})`,
    `Dispositivo: ${navigator.userAgent}`,
    `Core: ${navigator.hardwareConcurrency}, memoria: ${nav.deviceMemory ?? "?"} GB, microfono a ${frequenza} Hz`,
    `Ascolto: ${numero(durata, 1)} min, frame ${frameTotali}, scartati ${Math.round(frameScartati)}`,
    `Tempo per frame: media ${numero(s.media, 1)} ms, 95% ${numero(s.p95, 1)} ms, max ${numero(s.max, 1)} ms, carico ${Math.round((s.media / 80) * 100)}%`,
    `Soglia: ${numero(soglia)}  Attivazioni totali: ${attivazioni}`,
    ...serie.map(
      (x) =>
        `Serie ${x.come} a ${x.distanza}, soglia ${numero(x.soglia)}: ${x.riconosciuti}/${x.detti} riconosciuti`,
    ),
    `Memoria circolare: ${numero(memoria.secondi, 1)} s`,
    falsi
      ? `Falsi positivi (TV): ${falsi.attivazioni} in ${numero(((falsi.fine ?? Date.now()) - falsi.inizio) / 60_000, 1)} min`
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
