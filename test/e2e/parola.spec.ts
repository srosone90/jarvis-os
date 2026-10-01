import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accedi, apriDiagnostica, apriImpostazioni, comando, info } from "./aiuti";

/**
 * «Jarvis» sempre in ascolto (v0.5.0) contro il finto HA, col motore VERO
 * (onnxruntime, modelli, service worker). Il microfono finto di Chromium suona
 * un tono, che non è la parola: per farla "sentire" si usa un verificatore che
 * dice sempre sì (come la prova del 30/09) servito da `parola.json`, con un
 * ritardo che decide QUANDO il motore parte. Che il riconoscimento sia fedele
 * a openWakeWord è provato a parte (CLAUDE.md, "Ehi Jarvis").
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

/** Le prove partono con «Jarvis» spento (stato-iniziale.json): qui lo si accende. */
async function acceso(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
}

/** Verificatore che dice sempre sì: «Jarvis» scatta appena il motore è pronto (dopo `ritardo` ms). */
async function sempreSi(request: APIRequestContext, ritardo = 0): Promise<void> {
  await comando(request, "file", {
    nome: "verificatore-prova.json",
    contenuto: JSON.stringify({
      versione: 1,
      modello: "hey_jarvis_v0.1",
      media: new Array(1536).fill(0),
      scala: new Array(1536).fill(1),
      pesi: new Array(1536).fill(0),
      intercetta: 20,
      info: { positivi: 1, negativi: 1, persone: ["Prova"], creato: "", iterazioni: 0, accuratezza: 1 },
    }),
  });
  // soglia base minuscola: il verificatore viene consultato anche col tono del microfono finto
  await comando(request, "file", {
    nome: "parola.json",
    contenuto: JSON.stringify({ sogliaBase: 0.000001, verificatore: "./verificatore-prova.json" }),
    ritardo,
  });
}

const indicatore = (page: Page) => page.getByTestId("indicatore-parola");
const PRONTO = { timeout: 30_000 };

test("acceso di serie: indicatore del microfono, in ascolto, e a HA non parte niente senza la parola", async ({
  page,
  request,
}) => {
  const errori: string[] = [];
  page.on("pageerror", (e) => errori.push(e.message));
  // pannello nuovo: nessuna scelta salvata = acceso
  await page.addInitScript(() => localStorage.removeItem("jarvis-parola"));
  await accedi(page);
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  await page.waitForTimeout(3000);
  expect((await info(request)).richiesteAssistente).toEqual([]);
  await apriImpostazioni(page, "voce");
  await expect(page.getByTestId("stato-parola")).toHaveAttribute("data-stato", "ascolta");
  await expect(page.getByTestId("parola-acceso")).toBeChecked();
  await expect
    .poll(async () =>
      Number((await page.getByTestId("misure-parola").textContent())?.match(/^\s*(\d+)/)?.[1]),
    )
    .toBeGreaterThan(25);
  await expect(page.getByTestId("misure-parola")).toContainText("sentito 0 volte");
  // il motore (17 MB) non è nel bundle iniziale: arriva da parola/ dopo l'avvio
  const richieste = (await info(request)).richieste;
  expect(Object.keys(richieste).some((f) => /^parola\/ort-wasm.*\.wasm$/.test(f))).toBe(true);
  expect(errori).toEqual([]);
});

test("il motore (17 MB) si scarica una volta: ricaricando arriva dalla cache sua, non dalla rete", async ({
  page,
  request,
}) => {
  await acceso(page);
  await accedi(page);
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  // i 5 file di parola/ (motore, wasm, 3 modelli) nella cache "jarvis-parola"
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open("jarvis-parola")).keys()).length))
    .toBe(5);
  const prima = (await info(request)).richieste;
  await page.reload();
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  const dopo = (await info(request)).richieste;
  for (const f of Object.keys(dopo).filter((x) => x.startsWith("parola/")))
    expect(dopo[f], `richieste per ${f}`).toBe(prima[f]);
});

