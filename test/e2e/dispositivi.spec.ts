import { expect, test, type Page } from "@playwright/test";
import { accedi, comando, info, stanza } from "./aiuti";

/**
 * F2: stanze e dispositivi dai registri di HA, comandi con feedback ottimistico
 * e rollback. Il finto HA ha la casa vera (registri del 26/09) e dispositivi
 * finti che reagiscono ai servizi come quelli veri.
 */
test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const card = (page: Page, tipo: string) => page.getByTestId(`card-${tipo}`);

async function ultimaChiamata(request: Parameters<typeof info>[0]) {
  return (await info(request)).chiamate.at(-1);
}

test("stanze e card dai registri: una card per dispositivo, Cucina vuota nascosta", async ({ page }) => {
  await accedi(page);
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  await expect(page.getByTestId("stanza").filter({ hasText: "Cucina" })).toHaveCount(0);
  await expect(stanza(page, "Soggiorno").getByTestId("card-media")).toContainText("TV Salotto");
  await expect(stanza(page, "Veranda").getByTestId("card-interruttore")).toContainText("Scaldabagno");
  const camera = stanza(page, "Camera da letto");
  await expect(camera.getByTestId("card-clima")).toContainText("Condizionatore");
  await expect(camera.getByTestId("card-tasto")).toContainText("TV camera da letto");
  // condizionatore (climate + switch) e TV (media_player + remote): una card sola ciascuno
  await expect(
    page.locator("jarvis-card-clima, jarvis-card-media, jarvis-card-interruttore, jarvis-card-generica"),
  ).toHaveCount(4);
});

test("TV del salotto: accende con conferma, poi volume e muto", async ({ page, request }) => {
  await accedi(page);
  const tv = card(page, "media");
  await expect(tv.getByTestId("card-stato")).toHaveText("Spenta");
  await tv.locator("button.principale").click();
  await expect(tv.getByTestId("card-stato")).toContainText("Accesa");
  expect(await ultimaChiamata(request)).toMatchObject({
    servizio: "media_player.turn_on",
    dati: { entity_id: "media_player.soggiorno_tv_salotto" },
  });
  await tv.getByRole("button", { name: "Muto" }).click();
  await expect(tv.getByRole("button", { name: "Togli muto" })).toHaveAttribute("aria-pressed", "true");
  await tv.getByRole("button", { name: "Volume su" }).click();
  await expect.poll(async () => (await ultimaChiamata(request))?.servizio).toBe("media_player.volume_up");
});

test("comando rifiutato da HA: la card torna allo stato vero e lo dice", async ({ page, request }) => {
  await comando(request, "rifiuta?servizio=media_player.turn_on");
  await accedi(page);
  const tv = card(page, "media");
  await tv.locator("button.principale").click();
  await expect(page.getByTestId("avviso").filter({ hasText: "ha rifiutato" })).toBeVisible();
  await expect(tv.getByTestId("card-stato")).toHaveText("Spenta");
});

test("dispositivo che non conferma: dopo l'attesa si torna allo stato reale", async ({ page, request }) => {
  test.setTimeout(80_000);
  await comando(request, "muto?entity_id=switch.scaldabagno");
  await accedi(page);
  const bot = card(page, "interruttore");
  await bot.locator("button.principale").click();
  // subito: feedback ottimistico, in attesa di conferma
  await expect(bot.getByTestId("card-stato")).toHaveText("Acceso");
  await expect(bot.getByTestId("card-stato")).toHaveClass(/in-attesa/);
  // il Bot passa dal cloud: si aspettano 30 s, poi rollback con avviso
  await expect(page.getByTestId("avviso").filter({ hasText: "non ha confermato" })).toBeVisible({
    timeout: 40_000,
  });
  await expect(bot.getByTestId("card-stato")).toHaveText("Spento");
});

test("scaldabagno: stato del programma dal pacchetto HA, acceso/spento con conferma", async ({
  page,
  request,
}) => {
  await accedi(page);
  const bot = card(page, "interruttore");
  await expect(bot.getByTestId("programma")).toContainText("Inverno attivo · 2 gg nuvolosi");
  await expect(bot.getByTestId("programma")).toContainText("Si spegne alle 00:00");
  await bot.locator("button.principale").click();
  await expect(bot.getByTestId("card-stato")).toHaveText("Acceso");
  await expect(bot.getByTestId("card-stato")).not.toHaveClass(/in-attesa/);
  // il programma cambia sul server → il testo cambia da solo
  await comando(request, "stato", {
    entity_id: "binary_sensor.jarvis_scaldabagno_modalita_inverno",
    state: "off",
  });
  await comando(request, "stato", {
    entity_id: "sensor.jarvis_scaldabagno_prossimo_cambio",
    state: "Modalità inverno spenta",
  });
  await expect(bot.getByTestId("programma")).toHaveText("Modalità inverno spenta");
});

