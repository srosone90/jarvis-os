import { expect, test } from "@playwright/test";
import { accedi, comando, stanza } from "../aiuti";

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("layout del mockup approvato: stanze, scene attive (v0.5.7), barra dell'assistente", async ({
  page,
  request,
}) => {
  await accedi(page);
  // stanze tutte insieme, con il clima nell'intestazione
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  await expect(stanza(page, "Veranda")).toBeVisible();
  await expect(stanza(page, "Soggiorno").getByTestId("stanza-temp")).toHaveText("25,7°");
  // scene (v0.5.7, prima "in arrivo"): tre pulsanti veri, nell'ordine del mockup
  const scene = page.getByTestId("zona-scene");
  await expect(scene.getByRole("button")).toHaveText(["Buonanotte", "Esco", "Rientro"]);
  await expect(scene).not.toContainText("in arrivo");
  for (const b of await scene.getByRole("button").all()) await expect(b).toBeEnabled();
  // barra: assistente testuale (F4) e microfono (F5), entrambi attivi
  const assistente = page.getByTestId("zona-assistente");
  await expect(assistente.locator("button, input, a, [role=button]")).toHaveCount(2);
  await expect(assistente.getByRole("button", { name: "Chiedi a Jarvis…" })).toBeEnabled();
  await expect(assistente.getByRole("button", { name: "Parla con Jarvis" })).toBeEnabled();
  // niente esce dallo schermo del tablet (1024×600), card comprese
  await expect(page.locator("[data-test^=card-]").first()).toBeVisible();
  expect(await sbordati(page)).toEqual([]);
  // i testi dei pulsanti delle modalità non vengono tagliati
  const tagliati = await page
    .locator("jarvis-card-clima .comandi button")
    .evaluateAll((bottoni) =>
      bottoni.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent?.trim()),
    );
  expect(tagliati).toEqual([]);

  // caso peggiore: TV accesa (riga del volume in più nel Soggiorno) e poi offline,
  // con le righe "non aggiornato" in più: niente deve sbordare
  await page.getByTestId("card-media").locator("button.principale").click();
  await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible();
  expect(await sbordati(page)).toEqual([]);
  await comando(request, "spegni");
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
  expect(await sbordati(page)).toEqual([]);
});

/**
 * Elementi che escono dallo schermo o dal riquadro della propria stanza
 * (per esempio una card che finisce sotto la barra dell'assistente).
 */
async function sbordati(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const fuori: string[] = [];
    const guarda = (radice: Document | ShadowRoot, contenitore: DOMRect | null): void => {
      for (const e of radice.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        const fuoriSchermo = r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
        const fuoriStanza = contenitore !== null && r.bottom > contenitore.bottom + 1;
        if (fuoriSchermo || fuoriStanza) fuori.push(`${e.localName}.${String(e.className)}`);
        const stanza = e.localName === "jarvis-stanza" ? r : contenitore;
        if (e.shadowRoot) guarda(e.shadowRoot, stanza);
      }
    };
    guarda(document, null);
    return fuori;
  });
}