test("«Jarvis» sentito: pipeline normale SENZA no_vad, con la parola e il secondo di prima", async ({
  page,
  request,
}) => {
  await acceso(page);
  await sempreSi(request);
  await accedi(page);
  await expect.poll(async () => (await info(request)).richiesteAssistente.length, PRONTO).toBeGreaterThan(0);
  const [r] = (await info(request)).richiesteAssistente;
  expect(r).toMatchObject({ start_stage: "stt", end_stage: "tts", wake_word_phrase: "Jarvis", no_vad: null });
  // la memoria (al massimo 1 s: 16 kHz × 16 bit = 32000 byte) arriva tutta subito, prima dell'audio
  // dal vivo. Qui il verificatore finto scatta appena il motore parte, a memoria piena per ~0,6 s;
  // col solo audio dal vivo nei primi 150 ms arriverebbero al massimo 3 pezzi (6144 byte)
  const [audio] = (await info(request)).audioVoce;
  expect(audio?.sampleRate).toBe(16000);
  expect(audio?.byteSubito).toBeGreaterThanOrEqual(16000);
  // dal pannello completo: il riquadro piccolo, con la risposta
  await expect(page.getByTestId("riquadro-voce")).toContainText("In camera ci sono 25,1°", {
    timeout: 15_000,
  });
});

test("dal riposo: «Jarvis» apre l'Hub con domanda e risposta come sottotitoli", async ({ page, request }) => {
  await acceso(page);
  await page.addInitScript(() =>
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 })),
  );
  // il motore parte dopo 9 s: intanto si mette il pannello a riposo
  await sempreSi(request, 9000);
  await accedi(page);
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(page.getByTestId("riposo")).toBeVisible();
  expect((await info(request)).richiesteAssistente).toEqual([]);
  await expect(page.getByTestId("hub")).toBeVisible(PRONTO);
  await expect(page.getByTestId("hub-domanda")).toHaveText("«Che temperatura c'è in camera?»");
  await expect(page.getByTestId("hub-risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  expect((await info(request)).richiesteAssistente[0]?.wake_word_phrase).toBe("Jarvis");
});

/** Un timer che suona, prima che «Jarvis» parta (parola.json arriva dopo 7 s). */
async function timerCheSuona(page: Page, request: APIRequestContext, trascrizione: string): Promise<void> {
  await acceso(page);
  await comando(request, `assistente?trascrizione=${encodeURIComponent(trascrizione)}`);
  await sempreSi(request, 7000);
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", {
    tipo: "finished",
    id: "p",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 0,
  });
  await expect(page.getByTestId("timer-finito")).toContainText("Timer pasta finito");
  expect((await info(request)).richiesteAssistente).toEqual([]);
}

test("mentre suona un timer: «Jarvis, stop» lo ferma qui e sugli altri, senza passare da Gemini", async ({
  page,
  request,
}) => {
  await timerCheSuona(page, request, "Jarvis, stop.");
  // la parola zittisce la suoneria e la pipeline si ferma al testo
  await expect.poll(async () => (await info(request)).richiesteAssistente.length, PRONTO).toBeGreaterThan(0);
  expect((await info(request)).richiesteAssistente[0]).toMatchObject({
    start_stage: "stt",
    end_stage: "stt",
    wake_word_phrase: "Jarvis",
  });
  await expect(page.getByTestId("timer-finito")).toHaveCount(0);
  const i = await info(request);
  expect(i.chiamate.some((c) => c.servizio === "jarvis_voce.timer_ferma" && c.dati["id"] === "p")).toBe(true);
  // «stop» non è andato a Gemini: nessuna pipeline dal testo
  expect(i.richiesteAssistente.filter((x) => x.start_stage === "intent")).toEqual([]);
});

