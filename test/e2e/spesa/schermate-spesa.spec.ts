import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "./aiuti";

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

test("Spesa: la lista di HA; aggiungi, segna, togli, togli le prese; cambia anche da fuori", async ({
  page,
  request,
}) => {
  await accedi(page);
  await daAltro(page, "spesa");
  await expect(page.getByTestId("spesa-conta")).toHaveText("3 cose da prendere.");
  const testi = page.getByTestId("spesa-testo");
  await expect(testi).toHaveText(["latte", "pane", "pasta", "caffè"]);
  await expect(page.getByTestId("spesa-segna").filter({ hasText: "caffè" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // aggiungi con Invio
  await page.getByTestId("spesa-nuova").fill("uova");
  await page.getByTestId("spesa-nuova").press("Enter");
  await expect(testi).toHaveText(["latte", "pane", "pasta", "uova", "caffè"]);
  await expect(page.getByTestId("spesa-nuova")).toHaveValue("");
  // segna presa: va in fondo, barrata
  await page.getByTestId("spesa-segna").filter({ hasText: "latte" }).click();
  await expect(testi).toHaveText(["pane", "pasta", "uova", "latte", "caffè"]);
  await expect(page.getByTestId("spesa-conta")).toHaveText("3 cose da prendere.");
  await page.getByRole("button", { name: "Togli pane" }).click();
  await expect(testi).toHaveText(["pasta", "uova", "latte", "caffè"]);
  await page.getByTestId("spesa-togli-presi").click();
  await expect(testi).toHaveText(["pasta", "uova"]);
  await expect(page.getByTestId("spesa-togli-presi")).toHaveCount(0);
  expect((await info(request)).spesa.map((v) => v.summary)).toEqual(["pasta", "uova"]);
  // a voce o da un altro pannello: arriva da sola
  await comando(request, "spesa", {
    items: [{ uid: "x1", summary: "detersivo piatti", status: "needs_action" }],
  });
  await expect(testi).toHaveText(["detersivo piatti"]);
  await expect(page.getByTestId("spesa-conta")).toHaveText("1 cosa da prendere.");
});

test("Spesa: senza le prese; lista che non c'è detta chiara, niente comandi", async ({ page }) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-spesa-presi").uncheck();
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "spesa");
  await expect(page.getByTestId("spesa-testo")).toHaveText(["latte", "pane", "pasta"]);
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-spesa-lista").fill("todo.altra");
  await page.getByTestId("campo-spesa-lista").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "spesa");
  await expect(page.getByTestId("spesa-errore")).toContainText("todo.altra");
  await expect(page.getByTestId("spesa-nuova")).toBeDisabled();
});
