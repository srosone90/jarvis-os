import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/**
 * v0.6.0: fotocamera vera di Chromium che "vede" un video di prova
 * (test/dati/video, foto NASA di dominio pubblico) e il modello del volto
 * vero, nel pannello compilato. Presenza → script.jarvis_presenza {pannello},
 * spia, distanza, orari; v0.6.5: sveglia dello schermo e rispegnimento.
 */

test.use(dispositiviFinti({ video: "volto-vicino.y4m" }));

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
});

/** "HH:MM" nel fuso del browser delle prove (Europe/Rome, playwright.config.ts), non in quello di Node. */
const hhmm = (d: Date): string =>
  d.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const presenze = async (request: Parameters<typeof info>[0]) =>
  (await info(request)).chiamate.filter((c) => c.servizio === "script.jarvis_presenza");

test("qualcuno vicino: spia accesa, presenza mandata una volta sola (script, mai immagini), volto e distanza nelle impostazioni", async ({
  page,
  request,
}) => {
  await fotocameraAccesa(page);
  await accedi(page);
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => presenze(request), { timeout: 20_000 })
    .toEqual([{ servizio: "script.jarvis_presenza", dati: { pannello: "jarvis_cucina" } }]);
  // la persona resta lì: nessun altro evento (al massimo uno ogni 5 minuti)
  await page.waitForTimeout(4000);
  expect(await presenze(request)).toHaveLength(1);
  // a Home Assistant non va nient'altro dalla fotocamera
  expect((await info(request)).chiamate.filter((c) => /camera|image|foto/i.test(c.servizio))).toEqual([]);
  await apriImpostazioni(page, "fotocamera");
  await expect(page.getByTestId("fotocamera-stato-testo")).toHaveText(/Accesa/);
  await expect(page.getByTestId("fotocamera-volto")).toHaveText(
    /Ultimo volto: (9\d|100)%, a circa 0,[6-9] m/,
  );
  // nel registro il modello del volto pronto e l'arrivo
  await page.getByTestId("sezione-diagnostica").click();
  await expect(page.getByTestId("log")).toContainText("Fotocamera: modello del volto pronto");
  await expect(page.getByTestId("log")).toContainText("Fotocamera: qualcuno si è avvicinato");
});

test("controprova: avviso a Home Assistant spento → nessun evento; spento anche la sveglia → niente spia", async ({
  page,
  request,
}) => {
  await fotocameraAccesa(page, { avvisaCasa: false });
  await accedi(page);
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(5000);
  expect(await presenze(request)).toEqual([]);
  await apriImpostazioni(page, "fotocamera");
  await expect(page.getByTestId("campo-fotocamera-guarda")).toHaveCount(0);
  await expect(page.getByTestId("campo-fotocamera-aiuto")).toHaveCount(0);
  await page.getByTestId("campo-fotocamera-presenza").uncheck();
  await expect(page.getByTestId("campo-fotocamera-secondi")).toBeDisabled();
  await expect(page.getByTestId("spia-fotocamera")).toHaveCount(0);
  await expect(page.getByTestId("fotocamera-stato-testo")).toHaveText("Spenta");
});

test("ore di riposo della fotocamera: spenta, niente spia né eventi; fuori da quelle ore si accende", async ({
  page,
  request,
}) => {
  const ora = new Date();
  // spenta da un'ora fa a fra un'ora
  await fotocameraAccesa(page, {
    spentaDa: hhmm(new Date(ora.getTime() - 3_600_000)),
    spentaA: hhmm(new Date(ora.getTime() + 3_600_000)),
  });
  await accedi(page);
  await apriImpostazioni(page, "fotocamera");
  await expect(page.getByTestId("fotocamera-stato-testo")).toHaveText("Spenta (ore di riposo)");
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("spia-fotocamera")).toHaveCount(0);
  expect(await presenze(request)).toEqual([]);
  // orari uguali = mai spenta: si accende subito
  await page.getByTestId("campo-fotocamera-spenta-da").fill("00:00");
  await page.getByTestId("campo-fotocamera-spenta-da").dispatchEvent("change");
  await page.getByTestId("campo-fotocamera-spenta-a").fill("00:00");
  await page.getByTestId("campo-fotocamera-spenta-a").dispatchEvent("change");
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
});

test("dorme a riposo: chi arriva lo sveglia, e se nessuno lo usa dopo 30 s torna a riposo", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const ora = new Date();
  // fotocamera spenta per i prossimi 2 minuti
  await fotocameraAccesa(page, {
    spentaDa: hhmm(new Date(ora.getTime() - 60_000)),
    spentaA: hhmm(new Date(ora.getTime() + 120_000)),
  });
  await page.addInitScript(() =>
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 30, notteDa: 0, notteA: 0 })),
  );
  await accedi(page);
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(page.getByTestId("riposo")).toBeVisible();
  expect(await presenze(request)).toEqual([]);
  // passano 3 minuti: finite le ore di riposo della fotocamera, si accende e vede il volto
  await page.clock.fastForward(180_000);
  await expect.poll(() => presenze(request), { timeout: 20_000 }).toHaveLength(1);
  await expect(page.getByTestId("riposo")).toHaveCount(0, { timeout: 10_000 });
  // la persona resta lì ma non tocca niente: dopo i 30 s di serie lo schermo torna a riposo,
  // e non si risveglia (è ancora la stessa persona: nessun nuovo arrivo)
  await page.clock.fastForward(31_000);
  await expect(page.getByTestId("riposo")).toBeVisible({ timeout: 10_000 });
  await page.clock.fastForward(20_000);
  await expect(page.getByTestId("riposo")).toBeVisible();
});
