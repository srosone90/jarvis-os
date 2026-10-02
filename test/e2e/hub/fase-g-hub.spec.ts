import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "../aiuti";

/**
 * Fase G (v0.4.8), scelte di Salvatore del 30/09: schermo a riposo C (sfera),
 * Hub H1, impostazioni S1, procedura guidata S3 al primo avvio.
 * Vincolo: il riposo cambia solo la vista, non ferma timer, voce, musica.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const riposo = (page: Page) => page.getByTestId("riposo");

/** Senza notte (da = a): le prove girano a qualunque ora, anche dopo le 23. */
const completo = (page: Page) => page.getByRole("button", { name: "Chiedi a Jarvis…" });

/** A riposo subito, dalle impostazioni ("Metti a riposo"), senza aspettare i 2 minuti. */
async function mettiARiposo(page: Page): Promise<void> {
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(riposo(page)).toBeVisible();
}

test("tocco sulla sfera: Hub in ascolto, domanda e risposta come sottotitoli, poi di nuovo a riposo", async ({
  page,
  request,
}) => {
  await accedi(page);
  await mettiARiposo(page);
  await page.getByTestId("riposo-sfera").click();
  await expect(page.getByTestId("hub")).toBeVisible();
  await expect(page.getByTestId("hub-domanda")).toHaveText("«Che temperatura c'è in camera?»");
  await expect(page.getByTestId("hub-risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  // nessun riquadro piccolo sopra l'Hub, e la domanda è partita come sempre
  await expect(page.getByTestId("riquadro-voce")).toHaveCount(0);
  expect((await info(request)).richiesteAssistente[0]?.start_stage).toBe("stt");
  // 30 s dopo la fine della voce si torna al riposo da soli
  await expect(riposo(page)).toBeVisible({ timeout: 45_000 });
});

test("Hub: il tasto griglia porta al pannello completo", async ({ page }) => {
  await accedi(page);
  await mettiARiposo(page);
  await page.getByTestId("riposo-sfera").click();
  await expect(page.getByTestId("hub")).toBeVisible();
  await page.getByTestId("hub-completo").click();
  await expect(completo(page)).toBeVisible();
});
