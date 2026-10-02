import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "../aiuti";

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

test("Clima: grafico di tutte le stanze con termometro, stanze, scaldabagno; consumi solo se c'è un sensore", async ({
  page,
  request,
}) => {
  await accedi(page);
  await daAltro(page, "clima");
  await expect(page.getByTestId("clima-legenda")).toHaveText(/Soggiorno.*Camera da letto/);
  const stanze = page.getByTestId("clima-stanza");
  await expect(stanze).toHaveCount(3);
  await expect(stanze.filter({ hasText: "Soggiorno" }).getByTestId("clima-temperatura")).toHaveText("25,7°");
  await expect(stanze.filter({ hasText: "Veranda" })).toContainText("nessun termometro");
  await expect(page.getByTestId("pagina-clima").getByText("Scaldabagno", { exact: true })).toBeVisible();
  // oggi in casa non c'è un sensore di consumo: la parte non c'è
  await expect(page.getByTestId("clima-consumi")).toHaveCount(0);
  await comando(request, "aggiungi", {
    entita: { ei: "sensor.casa_potenza", pl: "shelly" },
    s: "420",
    a: { device_class: "power", unit_of_measurement: "W", friendly_name: "Casa" },
  });
  await expect(page.getByTestId("clima-consumi")).toContainText("420 W");
  // si spegne dalle impostazioni
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-clima-consumi").uncheck();
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "clima");
  await expect(page.getByTestId("clima-consumi")).toHaveCount(0);
  // una stanza si apre col tocco
  await page.getByTestId("clima-stanza").filter({ hasText: "Camera da letto" }).click();
  await expect(page.getByTestId("pagina-stanza-nome")).toHaveText("Camera da letto");
});