test("condizionatore a infrarossi: 4 modalità + Altro, ultimo comando, temperatura con un solo invio", async ({
  page,
  request,
}) => {
  await accedi(page);
  const clima = card(page, "clima");
  await expect(clima.getByTestId("card-stato")).toContainText("Ultimo comando: Ventola");
  const modi = clima.locator(".comandi button");
  await expect(modi).toHaveText(["Spento", "Freddo", "Caldo", "Ventola", "Altro"]);
  await clima.getByRole("button", { name: "Freddo" }).click();
  await expect(clima.getByTestId("card-stato")).toContainText("Ultimo comando: Freddo");
  expect(await ultimaChiamata(request)).toMatchObject({
    servizio: "climate.set_hvac_mode",
    dati: { hvac_mode: "cool" },
  });
  await expect(page.getByTestId("avviso").filter({ hasText: "comando inviato" })).toBeVisible();

  await clima.getByRole("button", { name: "Altro" }).click();
  await expect(modi).toHaveText(["Auto", "Deumidifica", "Indietro"]);
  await clima.getByRole("button", { name: "Indietro" }).click();

  const prima = (await info(request)).chiamate.length;
  await clima.getByRole("button", { name: "Alza temperatura" }).click();
  await clima.getByRole("button", { name: "Alza temperatura" }).click();
  await expect(clima.getByTestId("clima-temperatura")).toHaveText("26°");
  await expect.poll(async () => (await info(request)).chiamate.length, { timeout: 5000 }).toBe(prima + 1);
  expect(await ultimaChiamata(request)).toMatchObject({
    servizio: "climate.set_temperature",
    dati: { temperature: 26 },
  });
});

test("TV della camera a infrarossi: tasto unico, nessun finto stato", async ({ page, request }) => {
  await accedi(page);
  const tasto = card(page, "tasto");
  await expect(tasto).toContainText("stato non verificabile");
  await expect(tasto).not.toContainText("Accesa");
  await expect(tasto).not.toContainText("Spenta");
  await tasto.getByRole("button", { name: "Tasto accensione" }).click();
  expect(await ultimaChiamata(request)).toMatchObject({
    servizio: "switch.turn_on",
    dati: { entity_id: "switch.tv_camera_da_letto" },
  });
  await expect(
    page.getByTestId("avviso").filter({ hasText: "TV camera da letto: comando inviato" }),
  ).toBeVisible();
});

test("offline: comandi disattivati subito, nessun comando parte", async ({ page, request }) => {
  await accedi(page);
  await comando(request, "spegni");
  await expect(card(page, "media").locator("button.principale")).toBeDisabled({ timeout: 5000 });
  await expect(card(page, "tasto").getByRole("button", { name: "Tasto accensione" })).toBeDisabled();
  await expect(card(page, "clima").getByRole("button", { name: "Freddo" })).toBeDisabled();
  const prima = (await info(request)).chiamate.length;
  await card(page, "clima").getByRole("button", { name: "Freddo" }).click({ force: true });
  expect((await info(request)).chiamate.length).toBe(prima);
});

test("dispositivo nuovo in HA: compare da solo nella sua stanza, senza ricaricare", async ({
  page,
  request,
}) => {
  await accedi(page);
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  await comando(request, "aggiungi", {
    dispositivo: {
      id: "d-luce",
      area_id: "cucina",
      name: "Luce cucina",
      name_by_user: null,
      disabled_by: null,
    },
    entita: { ei: "light.cucina", di: "d-luce", pl: "hue" },
    s: "off",
    a: { friendly_name: "Luce cucina" },
  });
  const cucina = stanza(page, "Cucina");
  await expect(cucina).toBeVisible({ timeout: 5000 });
  // le luci non sono ancora comandabili dal pannello: si vede, ma nessun pulsante finto
  await expect(cucina.getByTestId("card-generica")).toContainText("Non ancora comandabile");
  await expect(cucina.getByTestId("card-generica").locator("button")).toHaveCount(0);
});
