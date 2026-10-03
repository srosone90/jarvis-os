import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "../aiuti";

/**
 * Impostazioni → Voce → Soglia e falsi scatti (v0.5.4): ogni valore col suo
 * "di serie" e il ripristino. Dalla v0.6.5 la soglia è fissa: la soglia che
 * saliva da sola non c'è più, e le sue preferenze vecchie si buttano.
 */

test("soglia e falsi scatti: si cambia, si salva sul pannello, si ripristina", async ({ page, request }) => {
  await comando(request, "reset");
  // preferenze di un pannello della v0.6.4, con la soglia che si adatta
  await page.addInitScript(() => {
    if (!localStorage.getItem("jarvis-parola"))
      localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true, adattiva: true, vuoti: 5 }));
  });
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
  // soglia a mano, poi di nuovo di serie
  const soglia = page.getByTestId("campo-soglia-manuale");
  await soglia.fill("0.7");
  await soglia.press("Enter");
  expect(await salvate()).toMatchObject({ sogliaManuale: 0.7 });
  await page.getByTestId("ripristina-soglia-manuale").click();
  expect(await salvate()).toMatchObject({ sogliaManuale: null });
  // la soglia che si adatta non c'è più, né nel pannello né nelle preferenze salvate
  await expect(page.getByTestId("campo-adattiva")).toHaveCount(0);
  await expect(page.getByTestId("campo-vuoti")).toHaveCount(0);
  expect(Object.keys(await salvate())).not.toContain("adattiva");
  await page.getByTestId("ripristina-pazienza").click();
  await expect(conferma).toHaveValue("2");
  // dopo una ricarica restano
  await page.getByTestId("campo-impara").uncheck();
  await page.reload();
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso");
  expect(await salvate()).toMatchObject({ impara: false, pazienza: 2 });
});
