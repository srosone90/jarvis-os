import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, stanza } from "../aiuti";

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("entità mancanti: il riquadro lo dice, il resto funziona, l'errore finisce nel log", async ({
  page,
  request,
}) => {
  await comando(request, "rimuovi?entity_id=weather.forecast_casa");
  await comando(request, "rimuovi?entity_id=sensor.jarvis_temperatura_percepita_camera");
  await accedi(page);

  await expect(page.getByText("Meteo non disponibile (weather.forecast_casa non trovato)")).toBeVisible();
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(camera).toContainText("Sensore non trovato: sensor.jarvis_temperatura_percepita_camera");
  await expect(camera.getByTestId("stanza-temp")).toHaveText("25,1°");

  // un'entità che ricompare torna visibile senza ricaricare
  await comando(request, "stato", {
    entity_id: "weather.forecast_casa",
    state: "rainy",
    attributes: { temperature: 17.8, cloud_coverage: 95 },
  });
  await expect(page.getByTestId("meteo-temp")).toHaveText("18°");
  await expect(page.getByTestId("meteo-cond")).toHaveText("Pioggia");

  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("Entità meteo non trovata: weather.forecast_casa");
});
