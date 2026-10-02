import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "./aiuti";

/**
 * v0.5.7: le altre schermate del mockup N2 (Timer, Clima, Scene, Spesa,
 * Avvisi) e Altro. Il finto HA fa la lista della spesa (todo/item/subscribe e
 * servizi todo.*), il registro (logbook/get_events), gli script delle scene e
 * le batterie con device_class.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("colonna di serie come il mockup N2; Altro porta a tutte le schermate, alle impostazioni e all'Hub", async ({
  page,
}) => {
  await accedi(page);
  await expect(page.getByTestId("colonna-altro")).toBeVisible();
  const voci = await page
    .locator("jarvis-colonna button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(voci).toEqual([
    "colonna-casa",
    "colonna-musica",
    "colonna-meteo",
    "colonna-timer",
    "colonna-altro",
    "colonna-hub",
  ]);
  await page.getByTestId("colonna-altro").click();
  expect(new URL(page.url()).hash).toBe("#altro");
  const tessere = await page
    .getByTestId("altro-griglia")
    .locator("button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(tessere).toEqual([
    "altro-casa",
    "altro-musica",
    "altro-meteo",
    "altro-timer",
    "altro-clima",
    "altro-scene",
    "altro-spesa",
    "altro-avvisi",
    "altro-impostazioni",
    "altro-hub",
  ]);
  // una schermata che non sta nella colonna accende "Altro"
  await page.getByTestId("altro-spesa").click();
  await expect(page.getByTestId("pagina-spesa")).toBeVisible();
  await expect(page.getByTestId("colonna-altro")).toHaveAttribute("aria-current", "page");
  // le impostazioni si aprono anche da qui (non solo dall'orologio di Casa)
  await page.getByTestId("colonna-altro").click();
  await page.getByTestId("altro-impostazioni").click();
  await expect(page.getByTestId("impostazioni")).toBeVisible();
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("altro-hub").click();
  await expect(page.getByTestId("vista-hub")).toBeVisible();
});

test("Impostazioni → Schermate: ogni schermata nella colonna, in Altro o spenta; Casa e Altro fisse", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("dove-casa")).toHaveCount(0);
  await expect(page.getByTestId("dove-altro")).toHaveCount(0);
  await page.getByTestId("dove-spesa").selectOption("colonna");
  await page.getByTestId("dove-meteo").selectOption("spenta");
  await page.getByTestId("chiudi-impostazioni").click();
  const voci = await page
    .locator("jarvis-colonna button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(voci).toEqual([
    "colonna-casa",
    "colonna-musica",
    "colonna-timer",
    "colonna-spesa",
    "colonna-altro",
    "colonna-hub",
  ]);
  await page.getByTestId("colonna-altro").click();
  await expect(page.getByTestId("altro-meteo")).toHaveCount(0);
  // spenta: nemmeno dall'indirizzo, e niente tocco sul meteo della Casa
  await page.goto("./index.html#meteo");
  await expect(page.getByTestId("stanza").first()).toBeVisible();
  await expect(page.getByTestId("pagina-meteo")).toHaveCount(0);
  // ripristino
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("ripristina-colonna").click();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("colonna-meteo")).toBeVisible();
  await expect(page.getByTestId("colonna-spesa")).toHaveCount(0);
});
