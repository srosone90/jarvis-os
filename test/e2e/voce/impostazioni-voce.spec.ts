import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "../aiuti";

/** Impostazioni → Voce → Falsi scatti (v0.5.4): ogni valore col suo "di serie" e il ripristino. */

test("falsi scatti: si cambia, si salva sul pannello, si ripristina", async ({ page, request }) => {
  await comando(request, "reset");
  await accedi(page);
  await apriImpostazioni(page, "voce");
  await expect(page.getByTestId("falsi-scatti")).toBeVisible();
  const conferma = page.getByTestId("campo-pazienza");
  await expect(conferma).toHaveValue("2");
  await expect(page.getByTestId("serie-pazienza")).toHaveText("Di serie: 2 di fila");
  await expect(page.getByTestId("ripristina-pazienza")).toHaveCount(0);
  await conferma.fill("3");
  await conferma.press("Enter");
  await expect(page.getByTestId("ripristina-pazienza")).toBeVisible();
  const salvate = async () =>
    JSON.parse((await page.evaluate(() => localStorage.getItem("jarvis-parola"))) ?? "{}") as Record<
      string,
      unknown
    >;
  expect(await salvate()).toMatchObject({ pazienza: 3 });
  // soglia a mano, poi di nuovo automatica
  const soglia = page.getByTestId("campo-soglia-manuale");
  await soglia.fill("0.7");
  await soglia.press("Enter");
  expect(await salvate()).toMatchObject({ sogliaManuale: 0.7 });
  await page.getByTestId("ripristina-soglia-manuale").click();
  expect(await salvate()).toMatchObject({ sogliaManuale: null });
  // con l'adattamento spento i suoi numeri si spengono
  await page.getByTestId("campo-adattiva").uncheck();
  await expect(page.getByTestId("campo-vuoti")).toBeDisabled();
  await page.getByTestId("ripristina-adattiva").click();
  await expect(page.getByTestId("campo-vuoti")).toBeEnabled();
  await page.getByTestId("ripristina-pazienza").click();
  await expect(conferma).toHaveValue("2");
  // dopo una ricarica restano
  await page.getByTestId("campo-impara").uncheck();
  await page.reload();
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso");
  expect(await salvate()).toMatchObject({ impara: false, pazienza: 2 });
});
