import { expect, test } from "@playwright/test";
import { accedi, aspettaServiceWorker, comando } from "./aiuti";

/**
 * Pagina della prova di fattibilità "Ehi Jarvis" (fuori dal pannello). Il
 * microfono finto di Chromium suona un tono: qui si prova la meccanica (modello
 * caricato, frame elaborati, tempi, privacy, service worker), non il
 * riconoscimento. Quello è verificato contro openWakeWord originale sulle clip
 * di prova (CLAUDE.md, "Ehi Jarvis": punteggi identici frame per frame).
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("si apre anche col service worker del pannello installato (che non la sostituisce con index.html)", async ({
  page,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  await page.goto("./prova-ehi-jarvis.html");
  await expect(page).toHaveTitle("Prova «Ehi Jarvis»");
  await expect(page.getByTestId("licenza")).toContainText("CC BY-NC-SA 4.0");
  await expect(page.getByTestId("licenza")).toContainText("solo non commerciale");
});

test("ascolto: modello caricato, frame elaborati con i tempi, privacy visibile solo mentre ascolta", async ({
  page,
}) => {
  const errori: string[] = [];
  page.on("pageerror", (e) => errori.push(e.message));
  await page.goto("./prova-ehi-jarvis.html");
  const privacy = page.getByTestId("privacy");
  await expect(privacy).toBeHidden();
  await page.getByRole("button", { name: "Avvia l'ascolto" }).click();
  await expect(page.getByTestId("stato")).toContainText("In ascolto", { timeout: 20_000 });
  await expect(privacy).toBeVisible();
  await expect(privacy).toContainText("non vengono né inviati né salvati");
  // almeno ~2 s di audio elaborato
  await expect
    .poll(async () => Number((await page.locator('[data-t="frame"]').textContent())?.split(" ")[0]), {
      timeout: 15_000,
    })
    .toBeGreaterThan(25);
  const risultati = await page.getByTestId("risultati").inputValue();
  expect(risultati).toMatch(/Tempo per frame: media \d+,\d ms/);
  expect(risultati).toContain("microfono a 16000 Hz");
  expect(risultati).toContain("Memoria circolare: 3,5 s");
  // il tono del microfono finto non è la parola
  await expect(page.getByTestId("attivazioni")).toHaveText("0");

  // soglia e memoria si regolano
  await page.locator("#soglia").fill("0.3");
  await expect(page.getByTestId("soglia")).toHaveText("0,30");
  await page.getByTestId("secondi-memoria").fill("4");
  await page.getByTestId("secondi-memoria").dispatchEvent("change");
  await expect(page.getByTestId("risultati")).toHaveValue(/Memoria circolare: 4,0 s/);

  await page.getByRole("button", { name: "Ferma" }).click();
  await expect(privacy).toBeHidden();
  await expect(page.getByTestId("registro")).toContainText("memoria circolare svuotata");
  expect(errori).toEqual([]);
});

test("serie e falsi positivi: si contano e finiscono nei risultati", async ({ page }) => {
  await page.goto("./prova-ehi-jarvis.html");
  await page.getByRole("button", { name: "Avvia l'ascolto" }).click();
  await expect(page.getByTestId("stato")).toContainText("In ascolto", { timeout: 20_000 });
  await page.getByTestId("come").selectOption("«Jarvis» da solo");
  await page.getByTestId("distanza").selectOption("3 m");
  await page.getByRole("button", { name: "Inizia serie" }).click();
  await page.getByRole("button", { name: "Fine serie" }).click();
  await expect(page.locator("table[data-test=serie]")).toContainText("«Jarvis» da solo");
  await page.getByRole("button", { name: "Inizia il conteggio" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Fine conteggio" }).click();
  const risultati = await page.getByTestId("risultati").inputValue();
  expect(risultati).toContain("Serie «Jarvis» da solo a 3 m, soglia 0,50: 0/20 riconosciuti");
  expect(risultati).toMatch(/Falsi positivi \(TV\): 0 in \d/);
});
