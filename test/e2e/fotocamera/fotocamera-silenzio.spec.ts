import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/**
 * v0.6.5, criterio (b): la fotocamera non fa partire l'ascolto. Qualcuno
 * davanti al tablet, che lo guarda e parla SENZA dire «Jarvis» (frasi da
 * telegiornale): la fotocamera lo vede (arrivo nel registro), ma nessuna
 * domanda parte. Fino alla v0.6.4 «guarda e parla» la faceva partire.
 */

test.use(dispositiviFinti({ video: "volto-vicino.y4m", audio: "sottofondo-parlato.wav" }));

test("volto davanti e parlato senza «Jarvis»: la fotocamera vede, ma l'ascolto non parte", async ({
  page,
  request,
}) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await accedi(page);
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
  // 15 s di frasi con il volto davanti: nessuna domanda, con o senza «Jarvis»
  await page.waitForTimeout(15_000);
  expect((await info(request)).richiesteAssistente).toEqual([]);
  await apriDiagnostica(page);
  const registro = page.getByTestId("log");
  await expect(registro).toContainText("Fotocamera: qualcuno si è avvicinato");
  await expect(registro).toContainText("«Jarvis» in ascolto");
  await expect(registro).not.toContainText("Guarda e parla");
});
