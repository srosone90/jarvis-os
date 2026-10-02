import { expect, test } from "@playwright/test";
import { accedi, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/** v0.6.0, punto 7.4, controprova: lo stesso parlato con la stanza vuota non fa partire niente senza «Jarvis». */

test.use(dispositiviFinti({ video: "vuota.y4m", audio: "sottofondo-parlato.wav" }));

test("stanza vuota: il parlato senza «Jarvis» non fa partire domande", async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await fotocameraAccesa(page);
  await accedi(page);
  await expect(page.getByTestId("spia-fotocamera")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(15_000);
  expect((await info(request)).richiesteAssistente.filter((r) => r.wake_word_phrase === null)).toEqual([]);
});
