import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "../aiuti";

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

test("dopo 2 minuti senza tocchi va a riposo: sfera, ora, meteo e stanze; un tocco fuori torna al pannello", async ({
  page,
}) => {
  await senzaNotte(page);
  await page.clock.install();
  await accedi(page);
  await page.clock.fastForward(110_000);
  await expect(completo(page)).toBeVisible();
  await expect(riposo(page)).toHaveCount(0);
  await page.clock.fastForward(12_000);
  await expect(riposo(page)).toBeVisible();
  await expect(page.getByTestId("riposo-sfera")).toBeVisible();
  const righe = page.getByTestId("riposo-righe");
  await expect(righe).toContainText("Soggiorno");
  await expect(righe).toContainText("Camera da letto");
  await page.getByTestId("riposo-ora").click();
  await expect(riposo(page)).toHaveCount(0);
  await expect(completo(page)).toBeVisible();
});

test("«mai da solo» nelle impostazioni: niente riposo, anche dopo una ricarica", async ({ page }) => {
  await page.clock.install();
  await accedi(page);
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("riposo-attesa").selectOption("mai");
  await page.getByTestId("chiudi-impostazioni").click();
  await page.clock.fastForward(10 * 60_000);
  await expect(riposo(page)).toHaveCount(0);
  await page.reload();
  await expect(completo(page)).toBeVisible();
  await page.clock.fastForward(10 * 60_000);
  await expect(riposo(page)).toHaveCount(0);
});

test("con le impostazioni aperte non va a riposo (niente nascosto sotto il naso)", async ({ page }) => {
  await page.clock.install();
  await accedi(page);
  await apriImpostazioni(page, "stanza");
  await page.clock.fastForward(5 * 60_000);
  await expect(page.getByTestId("impostazioni")).toBeVisible();
  await expect(riposo(page)).toHaveCount(0);
});

test("a riposo: timer come anelli e pastiglie, in pausa fermo; «Timer finito» sopra il riposo", async ({
  page,
  request,
}) => {
  await senzaNotte(page);
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", {
    tipo: "started",
    id: "p",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 540,
  });
  await comando(request, "timer", {
    tipo: "updated",
    id: "u",
    nome: "uova",
    secondi_totali: 360,
    secondi_rimasti: 190,
    in_pausa: true,
  });
  await mettiARiposo(page);
  const chips = page.getByTestId("riposo-timer");
  await expect(chips).toHaveCount(2);
  await expect(chips.filter({ hasText: "uova" })).toContainText("3:10");
  await page.waitForTimeout(2000);
  await expect(chips.filter({ hasText: "uova" })).toContainText("3:10");
  // due anelli attorno alla sfera
  expect(
    await page.getByTestId("riposo-sfera").evaluate((s) => s.shadowRoot?.querySelectorAll("circle").length),
  ).toBe(4);
  await comando(request, "timer", {
    tipo: "finished",
    id: "p",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 0,
  });
  await expect(page.getByTestId("timer-finito")).toContainText("Timer pasta finito");
  // il riposo resta sotto (non si torna al pannello completo)
  await expect(riposo(page)).toBeVisible();
  await page.getByTestId("timer-stop").click();
  await expect(page.getByTestId("timer-finito")).toHaveCount(0);
  await expect(riposo(page)).toBeVisible();
});

test("di notte: solo ora e timer, sfera ferma; «Timer finito» in rosso scuro", async ({ page, request }) => {
  // notte = l'ora attuale, qualunque sia
  await page.addInitScript(() => {
    const h = new Date().getHours();
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: h, notteA: (h + 1) % 24 }));
  });
  await accedi(page);
  await expect.poll(async () => (await info(request)).iscrittiTimer).toBe(1);
  await comando(request, "timer", {
    tipo: "started",
    id: "p",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 300,
  });
  await mettiARiposo(page);
  await expect(riposo(page)).toHaveAttribute("data-momento", "notte");
  await expect(page.getByTestId("riposo-righe")).toHaveCount(0);
  await expect(page.getByTestId("riposo-timer")).toHaveCount(1);
  await expect(page.getByTestId("riposo-sfera")).toHaveAttribute("stato", "notturna");
  await comando(request, "timer", {
    tipo: "finished",
    id: "p",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 0,
  });
  await expect(page.getByTestId("overlay-timer")).toHaveAttribute("notte", "");
});

test("a riposo: cosa suona, letto da jarvis_musica.stato", async ({ page, request }) => {
  await senzaNotte(page);
  await comando(request, "musica", {
    stato: "in_riproduzione",
    stanza: "Cucina",
    volume: 40,
    titolo: "Bohemian Rhapsody",
  });
  await accedi(page);
  await mettiARiposo(page);
  await expect(page.getByTestId("riposo-musica")).toContainText("Bohemian Rhapsody");
  await expect(page.getByTestId("riposo-musica")).toContainText("Cucina");
});
