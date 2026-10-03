import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/**
 * v0.6.5, criterio (a): «Jarvis» funziona con la fotocamera coperta (tutto
 * nero, nessun volto), con la stessa soglia di quando qualcuno è vicino
 * (fotocamera-vicino.spec.ts). La distanza (3-4 m) la misura
 * test/unit/parola/parola-distanza.test.ts col modello vero.
 */

test.use(dispositiviFinti({ video: "coperta.y4m", audio: "hey-jarvis-piper.wav" }));

test("fotocamera coperta: «Jarvis» scatta, soglia di sempre", async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await accedi(page);
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await info(request)).richiesteAssistente.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect((await info(request)).richiesteAssistente[0]).toMatchObject({ wake_word_phrase: "Jarvis" });
  await apriDiagnostica(page);
  const registro = page.getByTestId("log");
  await expect(registro).toContainText(
    /«Jarvis» sentito \(punteggio [\d.]+, modello di base, soglia 0\.50\)/,
  );
  await expect(registro).not.toContainText("qualcuno si è avvicinato");
});
