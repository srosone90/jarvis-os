import { expect, test } from "@playwright/test";
import { accedi, comando } from "../aiuti";

/**
 * Navigazione N2 (v0.5.5): colonna a sinistra (Casa, Meteo, in fondo l'Hub),
 * schermate Meteo e Stanza, `#nome` nell'indirizzo, Indietro, ritorno alla
 * schermata iniziale.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});


test("tocco sul meteo della casa → schermata Meteo; #meteo nell'indirizzo la apre direttamente", async ({
  page,
}) => {
  await accedi(page);
  await page.getByTestId("apri-meteo").click();
  await expect(page.getByTestId("pagina-meteo")).toBeVisible();
  await page.goto("./index.html#meteo");
  await expect(page.getByTestId("pagina-meteo")).toBeVisible();
});