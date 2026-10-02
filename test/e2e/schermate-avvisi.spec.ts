import { expect, test, type Page } from "@playwright/test";
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

async function daAltro(page: Page, schermata: string): Promise<void> {
  await page.getByTestId("colonna-altro").click();
  await expect(page.getByTestId("pagina-altro")).toBeVisible();
  await page.getByTestId(`altro-${schermata}`).click();
  await expect(page.getByTestId(`pagina-${schermata}`)).toBeVisible();
}

test("Avvisi: batterie basse, eventi dei dispositivi dal registro di HA, filtri, interruzioni della connessione", async ({
  page,
  request,
}) => {
  await accedi(page);
  await daAltro(page, "avvisi");
  // batteria del meter della camera al 12%; quella dello scaldabagno (100%) no
  const batterie = page.getByTestId("avviso-batteria");
  await expect(batterie).toHaveCount(1);
  await expect(batterie).toContainText("Meter letto batteria");
  await expect(batterie).toContainText("12%");
  // dispositivi: ultime 24 ore, dal più recente; "unknown" (infrarossi) e i sensori no
  const eventi = page.getByTestId("avviso-dispositivo");
  await expect(eventi).toHaveCount(3);
  await expect(eventi.nth(0)).toContainText("TV Salotto");
  await expect(eventi.nth(0)).toContainText("accensione");
  await expect(eventi.nth(0)).toContainText("da un utente");
  await expect(eventi.nth(1)).toContainText("Condizionatore");
  await expect(eventi.nth(1)).toContainText("ventola");
  await expect(eventi.nth(1)).toContainText("da Jarvis · Rientro");
  await expect(eventi.nth(2)).toContainText("Scaldabagno");
  await expect(eventi.nth(2)).toContainText("spegnimento");
  // filtri
  await page.getByTestId("filtro-batterie").click();
  await expect(eventi).toHaveCount(0);
  await expect(batterie).toHaveCount(1);
  await page.getByTestId("filtro-dispositivi").click();
  await expect(batterie).toHaveCount(0);
  await expect(eventi).toHaveCount(3);
  await page.getByTestId("filtro-connessione").click();
  await expect(page.getByTestId("avvisi-nessuno")).toContainText("Nessuna interruzione");
  // Home Assistant giù e su: l'interruzione la scrive il pannello
  await comando(request, "spegni");
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
  await comando(request, "accendi");
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso", { timeout: 20_000 });
  await expect(page.getByTestId("avviso-connessione")).toContainText("Home Assistant non raggiungibile");
  // e resta dopo la ricarica
  await page.reload();
  await daAltro(page, "avvisi");
  await page.getByTestId("filtro-connessione").click();
  await expect(page.getByTestId("avviso-connessione")).toHaveCount(1);
});

test("Avvisi: un comando dato adesso entra nel registro; soglia della batteria e ore dalle impostazioni", async ({
  page,
}) => {
  await accedi(page);
  await page.getByTestId("card-media").locator("button.principale").click();
  // il volume compare solo quando HA conferma lo stato vero (non quello ottimistico)
  await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible({ timeout: 5000 });
  await daAltro(page, "avvisi");
  await expect(page.getByTestId("avviso-dispositivo")).toHaveCount(4);
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-avvisi-soglia").fill("10");
  await page.getByTestId("campo-avvisi-soglia").press("Enter");
  await page.getByTestId("campo-avvisi-ore").fill("3");
  await page.getByTestId("campo-avvisi-ore").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "avvisi");
  await expect(page.getByTestId("avvisi-batterie-ok")).toHaveText("Nessuna batteria sotto il 10%.");
  // nelle ultime 3 ore: la TV accesa adesso e quella di 2 ore fa
  await expect(page.getByTestId("avviso-dispositivo")).toHaveCount(2);
});
