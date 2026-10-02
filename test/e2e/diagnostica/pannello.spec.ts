import { expect, test } from "@playwright/test";
import { HA, accedi, apriDiagnostica, comando } from "../aiuti";

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("diagnostica: si apre solo tenendo premuto l'orologio 3 s e mostra versione, indirizzo, latenza", async ({
  page,
}) => {
  await accedi(page);
  const ora = page.getByTestId("ora");
  // una pressione breve non apre niente
  await ora.click({ delay: 1000 });
  await expect(page.getByTestId("diagnostica")).toHaveCount(0);

  await apriDiagnostica(page);
  await expect(page.getByTestId("versione")).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(page.getByTestId("origine")).toHaveText(HA);
  await expect(page.getByTestId("diag-stato")).toHaveText("connesso");
  await expect(page.getByTestId("latenza")).toHaveText(/^\d+ ms$/);
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("diagnostica")).toHaveCount(0);
});
