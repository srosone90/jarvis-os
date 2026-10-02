import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando } from "./aiuti";

/**
 * v0.5.10: esporta e importa le impostazioni (Impostazioni → Esporta e
 * importa) e i valori che erano fissi: conferma delle scene, riquadro della
 * voce, annunci scritti a riposo.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("esporta: un file con le preferenze cambiate, mai il token, la stanza o il registro", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
  await accedi(page);
  await apriImpostazioni(page, "voce");
  await page.getByTestId("campo-riascolto-azione").fill("0");
  await page.getByTestId("campo-riascolto-azione").press("Enter");
  await page.getByTestId("sezione-copia").click();
  const scarico = page.waitForEvent("download");
  await page.getByTestId("copia-esporta").click();
  const d = await scarico;
  expect(d.suggestedFilename()).toMatch(/^jarvis-impostazioni-cucina-\d{4}-\d\d-\d\d\.json$/);
  const testo = await readFile((await d.path()) ?? "", "utf8");
  const f = JSON.parse(testo) as { formato: string; impostazioni: Record<string, string> };
  expect(f.formato).toBe("jarvis-impostazioni");
  expect(JSON.parse(f.impostazioni["jarvis-voce"] ?? "{}")).toMatchObject({ riascoltoAzioneSecondi: 0 });
  // il pannello ha il token (ha fatto il login) e la stanza: nel file non ci sono
  expect(await page.evaluate(() => localStorage.getItem("jarvis-token"))).not.toBeNull();
  for (const k of ["jarvis-token", "jarvis-stanza-pannello", "jarvis-log", "jarvis-interruzioni"])
    expect(Object.keys(f.impostazioni)).not.toContain(k);
  expect(testo).not.toMatch(/access_token|refresh_token/);
});

test("importa: si vede cosa cambia, poi il pannello si ricarica con le impostazioni nuove; il token resta il suo", async ({
  page,
}) => {
  await accedi(page);
  const token = await page.evaluate(() => localStorage.getItem("jarvis-token"));
  await apriImpostazioni(page, "copia");
  const file = {
    formato: "jarvis-impostazioni",
    versione: "0.5.10",
    data: "2026-10-02T08:00:00.000Z",
    impostazioni: {
      "jarvis-voce": JSON.stringify({ riascoltoSecondi: 12, riascoltoAzioneSecondi: 3 }),
      "jarvis-schermate": JSON.stringify({ sceneConferma: true, sceneConfermaSecondi: 7 }),
      // controprova: chi prova a far entrare un token o una stanza
      "jarvis-token": JSON.stringify({ access_token: "rubato" }),
      "jarvis-stanza-pannello": "Garage",
    },
  };
  await page.getByTestId("copia-file").setInputFiles({
    name: "impostazioni.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const conferma = page.getByTestId("copia-conferma");
  await expect(conferma.getByTestId("copia-cambia").locator("li")).toHaveText([
    "Timer, Clima, Scene, Spesa, Avvisi",
    "Voce (riascolto, parlato, riquadro)",
  ]);
  await expect(conferma.getByTestId("copia-scartate")).toContainText(
    "il collegamento a Home Assistant, la stanza del pannello: non si importa",
  );
  await Promise.all([page.waitForEvent("load"), conferma.getByTestId("copia-importa").click()]);
  expect(await page.evaluate(() => localStorage.getItem("jarvis-token"))).toBe(token);
  expect(await page.evaluate(() => localStorage.getItem("jarvis-stanza-pannello"))).toBeNull();
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso", { timeout: 20_000 });
  await apriImpostazioni(page, "voce");
  await expect(page.getByTestId("campo-riascolto")).toHaveValue("12");
  await expect(page.getByTestId("campo-riascolto-azione")).toHaveValue("3");
  await page.getByTestId("sezione-schermate").click();
  await expect(page.getByTestId("campo-scene-conferma")).toBeChecked();
  await expect(page.getByTestId("campo-scene-conferma-secondi")).toHaveValue("7");
});

test("controprove: file non nostro, rotto o già uguale → niente ricarica, errore in parole", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "copia");
  const scegli = (contenuto: string) =>
    page.getByTestId("copia-file").setInputFiles({
      name: "x.json",
      mimeType: "application/json",
      buffer: Buffer.from(contenuto),
    });
  await scegli("{rotto");
  await expect(page.getByTestId("copia-errore")).toContainText("non si legge");
  await scegli(JSON.stringify({ nome: "altro programma" }));
  await expect(page.getByTestId("copia-errore")).toContainText("Non è un file di impostazioni di Jarvis");
  await expect(page.getByTestId("copia-conferma")).toHaveCount(0);
  // già uguale: si può solo annullare
  await page.evaluate(() => localStorage.setItem("jarvis-audio-sveglio", "1"));
  await scegli(
    JSON.stringify({
      formato: "jarvis-impostazioni",
      versione: "0.5.10",
      impostazioni: { "jarvis-audio-sveglio": "1" },
    }),
  );
  await expect(page.getByTestId("copia-uguali")).toBeVisible();
  await expect(page.getByTestId("copia-importa")).toBeDisabled();
  await page.getByTestId("copia-annulla").click();
  await expect(page.getByTestId("copia-conferma")).toHaveCount(0);
});

test("valori che erano fissi: conferma delle scene in 2 s (spenta: campo spento), riquadro della voce per 2 s", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("campo-scene-conferma-secondi")).toBeDisabled();
  await page.getByTestId("campo-scene-conferma").check();
  await page.getByTestId("campo-scene-conferma-secondi").fill("2");
  await page.getByTestId("campo-scene-conferma-secondi").press("Enter");
  await page.getByTestId("sezione-voce").click();
  await page.getByTestId("campo-riquadro-secondi").fill("2");
  await page.getByTestId("campo-riquadro-secondi").press("Enter");
  await page.getByTestId("campo-riascolto-azione").fill("0");
  await page.getByTestId("campo-riascolto-azione").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  const esco = page.getByTestId("zona-scene").getByRole("button").nth(1);
  await esco.click();
  await expect(esco).toHaveText("Tocca ancora");
  const da = Date.now();
  await expect(esco).toHaveText("Esco", { timeout: 4000 });
  expect(Date.now() - da).toBeLessThan(3000);
  // riquadro della voce: sparisce ~2 s dopo la risposta (di serie 6)
  await page.getByRole("button", { name: "Parla con Jarvis" }).click();
  const riquadro = page.getByTestId("riquadro-voce");
  await expect(riquadro.getByTestId("risposta")).toBeVisible();
  await expect(riquadro).toHaveCount(0, { timeout: 5000 });
});
