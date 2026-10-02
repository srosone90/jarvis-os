import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info, microfonoDaFile } from "../aiuti";

/**
 * Il contrario di parola-audio-vero.spec.ts (v0.5.1): un microfono che sente
 * solo rumore (ronzio e raffiche di toni, `test/dati/audio/rumore.wav`) non
 * deve mai far partire una domanda.
 */

test.use(microfonoDaFile("rumore.wav"));

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
});

test("non scatta mai, la barra resta in basso e il microfono si muove", async ({ page, request }) => {
  await accedi(page);
  await expect(page.getByTestId("indicatore-parola")).toHaveAttribute("data-stato", "ascolta", {
    timeout: 30_000,
  });
  await apriImpostazioni(page, "voce");
  await expect
    .poll(async () => Number((await page.getByTestId("dal-vivo-livello").textContent())?.replace(",", ".")))
    .toBeGreaterThan(0.05);
  await page.waitForTimeout(8000);
  expect((await info(request)).richiesteAssistente).toEqual([]);
  expect(
    Number((await page.getByTestId("dal-vivo-punteggio").textContent())?.replace(",", ".")),
  ).toBeLessThan(0.1);
});
