import { expect, test, type Page } from "@playwright/test";
import { accedi, apriChat, comando, HA, info, pallino } from "./aiuti";

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

test("con due pannelli suonano tutti e due, e ognuno si ferma col suo Stop", async ({ browser, request }) => {
  const contesti = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pagine = await Promise.all(contesti.map((c) => c.newPage()));
    for (const p of pagine) {
      await p.goto(`${HA}/local/jarvis/index.html`);
      await p.getByRole("button", { name: "Accedi" }).click();
      await expect(pallino(p)).toHaveAttribute("data-stato", "connesso");
    }
    await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(2);
    await comando(request, "timer", { tipo: "finished", ...PASTA, secondi_rimasti: 0 });
    const [a, b] = pagine;
    if (!a || !b) throw new Error("pagine mancanti");
    await expect(a.getByTestId("timer-finito")).toContainText("Timer pasta finito");
    await expect(b.getByTestId("timer-finito")).toContainText("Timer pasta finito");
    await a.getByTestId("timer-stop").click();
    await expect(a.getByTestId("timer-finito")).toHaveCount(0);
    await expect(b.getByTestId("timer-finito")).toBeVisible();
  } finally {
    await Promise.all(contesti.map((c) => c.close()));
  }
});
