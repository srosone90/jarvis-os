import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "./aiuti";

/**
 * Fase G (v0.4.8), scelte di Salvatore del 30/09: schermo a riposo C (sfera),
 * Hub H1, impostazioni S1, procedura guidata S3 al primo avvio.
 * Vincolo: il riposo cambia solo la vista, non ferma timer, voce, musica.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const riposo = (page: Page) => page.getByTestId("riposo");

/** Senza notte (da = a): le prove girano a qualunque ora, anche dopo le 23. */
async function senzaNotte(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 })),
  );
}
const completo = (page: Page) => page.getByRole("button", { name: "Chiedi a Jarvis…" });

/** A riposo subito, dalle impostazioni ("Metti a riposo"), senza aspettare i 2 minuti. */
async function mettiARiposo(page: Page): Promise<void> {
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(riposo(page)).toBeVisible();
}


test("impostazioni: quattro sezioni, Esc e Indietro di Android le chiudono senza uscire", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "stanza");
  for (const s of ["stanza", "riposo", "audio", "diagnostica"])
    await expect(page.getByTestId(`sezione-${s}`)).toBeVisible();
  await page.getByTestId("sezione-diagnostica").click();
  await expect(page.getByTestId("diagnostica")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("impostazioni")).toHaveCount(0);
  await apriImpostazioni(page, "audio");
  await page.goBack();
  await expect(page.getByTestId("impostazioni")).toHaveCount(0);
  await expect(completo(page)).toBeVisible();
  expect(page.url()).toContain("/local/jarvis/index.html");
});

test.describe("procedura guidata del primo avvio", () => {
  // pannello nuovo: niente "guida fatta" nello stato iniziale
  test.use({ storageState: { cookies: [], origins: [] } });

  test("stanza, schermo a riposo, riepilogo; poi non torna più, e si rifà dalle impostazioni", async ({
    page,
  }) => {
    await accedi(page);
    const guida = page.getByTestId("guida");
    await expect(guida).toBeVisible();
    await expect(page.getByTestId("guida-avanti")).toBeDisabled();
    await page.getByTestId("guida-stanza").filter({ hasText: "Cucina" }).click();
    await page.getByTestId("guida-avanti").click();
    await page.getByTestId("guida-riposo").filter({ hasText: "Dopo 5 minuti" }).click();
    await page.getByTestId("guida-avanti").click();
    // v0.5.0: «Jarvis» sempre in ascolto, acceso di serie; qui lo si spegne
    await expect(page.getByTestId("guida-parola").filter({ hasText: "Sì" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId("guida-parola").filter({ hasText: "No" }).click();
    await page.getByTestId("guida-avanti").click();
    await expect(page.getByTestId("guida-riepilogo")).toContainText("Cucina");
    await expect(page.getByTestId("guida-riepilogo")).toContainText("dopo 5 minuti");
    await expect(page.getByTestId("guida-riepilogo")).toContainText("sempre in ascolto: no");
    await page.getByTestId("guida-fine").click();
    await expect(guida).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("jarvis-stanza-pannello"))).toBe("Cucina");
    expect(
      JSON.parse((await page.evaluate(() => localStorage.getItem("jarvis-parola"))) ?? "{}"),
    ).toMatchObject({ acceso: false, suono: true });
    await page.reload();
    await expect(completo(page)).toBeVisible();
    await expect(guida).toHaveCount(0);
    await apriImpostazioni(page, "stanza");
    await page.getByTestId("rifai-guida").click();
    await expect(guida).toBeVisible();
  });

  test("pannello installato prima (stanza già scelta): la guida non compare", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
    await accedi(page);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("guida")).toHaveCount(0);
  });
});
