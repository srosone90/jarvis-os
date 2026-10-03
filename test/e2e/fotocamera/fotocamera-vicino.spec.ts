import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/**
 * v0.6.5: la fotocamera non tocca «Jarvis». Qualcuno vicino al pannello →
 * «Jarvis» scatta con la stessa soglia di sempre (0,50), come dal divano e
 * con la fotocamera coperta (fotocamera-coperta.spec.ts). Fino alla v0.6.4
 * vicino la soglia scendeva a 0,45.
 */

test.use(dispositiviFinti({ video: "volto-vicino.y4m", audio: "hey-jarvis-piper.wav" }));

test("qualcuno vicino: «Jarvis» con la soglia di sempre, nessuno sconto", async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await accedi(page);
  await expect
    .poll(
      async () =>
        (await info(request)).richiesteAssistente.filter((r) => r.wake_word_phrase === "Jarvis").length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await apriDiagnostica(page);
  const registro = page.getByTestId("log");
  await expect(registro).toContainText("Fotocamera: qualcuno si è avvicinato");
  await expect(registro).toContainText(
    /«Jarvis» sentito \(punteggio [\d.]+, modello di base, soglia 0\.50\)/,
  );
  await expect(registro).not.toContainText("più bassa");
});
