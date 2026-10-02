import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, dispositiviFinti, fotocameraAccesa, info } from "./aiuti";

/**
 * v0.6.0, punto 7.4, guarda e parla: qualcuno guarda il tablet (volto vicino
 * e di fronte) e parla SENZA dire «Jarvis» (frasi da telegiornale): la
 * domanda parte lo stesso, senza wake_word_phrase. Serve «Jarvis» acceso: è
 * lo stesso ascolto del microfono.
 */

test.use(dispositiviFinti({ video: "volto-vicino.y4m", audio: "sottofondo-parlato.wav" }));

test("guarda e parla: la domanda parte senza «Jarvis»", async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await accedi(page);
  await expect
    .poll(
      async () => (await info(request)).richiesteAssistente.filter((r) => r.wake_word_phrase === null).length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  expect((await info(request)).richiesteAssistente.find((r) => r.wake_word_phrase === null)).toMatchObject({
    start_stage: "stt",
    end_stage: "tts",
  });
  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("Guarda e parla: qualcuno guarda il pannello e parla");
});
