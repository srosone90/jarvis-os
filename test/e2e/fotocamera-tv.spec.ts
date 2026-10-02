import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "./aiuti";

/**
 * v0.6.0, punto 7.3 (decisione di Salvatore del 02/10): la fotocamera non
 * limita MAI «Jarvis». Stanza VUOTA davanti al pannello (si chiama dal
 * divano) e TV accesa: «Jarvis» scatta come senza fotocamera, soglia normale.
 * Il microfono dice «hey jarvis» (Piper, come in parola-audio-vero.spec.ts).
 */

test.use(dispositiviFinti({ video: "vuota.y4m", audio: "hey-jarvis-piper.wav" }));

test("TV accesa e nessuno davanti al pannello: «Jarvis» conta come sempre, soglia normale", async ({
  page,
  request,
}) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await comando(request, "stato", { entity_id: "media_player.soggiorno_tv_salotto", state: "on" });
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
  await expect(registro).not.toContainText("ignorato");
  await expect(registro).not.toContainText("più bassa");
});
