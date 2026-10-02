import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "../aiuti";

/**
 * Navigazione N2 (v0.5.5): colonna a sinistra (Casa, Meteo, in fondo l'Hub),
 * schermate Meteo e Stanza, `#nome` nell'indirizzo, Indietro, ritorno alla
 * schermata iniziale.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});


test("colonna: Meteo e ritorno a Casa; l'indirizzo segue (#meteo)", async ({ page }) => {
  await accedi(page);
  await expect(page.getByTestId("colonna-casa")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("colonna-meteo").click();
  await expect(page.getByTestId("pagina-meteo")).toBeVisible();
  await expect(page.getByTestId("colonna-meteo")).toHaveAttribute("aria-current", "page");
  expect(new URL(page.url()).hash).toBe("#meteo");
  await expect(page.getByTestId("pagina-meteo-temp")).toHaveText("22°");
  await expect(page.getByTestId("meteo-umidita")).toContainText("60%");
  await expect(page.getByTestId("meteo-vento")).toContainText("14 km/h da SO");
  await expect(page.getByTestId("meteo-sole")).toContainText("07:08");
  await expect(page.getByTestId("meteo-sole")).toContainText("18:53");
  await expect(page.getByTestId("meteo-ora")).toHaveCount(12);
  await expect(page.getByTestId("meteo-giorno").first()).toBeVisible();
  // la pressione è spenta di serie
  await expect(page.getByTestId("meteo-pressione")).toHaveCount(0);
  await page.getByTestId("colonna-casa").click();
  await expect(page.getByTestId("pagina-meteo")).toHaveCount(0);
  await expect(page.getByTestId("stanza").first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("Hub dalla colonna", async ({ page }) => {
  await accedi(page);
  await page.getByTestId("colonna-hub").click();
  await expect(page.getByTestId("vista-hub")).toBeVisible();
});

test("Impostazioni → Schermate: ordine, voci nascoste, schermata iniziale, meteo; tutto col ripristino", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  // Meteo prima di Casa (dalla v0.5.6 in mezzo c'è Musica: due passi su)
  await page.getByTestId("su-meteo").click();
  await page.getByTestId("su-meteo").click();
  await expect(page.getByTestId("ripristina-colonna")).toBeVisible();
  // schermata iniziale: Meteo
  await page.getByTestId("campo-iniziale").selectOption("meteo");
  // meteo: pressione accesa, 6 ore
  await page.getByTestId("campo-meteo-pressione").check();
  const ore = page.getByTestId("campo-meteo-ore");
  await ore.fill("6");
  await ore.press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  const voci = page.locator("jarvis-colonna button");
  await expect(voci.first()).toHaveAttribute("data-test", "colonna-meteo");
  // ricaricando si apre sul Meteo, con la pressione e 6 ore
  await page.reload();
  await expect(page.getByTestId("pagina-meteo")).toBeVisible();
  await expect(page.getByTestId("meteo-pressione")).toContainText("1015 hPa");
  await expect(page.getByTestId("meteo-ora")).toHaveCount(6);
  // Meteo solo in Altro: fuori dalla colonna; Casa resta sempre nella colonna
  // (le impostazioni si aprono dall'orologio, che sta in Casa)
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("dove-casa")).toHaveCount(0);
  await page.getByTestId("dove-meteo").selectOption("altro");
  await expect(page.getByTestId("colonna-meteo")).toHaveCount(0);
  // ripristino
  await page.getByTestId("ripristina-colonna").click();
  await page.getByTestId("ripristina-iniziale").click();
  await expect(page.getByTestId("colonna-meteo")).toHaveCount(1);
  await expect(voci.first()).toHaveAttribute("data-test", "colonna-casa");
});
