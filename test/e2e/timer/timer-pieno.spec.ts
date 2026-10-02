import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "../aiuti";

/**
 * Timer a tutto schermo (v0.6.2, richiesta di Salvatore del 02/10): con un
 * timer attivo, quando nessuno tocca il pannello per `timerPienoSecondi` il
 * timer copre tutto; un tocco riporta al pannello e poi il timer torna. Qui i
 * secondi sono 5, il minimo delle impostazioni (con meno il pannello li porta
 * comunque a 5: la release della v0.6.2 è caduta proprio per una prova che ne
 * chiedeva 3 e aspettava al massimo 6 s), per non aspettare i 15 di serie.
 */

const SECONDI = 5;
const PASTA = { id: "t-pasta", nome: "pasta", secondi_totali: 600 };

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript((s) => {
    localStorage.setItem("jarvis-schermate", JSON.stringify({ timerPienoSecondi: s }));
    localStorage.setItem("jarvis-stanza-pannello", "Cucina");
    // niente notte del riposo e niente riposo durante la prova: dipenderebbero dall'ora
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 10, notteDa: 0, notteA: 0 }));
  }, SECONDI);
});

const pieno = (page: Page) => page.getByTestId("timer-pieno");

async function avviaTimer(page: Page, request: Parameters<typeof comando>[0], extra: object = {}) {
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 600, ...extra });
  await expect(page.getByTestId("timer")).toContainText("pasta");
}

test("timer attivo e nessuno tocca: copre tutto; un tocco riporta al pannello, poi torna", async ({
  page,
  request,
}) => {
  await avviaTimer(page, request);
  // appena partito c'è stata attività: non subito
  await page.waitForTimeout(1000);
  await expect(pieno(page)).toHaveCount(0);
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
  await expect(pieno(page)).toContainText("pasta");
  await expect(page.getByTestId("timer-pieno-rimasto")).toHaveText(/^(10:00|9:[45]\d)$/);
  // scorre da solo
  const prima = await page.getByTestId("timer-pieno-rimasto").textContent();
  await expect(page.getByTestId("timer-pieno-rimasto")).not.toHaveText(prima ?? "", { timeout: 3000 });
  // copre davvero: un tocco sul timer non arriva a ciò che c'è sotto
  await pieno(page).click();
  await expect(pieno(page)).toBeHidden();
  await expect(page.getByTestId("vista-riposo")).toHaveCount(0);
  // il pannello si usa: un tocco su una schermata funziona, e il conto riparte da quel tocco
  await page.getByTestId("colonna-timer").click();
  await expect(page.getByTestId("pagina-timer")).toBeVisible();
  await expect(pieno(page)).toBeHidden();
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
});

test("in pausa: lo dice; due timer: in grande quello che finisce prima, l'altro sotto", async ({
  page,
  request,
}) => {
  await avviaTimer(page, request, { secondi_rimasti: 300, in_pausa: true });
  await comando(request, "timer", {
    tipo: "started",
    id: "t-uova",
    nome: "uova",
    secondi_totali: 600,
    secondi_rimasti: 500,
  });
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
  // quello in pausa (5:00) non scorre: in grande va quello che scorre
  await expect(pieno(page)).toContainText("uova");
  await expect(page.getByTestId("timer-pieno-altri")).toContainText("pasta 5:00");
  await comando(request, "timer", { tipo: "cancelled", id: "t-uova", nome: "uova", secondi_totali: 600 });
  await expect(pieno(page)).toContainText("pasta");
  await expect(pieno(page)).toContainText("in pausa");
  await expect(page.getByTestId("timer-pieno-rimasto")).toHaveText("5:00");
  await comando(request, "timer", { tipo: "cancelled", ...PASTA, secondi_rimasti: 300 });
  // nessun timer: sparisce da solo
  await expect(pieno(page)).toHaveCount(0);
});

test("il timer suona: «Timer finito» con lo Stop, non il timer a tutto schermo", async ({
  page,
  request,
}) => {
  await avviaTimer(page, request);
  // un secondo timer che continua a scorrere mentre il primo suona
  await comando(request, "timer", {
    tipo: "started",
    id: "t-uova",
    nome: "uova",
    secondi_totali: 600,
    secondi_rimasti: 500,
  });
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
  await comando(request, "timer", { tipo: "finished", ...PASTA, secondi_rimasti: 0 });
  await expect(page.getByTestId("timer-finito")).toContainText("Timer pasta finito");
  // anche oltre i secondi senza tocchi: sotto lo Stop non si rimette niente
  await page.waitForTimeout((SECONDI + 2) * 1000);
  await expect(pieno(page)).toBeHidden();
  await page.getByTestId("timer-stop").click();
  await expect(page.getByTestId("timer-finito")).toHaveCount(0);
  // finita la suoneria, l'altro timer torna a tutto schermo
  // (la fine della suoneria conta come attività: il conto riparte da lì)
  await expect(pieno(page)).toContainText("uova", { timeout: (SECONDI + 7) * 1000 });
});

test("Jarvis parla e ascolta: il timer si toglie e resta via finché la voce ha finito", async ({
  page,
  request,
}) => {
  await avviaTimer(page, request);
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
  await expect.poll(async () => (await info(request)).iscrittiAnnunci).toBeGreaterThanOrEqual(1);
  await comando(request, "annuncio", {
    pannello: "jarvis_cucina",
    testo: "La pasta è quasi pronta: la scolo?",
    ascolta: true,
  });
  await expect(page.getByTestId("hub-risposta")).toHaveText("La pasta è quasi pronta: la scolo?");
  await expect(pieno(page)).toBeHidden();
  // «Ti ascolto ancora» (8 s): più dei secondi senza tocchi, ma la voce è attiva
  await expect(page.getByTestId("hub-ascolto-ancora")).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout((SECONDI + 2) * 1000);
  await expect(page.getByTestId("hub-ascolto-ancora")).toBeVisible();
  await expect(pieno(page)).toBeHidden();
  // finito l'ascolto, dopo i secondi senza tocchi il timer torna
  await expect(page.getByTestId("hub-ascolto-ancora")).toHaveCount(0, { timeout: 10_000 });
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
});

test("spento nelle impostazioni: mai a tutto schermo; riacceso col ripristino, torna", async ({
  page,
  request,
}) => {
  await avviaTimer(page, request);
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("serie-timer-pieno-secondi")).toHaveText("Di serie: 15 secondi");
  await page.getByTestId("campo-timer-pieno").uncheck();
  await expect(page.getByTestId("campo-timer-pieno-secondi")).toBeVisible();
  await page.getByTestId("chiudi-impostazioni").click();
  await page.waitForTimeout((SECONDI + 3) * 1000);
  await expect(pieno(page)).toHaveCount(0);
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("ripristina-timer-pieno").click();
  await expect(page.getByTestId("campo-timer-pieno")).toBeChecked();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(pieno(page)).toBeVisible({ timeout: (SECONDI + 3) * 1000 });
});
