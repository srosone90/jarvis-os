import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info, soloComandi } from "../aiuti";

/**
 * v0.5.7: le altre schermate del mockup N2 (Timer, Clima, Scene, Spesa,
 * Avvisi) e Altro. Il finto HA fa la lista della spesa (todo/item/subscribe e
 * servizi todo.*), il registro (logbook/get_events), gli script delle scene e
 * le batterie con device_class.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

async function daAltro(page: Page, schermata: string): Promise<void> {
  await page.getByTestId("colonna-altro").click();
  await expect(page.getByTestId("pagina-altro")).toBeVisible();
  await page.getByTestId(`altro-${schermata}`).click();
  await expect(page.getByTestId(`pagina-${schermata}`)).toBeVisible();
}

test("Scene: dalla Casa e dalla schermata, script.turn_on; evidenziata mentre gira; scena mancante detta", async ({
  page,
  request,
}) => {
  await accedi(page);
  const casa = page.getByTestId("zona-scene").getByRole("button");
  await expect(casa).toHaveText(["Buonanotte", "Esco", "Rientro"]);
  await casa.filter({ hasText: "Esco" }).click();
  await expect(page.getByTestId("avviso").filter({ hasText: "Esco: avviata" })).toBeVisible();
  expect(soloComandi((await info(request)).chiamate)).toContainEqual({
    servizio: "script.turn_on",
    dati: { entity_id: "script.jarvis_esco" },
  });
  await daAltro(page, "scene");
  const scene = page.getByTestId("scena");
  await expect(scene).toHaveCount(3);
  await expect(scene.filter({ hasText: "Esco" })).toContainText("Spegne TV del salotto e condizionatore");
  await scene.filter({ hasText: "Buonanotte" }).click();
  await expect(scene.filter({ hasText: "Buonanotte" })).toHaveAttribute("aria-pressed", "true");
  await expect(scene.filter({ hasText: "Buonanotte" })).toHaveAttribute("aria-pressed", "false", {
    timeout: 5000,
  });
  // scelte a mano, anche una che in HA non c'è
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  // campo su più righe: il valore vale quando si esce dal campo
  await page.getByTestId("campo-scene").fill("script.jarvis_rientro, script.non_esiste");
  await page.getByTestId("campo-scene").blur();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(casa).toHaveText(["Rientro", "Non esiste"]);
  await daAltro(page, "scene");
  await expect(scene).toHaveCount(2);
  await expect(scene.filter({ hasText: "Non esiste" })).toBeDisabled();
  await expect(page.getByTestId("scena-mancante")).toContainText("script.non_esiste");
});

test("Scene con conferma (v0.5.8): spenta di serie; accesa, il primo tocco chiede e non avvia", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  const interruttore = page.getByTestId("campo-scene-conferma");
  await expect(interruttore).not.toBeChecked();
  await interruttore.check();
  await page.getByTestId("chiudi-impostazioni").click();
  const scriptAvviati = async () =>
    soloComandi((await info(request)).chiamate).filter((c) => c.servizio === "script.turn_on");
  // Casa: primo tocco → «Tocca ancora», niente script
  const esco = page.getByTestId("zona-scene").getByRole("button").nth(1);
  await esco.click();
  await expect(esco).toHaveText("Tocca ancora");
  await expect(esco).toHaveAttribute("aria-label", "Conferma Esco");
  await page.waitForTimeout(500);
  expect(await scriptAvviati()).toEqual([]);
  // controprova: dopo 4 s torna com'era e un tocco solo non basta ancora
  await expect(esco).toHaveText("Esco", { timeout: 6000 });
  expect(await scriptAvviati()).toEqual([]);
  await esco.click();
  await esco.click();
  await expect(page.getByTestId("avviso").filter({ hasText: "Esco: avviata" })).toBeVisible();
  expect(await scriptAvviati()).toHaveLength(1);
  // schermata Scene: stesso comportamento
  await daAltro(page, "scene");
  const rientro = page.getByTestId("scena").filter({ hasText: "Rientro" });
  await rientro.click();
  await expect(rientro.getByTestId("scena-tocca-ancora")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await scriptAvviati()).toHaveLength(1);
  await rientro.click();
  await expect
    .poll(async () => (await scriptAvviati()).at(-1)?.dati)
    .toEqual({ entity_id: "script.jarvis_rientro" });
  await expect(rientro.getByTestId("scena-tocca-ancora")).toHaveCount(0);
});
