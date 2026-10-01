import { expect, test } from "@playwright/test";
import { accedi, apriChat, comando, eContesto, info } from "./aiuti";

/**
 * Conversazione continua (v0.5.3): finita la risposta, il pannello riascolta
 * 8 s senza «Jarvis». Qui il microfono finto è quello di serie delle prove, un
 * fruscio bassissimo: nessuno parla, quindi si chiude in silenzio e verso HA
 * non parte niente.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("dopo la risposta «Ti ascolto ancora»; nessuno parla: chiude in silenzio dopo 8 s, niente a HA", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  // segnale chiaro, diverso da "Ti ascolto…"
  const ancora = page.getByTestId("ascolto-ancora");
  await expect(ancora).toHaveText("Ti ascolto ancora…", { timeout: 5000 });
  const da = Date.now();
  await expect(page.getByTestId("voce-pulsante")).toHaveAttribute("aria-label", "Chiudi");
  // durante il riascolto verso HA non va niente: una sola pipeline, nessun byte in più
  const byte = (await info(request)).audioVoce.reduce((n, a) => n + a.byte, 0);
  await page.waitForTimeout(3000);
  let i = await info(request);
  expect(i.richiesteAssistente).toHaveLength(1);
  expect(i.audioVoce.reduce((n, a) => n + a.byte, 0)).toBe(byte);
  // dopo ~8 s si chiude da solo, senza "Non ho capito" e senza turni nuovi
  await expect(ancora).toBeHidden({ timeout: 8000 });
  const durata = Date.now() - da;
  expect(durata).toBeGreaterThan(6500);
  expect(durata).toBeLessThan(10_000);
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
  await expect(page.getByTestId("domanda")).toHaveCount(1);
  await expect(page.getByText("Non ho capito")).toHaveCount(0);
  i = await info(request);
  expect(i.richiesteAssistente).toHaveLength(1);
  expect(i.richiesteAssistente.filter(eContesto)).toHaveLength(0);
});

test("tocco su «Chiudi» durante il riascolto: si chiude subito", async ({ page, request }) => {
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("ascolto-ancora")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("voce-pulsante").click();
  await expect(page.getByTestId("ascolto-ancora")).toBeHidden({ timeout: 1000 });
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
  expect((await info(request)).richiesteAssistente).toHaveLength(1);
});
