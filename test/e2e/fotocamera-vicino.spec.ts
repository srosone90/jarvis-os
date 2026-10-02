import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "./aiuti";

/**
 * v0.6.0, punto 7.3 (decisione di Salvatore del 02/10): la fotocamera AIUTA
 * l'attivazione. Qualcuno vicino al pannello (e la TV accesa, per mostrare
 * che non conta) → «Jarvis» scatta con la soglia più bassa di un passo.
 */

test.use(dispositiviFinti({ video: "volto-vicino.y4m", audio: "hey-jarvis-piper.wav" }));

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await comando(request, "stato", { entity_id: "media_player.soggiorno_tv_salotto", state: "on" });
});

async function scattoNelRegistro(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
) {
  await accedi(page);
  await expect
    .poll(
      async () =>
        (await info(request)).richiesteAssistente.filter((r) => r.wake_word_phrase === "Jarvis").length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await apriDiagnostica(page);
  return page.getByTestId("log");
}

test("qualcuno vicino: «Jarvis» scatta con la soglia più bassa, e il registro lo dice", async ({
  page,
  request,
}) => {
  // guarda e parla spento, per vedere proprio lo scatto di «Jarvis»
  await fotocameraAccesa(page, { guardaParla: false });
  const registro = await scattoNelRegistro(page, request);
  await expect(registro).toContainText(
    /«Jarvis» sentito \(punteggio [\d.]+, modello di base, soglia 0\.45, più bassa: qualcuno vicino al pannello\)/,
  );
});

test("controprova: «più facile da vicino» spento → stesso volto, soglia normale", async ({
  page,
  request,
}) => {
  await fotocameraAccesa(page, { guardaParla: false, aiutoVicino: false });
  const registro = await scattoNelRegistro(page, request);
  await expect(registro).toContainText(
    /«Jarvis» sentito \(punteggio [\d.]+, modello di base, soglia 0\.50\)/,
  );
  await expect(registro).not.toContainText("più bassa");
});
