import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, dispositiviFinti, fotocameraAccesa, info } from "../aiuti";

/** v0.6.0: un volto a ~2 m non è «vicino» con la distanza di serie (1,5 m); a 2,5 m sì. */

test.use(dispositiviFinti({ video: "volto-lontano.y4m" }));

test("volto a ~2 m: niente presenza a 1,5 m (di serie); portata a 2,5 m, sì", async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
  await fotocameraAccesa(page);
  await accedi(page);
  await apriImpostazioni(page, "fotocamera");
  await expect(page.getByTestId("fotocamera-volto")).toHaveText(/a circa (1,[89]|2,\d) m/, {
    timeout: 20_000,
  });
  const presenze = async () =>
    (await info(request)).chiamate.filter((c) => c.servizio === "script.jarvis_presenza");
  await page.waitForTimeout(3000);
  expect(await presenze()).toEqual([]);
  await page.getByTestId("campo-fotocamera-distanza").fill("2.5");
  await page.getByTestId("campo-fotocamera-distanza").press("Enter");
  await expect.poll(presenze, { timeout: 15_000 }).toHaveLength(1);
});
