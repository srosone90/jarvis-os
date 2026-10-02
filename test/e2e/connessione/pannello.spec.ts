import { expect, test } from "@playwright/test";
import { HA, accedi, apriDiagnostica, comando, info, pallino, stanza } from "../aiuti";

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("primo accesso: login OAuth, dati reali di HA, indirizzo ripulito, login ricordato", async ({
  page,
  request,
}) => {
  await accedi(page);
  expect(page.url()).toBe(`${HA}/local/jarvis/index.html`);

  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
  await expect(page.getByTestId("meteo-cond")).toHaveText("Parz. nuvoloso");
  await expect(page.getByTestId("previsione").locator(".giorno")).toHaveCount(4);
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(soggiorno).toContainText("Soggiorno");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(soggiorno.getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(camera.getByTestId("stanza-percepita")).toHaveText("25,6°");

  // un cambio in HA arriva in push (differenza "c", come HA vero)...
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "24.2" });
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("24,2°");
  // ...e NON cancella le altre entità (bug della v0.1.0 sul tablet vero)
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "25.3" });
  await expect(camera.getByTestId("stanza-temp")).toHaveText("25,3°");
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("24,2°");
  await expect(soggiorno.getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(camera.getByTestId("stanza-percepita")).toHaveText("25,6°");
  await expect(page.getByText("non trovato")).toHaveCount(0);
  await apriDiagnostica(page);
  // 17 della casa + 12 del pacchetto annunci (v0.5.4) + sun.sun (v0.5.5)
  // 30 + (v0.5.7) batteria del meter, 3 script delle scene, lista della spesa
  await expect(page.getByTestId("entita-ricevute")).toHaveText("35");
  await page.getByTestId("chiudi-impostazioni").click();

  // ricaricando non si rifà il login
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  expect((await info(request)).login).toBe(1);
});

test("HA che cade e torna: banner dopo 10 s, valori non aggiornati, poi risincronizzazione completa", async ({
  page,
  request,
}) => {
  await accedi(page);
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(camera).toContainText("43%");

  await comando(request, "spegni");
  await expect(pallino(page)).toHaveAttribute("data-stato", "riconnessione", { timeout: 5000 });
  // nei primi secondi niente banner: una riconnessione breve non deve far lampeggiare niente
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("banner")).toContainText("valori non aggiornati");
  // valori della stanza in arancione (il banner lo dice a parole)
  await expect(soggiorno.locator(".clima.non-aggiornato")).toBeVisible();
  await expect(pallino(page)).toContainText("Offline");

  // mentre HA è giù: un valore cambia e un sensore viene cancellato
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "27.3" });
  await comando(request, "rimuovi?entity_id=sensor.meter_letto_umidita");
  await comando(request, "accendi");

  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 45_000 });
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("27,3°");
  // il sensore cancellato NON resta come "fantasma" col vecchio valore
  await expect(camera).toContainText("Sensore non trovato: sensor.meter_letto_umidita");
  await expect(camera).not.toContainText("43%");

  // dopo la riconnessione, un piccolo aggiornamento NON deve cancellare il resto
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "24.8" });
  await expect(camera.getByTestId("stanza-temp")).toHaveText("24,8°");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("27,3°");
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");

  await apriDiagnostica(page);
  await expect(page.getByTestId("riconnessioni")).toHaveText("1");
  await expect(page.getByTestId("log")).toContainText("Connessione a Home Assistant persa");
});

test("login revocato in HA: il pannello chiede di accedere di nuovo, senza redirect a sorpresa", async ({
  page,
  request,
}) => {
  await accedi(page);
  await comando(request, "revoca");
  await expect(page.getByTestId("accesso")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("accesso")).toContainText("accedi di nuovo");
  expect(page.url()).toBe(`${HA}/local/jarvis/index.html`);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
});
