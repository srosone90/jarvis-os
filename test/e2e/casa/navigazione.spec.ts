import { expect, test } from "@playwright/test";
import { accedi, comando, info, soloComandi } from "../aiuti";

/**
 * Navigazione N2 (v0.5.5): colonna a sinistra (Casa, Meteo, in fondo l'Hub),
 * schermate Meteo e Stanza, `#nome` nell'indirizzo, Indietro, ritorno alla
 * schermata iniziale.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});


test("Stanza: dal nome della stanza, grafico dallo storico di HA e i dispositivi; Indietro torna a Casa", async ({
  page,
  request,
}) => {
  await accedi(page);
  await page.getByTestId("apri-stanza").filter({ hasText: "Camera da letto" }).click();
  await expect(page.getByTestId("pagina-stanza")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#stanza/camera_da_letto");
  await expect(page.getByTestId("pagina-stanza-nome")).toHaveText("Camera da letto");
  await expect(page.getByTestId("pagina-stanza-clima")).toContainText("25,1° · 43%");
  await expect(page.getByTestId("grafico-stanza")).toBeVisible();
  await expect(page.getByTestId("grafico-temperatura")).toContainText("temperatura");
  // i dispositivi della stanza, comandabili come in casa
  await expect(page.getByTestId("pagina-stanza").getByText("Condizionatore")).toBeVisible();
  // aprire la stanza non comanda niente
  expect(soloComandi((await info(request)).chiamate)).toEqual([]);
  // Indietro (Android): si torna a Casa
  await page.goBack();
  await expect(page.getByTestId("pagina-stanza")).toHaveCount(0);
  await expect(page.getByTestId("colonna-casa")).toHaveAttribute("aria-current", "page");
});