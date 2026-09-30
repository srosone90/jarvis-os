import { expect, test, type Browser, type Page } from "@playwright/test";
import { accedi, apriChat, apriDiagnostica, chiedi, comando, HA, info, pallino } from "./aiuti";

/**
 * Timer di jarvis_voce (v0.4.5): l'evento `jarvis_timer` di HA diventa il conto
 * alla rovescia sotto l'orologio e, a `finished`, la suoneria con "Timer …
 * finito" e lo Stop grande. Formato dell'evento dalla sessione server (30/09):
 * {tipo: started|updated|cancelled|finished, id, nome, secondi_totali, secondi_rimasti}.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const PASTA = { id: "t-pasta", nome: "pasta", secondi_totali: 600 };

/** Conta le note della suoneria (oscillatori creati) senza toccare l'audio vero. */
async function contaNote(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __note: number };
    w.__note = 0;
    const originale = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__note++;
      return originale.call(this);
    };
  });
}
const note = (page: Page) => page.evaluate(() => (window as unknown as { __note: number }).__note);

test("started, updated, cancelled: il conto alla rovescia compare, scorre, cambia e sparisce", async ({
  page,
  request,
}) => {
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await expect(page.getByTestId("timer")).toHaveCount(0);

  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 600 });
  const t = page.getByTestId("timer");
  await expect(t).toContainText("pasta");
  await expect(t.getByTestId("timer-rimasto")).toHaveText(/^(10:00|9:5\d)$/);
  // scorre da solo, un secondo alla volta
  await expect(t.getByTestId("timer-rimasto")).toHaveText(/^9:5\d$/, { timeout: 5000 });

  await comando(request, "timer", { tipo: "updated", ...PASTA, secondi_rimasti: 125 });
  await expect(t.getByTestId("timer-rimasto")).toHaveText(/^2:0[0-5]$/);

  await comando(request, "timer", { tipo: "cancelled", ...PASTA, secondi_rimasti: 120 });
  await expect(page.getByTestId("timer")).toHaveCount(0);
});

test("finished: suona a ripetizione con 'Timer pasta finito'; Stop la ferma", async ({ page, request }) => {
  await contaNote(page);
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 3 });
  await comando(request, "timer", { tipo: "finished", ...PASTA, secondi_rimasti: 0 });

  const overlay = page.getByTestId("timer-finito");
  await expect(overlay).toContainText("Timer pasta finito");
  await expect(page.getByTestId("timer")).toHaveCount(0);
  // più giri del motivo: suona a ripetizione, non una volta sola
  await expect.poll(() => note(page), { timeout: 6000 }).toBeGreaterThanOrEqual(6);

  await page.getByTestId("timer-stop").click();
  await expect(overlay).toHaveCount(0);
  const dopoStop = await note(page);
  await page.waitForTimeout(2500);
  expect(await note(page)).toBe(dopoStop);
});

test("finished sopra la chat aperta: lo Stop si tocca, poi la chat è ancora lì", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriChat(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "finished", id: "t9", nome: null, secondi_totali: 60 });
  await expect(page.getByTestId("timer-finito")).toContainText("Timer finito");
  // click vero: Playwright controlla che niente copra il pulsante
  await page.getByTestId("timer-stop").click();
  await expect(page.getByTestId("timer-finito")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
});

test("dopo che HA si riavvia i timer arrivano ancora (iscrizione rinnovata)", async ({ page, request }) => {
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "spegni");
  await expect(pallino(page)).not.toHaveAttribute("data-stato", "connesso", { timeout: 10_000 });
  await comando(request, "accendi");
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 30_000 });
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 300 });
  await expect(page.getByTestId("timer")).toContainText("pasta");
});

// --- ognuno sul suo pannello (v0.4.6, jarvis_voce 0.1.8) ---

/** Un pannello in un contesto suo (come un altro tablet), con la stanza già scelta. */
async function pannello(
  browser: Browser,
  stanza: string | null,
): Promise<{ pagina: Page; chiudi: () => Promise<void> }> {
  const contesto = await browser.newContext();
  if (stanza) await contesto.addInitScript((s) => localStorage.setItem("jarvis-stanza-pannello", s), stanza);
  const pagina = await contesto.newPage();
  await pagina.goto(`${HA}/local/jarvis/index.html`);
  await pagina.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(pagina)).toHaveAttribute("data-stato", "connesso");
  return { pagina, chiudi: () => contesto.close() };
}

/** Domanda scritta nella chat del pannello. */
async function chiediDa(p: Page, testo: string): Promise<void> {
  await apriChat(p);
  await chiedi(p, testo);
  await expect(p.getByTestId("risposta").last()).toContainText("Timer");
  await p.getByRole("button", { name: "Chiudi" }).click();
}

test("ogni domanda porta il device_id del pannello (voce e chat); senza stanza non si manda", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Camera da letto"));
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "che ore sono?");
  await expect(page.getByTestId("risposta")).toHaveCount(1);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("risposta")).toHaveCount(2);
  await expect
    .poll(async () => (await info(request)).richiesteAssistente.map((r) => r.device_id))
    .toEqual(["jarvis_camera_da_letto", "jarvis_camera_da_letto"]);

  await page.evaluate(() => localStorage.removeItem("jarvis-stanza-pannello"));
  await chiedi(page, "e adesso?");
  await expect(page.getByTestId("risposta")).toHaveCount(3);
  expect((await info(request)).richiesteAssistente[2]?.device_id).toBeNull();
});