test("mentre suona un timer: un'altra domanda ha la sua risposta a voce, e la suoneria non riparte", async ({
  page,
  request,
}) => {
  await timerCheSuona(page, request, "Jarvis, che temperatura c'è in camera?");
  await expect
    .poll(
      async () => (await info(request)).richiesteAssistente.map((x) => `${x.start_stage}→${x.end_stage}`),
      PRONTO,
    )
    .toEqual(expect.arrayContaining(["stt→stt", "intent→tts"]));
  const seguito = (await info(request)).richiesteAssistente.find((x) => x.start_stage === "intent");
  expect(seguito?.testo).toBe("Jarvis, che temperatura c'è in camera?");
  await expect(page.getByTestId("riquadro-voce")).toContainText("In camera ci sono 25,1°", {
    timeout: 15_000,
  });
  // il riquadro "Timer finito" resta (lo chiude Stop), ma zitto
  await expect(page.getByTestId("timer-finito")).toBeVisible();
  await expect.poll(async () => (await info(request)).richiesteTts.length).toBeGreaterThan(0);
  expect((await info(request)).chiamate.some((c) => c.servizio === "jarvis_voce.timer_ferma")).toBe(false);
});

test("un altro pannello ha sentito la stessa «Jarvis»: qui niente errore, risponde lui", async ({
  page,
  request,
}) => {
  await acceso(page);
  await comando(request, "assistente?doppione=1");
  await sempreSi(request);
  await accedi(page);
  await expect.poll(async () => (await info(request)).richiesteAssistente.length, PRONTO).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await expect(page.getByText("Ha risposto un altro pannello.")).toHaveCount(0);
  await expect(page.getByText("Non ho capito")).toHaveCount(0);
  // HA ha davvero scartato la domanda di questo pannello, e il pannello l'ha capito
  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText(
    "«Jarvis» sentito anche da un altro pannello, risponde lui",
  );
});

test("tocco sul microfono con «Jarvis» in ascolto: stesso microfono, e dopo la risposta resta in ascolto", async ({
  page,
  request,
}) => {
  await acceso(page);
  await accedi(page);
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  await page.getByRole("button", { name: "Parla con Jarvis" }).click();
  await expect(page.getByTestId("riquadro-voce")).toContainText("In camera ci sono 25,1°", {
    timeout: 15_000,
  });
  const [r] = (await info(request)).richiesteAssistente;
  // col tocco niente parola: HA non deve scartarla come doppione
  expect(r).toMatchObject({ start_stage: "stt", end_stage: "tts", wake_word_phrase: null });
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta");
});

test("spento dalle impostazioni: microfono chiuso e indicatore via, anche dopo una ricarica", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tracceVive: number };
    w.__tracceVive = 0;
    const originale = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const flusso = await originale(c);
      for (const t of flusso.getTracks()) {
        w.__tracceVive++;
        const stop = t.stop.bind(t);
        t.stop = () => {
          w.__tracceVive--;
          stop();
        };
      }
      return flusso;
    };
  });
  await acceso(page);
  await accedi(page);
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  const tracce = () => page.evaluate(() => (window as unknown as { __tracceVive: number }).__tracceVive);
  expect(await tracce()).toBe(1);
  await apriImpostazioni(page, "voce");
  await page.getByTestId("parola-acceso").uncheck();
  await expect(page.getByTestId("stato-parola")).toHaveAttribute("data-stato", "spento");
  expect(await tracce()).toBe(0);
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(indicatore(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("jarvis-parola"))).toBe('{"acceso":false}');
});

test("Insegna a Jarvis la tua pronuncia: inviti a tempo, annullabile, e senza esempi non si addestra", async ({
  page,
}) => {
  await acceso(page);
  await accedi(page);
  await expect(indicatore(page)).toHaveAttribute("data-stato", "ascolta", PRONTO);
  await apriImpostazioni(page, "voce");
  await expect(page.getByTestId("addestra")).toBeDisabled();
  await expect(page.getByTestId("registra-parola")).toBeDisabled();
  await page.getByTestId("pronuncia-persona").fill("Salvatore");
  await page.getByTestId("registra-parola").click();
  const invito = page.getByTestId("invito");
  await expect(invito).toContainText("Preparati");
  await expect(invito).toContainText("Di' «Jarvis» adesso · 1/20", { timeout: 5000 });
  await page.getByTestId("annulla-registrazione").click();
  await expect(invito).toHaveCount(0);
  await page.getByTestId("registra-normale").click();
  await expect(invito).toContainText("Parla normalmente");
  await page.getByTestId("annulla-registrazione").click();
  await expect(page.getByTestId("esito-addestramento")).toContainText("Servono sia gli esempi");
});
