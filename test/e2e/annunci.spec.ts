import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "./aiuti";

/**
 * Jarvis parla per primo (v0.5.4): evento jarvis_annuncio {pannello, testo,
 * ascolta}, come jarvis_voce.annuncia del server 0.2.8. Il pannello è in
 * cucina (device_id jarvis_cucina).
 */

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => {
    localStorage.setItem("jarvis-stanza-pannello", "Cucina");
    // niente notte del riposo: di notte (23-7 di serie) gli annunci si scrivono e non si dicono,
    // e le prove dipenderebbero dall'ora (la release della v0.5.6 è caduta alle 23 di Roma)
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 }));
  });
});

/**
 * L'evento parte solo quando il pannello è iscritto a jarvis_annuncio: il
 * pannello segna "connesso" prima di iscriversi agli eventi, e un annuncio
 * mandato in mezzo si perderebbe (come per i timer con iscrittiTimer).
 */
const annuncio = async (
  request: Parameters<typeof comando>[0],
  testo: string,
  ascolta = false,
  pannello = "jarvis_cucina",
) => {
  await expect.poll(async () => (await info(request)).iscrittiAnnunci).toBeGreaterThanOrEqual(1);
  await comando(request, "annuncio", { pannello, testo, ascolta });
};

test("annuncio per questo pannello: Hub in primo piano, la voce di Jarvis lo dice (tts→tts)", async ({
  page,
  request,
}) => {
  await accedi(page);
  await annuncio(request, "In camera ci sono 28 gradi: vuoi che accenda il condizionatore?");
  await expect(page.getByTestId("hub-risposta")).toHaveText(
    "In camera ci sono 28 gradi: vuoi che accenda il condizionatore?",
  );
  await expect.poll(async () => (await info(request)).richiesteTts.length).toBe(1);
  const r = (await info(request)).richiesteAssistente;
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({
    start_stage: "tts",
    end_stage: "tts",
    testo: "In camera ci sono 28 gradi: vuoi che accenda il condizionatore?",
  });
  // ascolta=false: niente riascolto dopo
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("hub-ascolto-ancora")).toHaveCount(0);
});

test("ascolta=true: dopo l'annuncio «Ti ascolto ancora»", async ({ page, request }) => {
  await accedi(page);
  await annuncio(request, "Buongiorno! Oggi pioggia dalle 15.", true);
  await expect(page.getByTestId("hub-risposta")).toHaveText("Buongiorno! Oggi pioggia dalle 15.");
  await expect(page.getByTestId("hub-ascolto-ancora")).toBeVisible({ timeout: 8000 });
});

test("annuncio di un altro pannello: qui niente", async ({ page, request }) => {
  await accedi(page);
  await annuncio(request, "Per il soggiorno", false, "jarvis_soggiorno");
  await page.waitForTimeout(1500);
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
  await expect(page.getByTestId("hub-risposta")).toHaveCount(0);
});

test("due annunci insieme: in coda, detti uno dopo l'altro", async ({ page, request }) => {
  await accedi(page);
  await annuncio(request, "Primo annuncio");
  await annuncio(request, "Secondo annuncio");
  await expect(page.getByTestId("hub-risposta")).toHaveText("Secondo annuncio", { timeout: 10_000 });
  const testi = (await info(request)).richiesteAssistente.map((r) => r.testo);
  expect(testi).toEqual(["Primo annuncio", "Secondo annuncio"]);
  expect((await info(request)).richiesteTts).toHaveLength(2);
});

test("ora del silenzio (binary_sensor di HA): niente voce, resta scritto a riposo; un tocco lo toglie", async ({
  page,
  request,
}) => {
  await accedi(page);
  await comando(request, "stato", { entity_id: "binary_sensor.jarvis_annunci_in_silenzio", state: "on" });
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(page.getByTestId("riposo")).toBeVisible();
  await annuncio(request, "Fa caldo in camera");
  await expect(page.getByTestId("riposo-annuncio")).toContainText("Fa caldo in camera");
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
  await page.getByTestId("riposo-annuncio").click();
  await expect(page.getByTestId("riposo-annuncio")).toHaveCount(0);
  // il tocco sull'annuncio non sveglia il pannello
  await expect(page.getByTestId("riposo")).toBeVisible();
});

test("Impostazioni → Jarvis parla per primo: le entità del pacchetto si cambiano da qui, col ripristino", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "annunci");
  const generale = page.getByTestId("campo-input_boolean.jarvis_annunci");
  await expect(generale).toBeChecked();
  await generale.uncheck();
  await expect
    .poll(async () => (await info(request)).chiamate.map((c) => c.servizio))
    .toContain("input_boolean.turn_off");
  await expect(generale).not.toBeChecked();
  const soglia = page.getByTestId("campo-input_number.jarvis_annuncio_caldo_soglia");
  await soglia.fill("25");
  await soglia.press("Enter");
  await expect(soglia).toHaveValue("25");
  await page.getByTestId("ripristina-input_number.jarvis_annuncio_caldo_soglia").click();
  await expect(soglia).toHaveValue("27");
  const da = page.getByTestId("campo-input_datetime.jarvis_annunci_silenzio_da");
  await expect(da).toHaveValue("23:00");
  await da.fill("22:30");
  await expect(da).toHaveValue("22:30");
  await expect(page.getByTestId("ripristina-input_datetime.jarvis_annunci_silenzio_da")).toBeVisible();
  const chiamate = (await info(request)).chiamate;
  expect(chiamate).toContainEqual({
    servizio: "input_datetime.set_datetime",
    dati: { time: "22:30:00", entity_id: "input_datetime.jarvis_annunci_silenzio_da" },
  });
  // preferenze del pannello
  await page.getByTestId("campo-solo-testo").check();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("jarvis-annunci"))) ?? "{}")).toEqual({
    soloTesto: true,
    volume: 100,
  });
});