test("timer chiesto dalla cucina suona solo in cucina; 'in camera da letto' suona solo in camera", async ({
  browser,
  request,
}) => {
  const cucina = await pannello(browser, "Cucina");
  const camera = await pannello(browser, "Camera da letto");
  try {
    await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(2);
    await comando(request, "assistente?modo=timer");
    await chiediDa(cucina.pagina, "metti un timer per la pasta");
    await expect(cucina.pagina.getByTestId("timer")).toContainText("pasta");
    await expect(cucina.pagina.getByTestId("timer-finito")).toContainText("Timer pasta finito");
    await expect(camera.pagina.getByTestId("timer")).toHaveCount(0);
    await expect(camera.pagina.getByTestId("timer-finito")).toHaveCount(0);
    await cucina.pagina.getByTestId("timer-stop").click();

    await comando(request, "assistente?modo=timer-camera");
    await chiediDa(cucina.pagina, "metti un timer in camera da letto");
    await expect(camera.pagina.getByTestId("timer-finito")).toContainText("Timer pasta finito");
    await camera.pagina.waitForTimeout(500);
    await expect(cucina.pagina.getByTestId("timer-finito")).toHaveCount(0);
  } finally {
    await Promise.all([cucina.chiudi(), camera.chiudi()]);
  }
});

test("Stop su un pannello ferma anche l'altro che suona per lo stesso timer", async ({
  browser,
  request,
}) => {
  // stessa stanza: stesso device_id, suonano entrambi (va bene così)
  const a = await pannello(browser, "Cucina");
  const b = await pannello(browser, "Cucina");
  try {
    await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(2);
    await comando(request, "timer", {
      tipo: "finished",
      ...PASTA,
      secondi_rimasti: 0,
      pannello: "jarvis_cucina",
    });
    await expect(a.pagina.getByTestId("timer-finito")).toBeVisible();
    await expect(b.pagina.getByTestId("timer-finito")).toBeVisible();
    await a.pagina.getByTestId("timer-stop").click();
    await expect(a.pagina.getByTestId("timer-finito")).toHaveCount(0);
    await expect(b.pagina.getByTestId("timer-finito")).toHaveCount(0);
    const chiamate = (await info(request)).chiamate.filter((c) => c.servizio === "jarvis_voce.timer_ferma");
    expect(chiamate.map((c) => c.dati)).toEqual([{ id: PASTA.id }]);
  } finally {
    await Promise.all([a.chiudi(), b.chiudi()]);
  }
});

test("timer partito mentre il pannello era scollegato: alla riconnessione lo rilegge (solo i suoi)", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
  await accedi(page);
  await comando(request, "spegni");
  await expect(pallino(page)).not.toHaveAttribute("data-stato", "connesso", { timeout: 10_000 });
  await comando(request, "timer", {
    tipo: "started",
    ...PASTA,
    secondi_rimasti: 300,
    pannello: "jarvis_cucina",
  });
  await comando(request, "timer", {
    tipo: "started",
    id: "t-letto",
    nome: "riposo",
    secondi_totali: 600,
    secondi_rimasti: 600,
    pannello: "jarvis_camera_da_letto",
  });
  await comando(request, "accendi");
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 30_000 });
  await expect(page.getByTestId("timer")).toHaveCount(1);
  await expect(page.getByTestId("timer")).toContainText("pasta");
  await expect(page.getByTestId("timer-rimasto")).toHaveText(/^[45]:\d\d$/);

  // cambiata la stanza in diagnostica: ora sono suoi i timer della camera
  await apriDiagnostica(page);
  await page.getByTestId("stanza-pannello").selectOption("Camera da letto");
  await page.getByTestId("chiudi-diagnostica").click();
  await expect(page.getByTestId("timer")).toHaveCount(1);
  await expect(page.getByTestId("timer")).toContainText("riposo");
});

test("server senza timer_attivi (jarvis_voce vecchio): gli eventi funzionano, l'errore va nel log", async ({
  page,
  request,
}) => {
  await comando(request, "jarvis-voce?installato=0");
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 300 });
  await expect(page.getByTestId("timer")).toContainText("pasta");
  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("jarvis_voce.timer_attivi non riuscito");
});

test("timer in pausa (jarvis_voce 0.2.3): il conto si ferma e lo dice; alla ripresa riparte da lì", async ({
  page,
  request,
}) => {
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", { tipo: "started", ...PASTA, secondi_rimasti: 300, in_pausa: false });
  const t = page.getByTestId("timer");
  await comando(request, "timer", { tipo: "updated", ...PASTA, secondi_rimasti: 250, in_pausa: true });
  await expect(t.getByTestId("timer-in-pausa")).toHaveText("in pausa");
  await expect(t.getByTestId("timer-rimasto")).toHaveText("4:10");
  await page.waitForTimeout(2500);
  await expect(t.getByTestId("timer-rimasto")).toHaveText("4:10");
  // anche dopo una ricarica (rilettura da timer_attivi) resta fermo
  await page.reload();
  await expect(page.getByTestId("timer").getByTestId("timer-in-pausa")).toBeVisible();
  await expect(page.getByTestId("timer").getByTestId("timer-rimasto")).toHaveText("4:10");
  await comando(request, "timer", { tipo: "updated", ...PASTA, secondi_rimasti: 250, in_pausa: false });
  await expect(page.getByTestId("timer").getByTestId("timer-in-pausa")).toHaveCount(0);
  await expect(page.getByTestId("timer").getByTestId("timer-rimasto")).toHaveText(/^4:0\d$/, {
    timeout: 5000,
  });
});
