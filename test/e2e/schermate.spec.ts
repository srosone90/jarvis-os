import { expect, test, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info, soloComandi } from "./aiuti";

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

test("colonna di serie come il mockup N2; Altro porta a tutte le schermate, alle impostazioni e all'Hub", async ({
  page,
}) => {
  await accedi(page);
  await expect(page.getByTestId("colonna-altro")).toBeVisible();
  const voci = await page
    .locator("jarvis-colonna button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(voci).toEqual([
    "colonna-casa",
    "colonna-musica",
    "colonna-meteo",
    "colonna-timer",
    "colonna-altro",
    "colonna-hub",
  ]);
  await page.getByTestId("colonna-altro").click();
  expect(new URL(page.url()).hash).toBe("#altro");
  const tessere = await page
    .getByTestId("altro-griglia")
    .locator("button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(tessere).toEqual([
    "altro-casa",
    "altro-musica",
    "altro-meteo",
    "altro-timer",
    "altro-clima",
    "altro-scene",
    "altro-spesa",
    "altro-avvisi",
    "altro-impostazioni",
    "altro-hub",
  ]);
  // una schermata che non sta nella colonna accende "Altro"
  await page.getByTestId("altro-spesa").click();
  await expect(page.getByTestId("pagina-spesa")).toBeVisible();
  await expect(page.getByTestId("colonna-altro")).toHaveAttribute("aria-current", "page");
  // le impostazioni si aprono anche da qui (non solo dall'orologio di Casa)
  await page.getByTestId("colonna-altro").click();
  await page.getByTestId("altro-impostazioni").click();
  await expect(page.getByTestId("impostazioni")).toBeVisible();
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("altro-hub").click();
  await expect(page.getByTestId("vista-hub")).toBeVisible();
});

test("Impostazioni → Schermate: ogni schermata nella colonna, in Altro o spenta; Casa e Altro fisse", async ({
  page,
}) => {
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("dove-casa")).toHaveCount(0);
  await expect(page.getByTestId("dove-altro")).toHaveCount(0);
  await page.getByTestId("dove-spesa").selectOption("colonna");
  await page.getByTestId("dove-meteo").selectOption("spenta");
  await page.getByTestId("chiudi-impostazioni").click();
  const voci = await page
    .locator("jarvis-colonna button")
    .evaluateAll((b) => b.map((x) => x.getAttribute("data-test")));
  expect(voci).toEqual([
    "colonna-casa",
    "colonna-musica",
    "colonna-timer",
    "colonna-spesa",
    "colonna-altro",
    "colonna-hub",
  ]);
  await page.getByTestId("colonna-altro").click();
  await expect(page.getByTestId("altro-meteo")).toHaveCount(0);
  // spenta: nemmeno dall'indirizzo, e niente tocco sul meteo della Casa
  await page.goto("./index.html#meteo");
  await expect(page.getByTestId("stanza").first()).toBeVisible();
  await expect(page.getByTestId("pagina-meteo")).toHaveCount(0);
  // ripristino
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("ripristina-colonna").click();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("colonna-meteo")).toBeVisible();
  await expect(page.getByTestId("colonna-spesa")).toHaveCount(0);
});

test("Timer: elenco col conto alla rovescia; nuovo e annulla chiedono a Jarvis la frase di voce", async ({
  page,
  request,
}) => {
  await accedi(page);
  await page.getByTestId("colonna-timer").click();
  await expect(page.getByTestId("timer-nessuno")).toBeVisible();
  await comando(request, "timer", {
    tipo: "started",
    id: "t-pasta",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 600,
  });
  const pasta = page.getByTestId("timer-attivo");
  await expect(pasta.getByTestId("timer-nome")).toHaveText("pasta");
  await expect(pasta).toContainText("10 minuti");
  await expect(pasta.getByTestId("timer-resto")).toHaveText(/^9:5\d$/, { timeout: 5000 });
  await pasta.getByTestId("timer-annulla").click();
  await expect
    .poll(async () => (await info(request)).richiesteAssistente.map((r) => r.testo))
    .toContain("Annulla il timer pasta");
  // nuovo: la frase arriva a Jarvis, e il timer che Jarvis crea compare qui (il finto: 2 s)
  await comando(request, "timer", {
    tipo: "cancelled",
    id: "t-pasta",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 0,
  });
  await comando(request, "assistente?modo=timer");
  const rapidi = page.getByTestId("timer-nuovo");
  await expect(rapidi).toHaveText(["1 min", "3 min", "5 min", "10 min", "15 min", "30 min"]);
  // per nome esatto: "5 min" è anche dentro "15 min"
  await page.getByRole("button", { name: "Timer di 5 minuti", exact: true }).click();
  await expect
    .poll(async () => (await info(request)).richiesteAssistente.at(-1)?.testo)
    .toBe("Imposta un timer di 5 minuti");
  await expect(page.getByTestId("timer-attivo")).toBeVisible();
  await expect(page.getByTestId("timer-finito")).toBeVisible({ timeout: 6000 });
  await page.getByTestId("timer-stop").click();
  // durate scelte a mano
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-timer-durate").fill("2, 7, 90");
  await page.getByTestId("campo-timer-durate").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("colonna-timer").click();
  await expect(page.getByTestId("timer-nuovo")).toHaveText(["2 min", "7 min", "1 h 30"]);
});

test("Clima: grafico di tutte le stanze con termometro, stanze, scaldabagno; consumi solo se c'è un sensore", async ({
  page,
  request,
}) => {
  await accedi(page);
  await daAltro(page, "clima");
  await expect(page.getByTestId("clima-legenda")).toHaveText(/Soggiorno.*Camera da letto/);
  const stanze = page.getByTestId("clima-stanza");
  await expect(stanze).toHaveCount(3);
  await expect(stanze.filter({ hasText: "Soggiorno" }).getByTestId("clima-temperatura")).toHaveText("25,7°");
  await expect(stanze.filter({ hasText: "Veranda" })).toContainText("nessun termometro");
  await expect(page.getByTestId("pagina-clima").getByText("Scaldabagno", { exact: true })).toBeVisible();
  // oggi in casa non c'è un sensore di consumo: la parte non c'è
  await expect(page.getByTestId("clima-consumi")).toHaveCount(0);
  await comando(request, "aggiungi", {
    entita: { ei: "sensor.casa_potenza", pl: "shelly" },
    s: "420",
    a: { device_class: "power", unit_of_measurement: "W", friendly_name: "Casa" },
  });
  await expect(page.getByTestId("clima-consumi")).toContainText("420 W");
  // si spegne dalle impostazioni
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-clima-consumi").uncheck();
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "clima");
  await expect(page.getByTestId("clima-consumi")).toHaveCount(0);
  // una stanza si apre col tocco
  await page.getByTestId("clima-stanza").filter({ hasText: "Camera da letto" }).click();
  await expect(page.getByTestId("pagina-stanza-nome")).toHaveText("Camera da letto");
});

test("Scene: dalla Casa e dalla schermata, script.turn_on; evidenziata mentre gira; scena mancante detta", async ({
  page,
  request,
}) => {
  await accedi(page);
  const casa = page.getByTestId("zona-scene").getByRole("button");
  await expect(casa).toHaveText(["Buonanotte", "Esco", "Rientro"]);
  await casa.filter({ hasText: "Esco" }).click();
  await expect(page.getByTestId("avviso").filter({ hasText: "Esco: avviata" })).toBeVisible();
  expect(soloComandi((await info(request)).chiamate)).toContainEqual({
    servizio: "script.turn_on",
    dati: { entity_id: "script.jarvis_esco" },
  });
  await daAltro(page, "scene");
  const scene = page.getByTestId("scena");
  await expect(scene).toHaveCount(3);
  await expect(scene.filter({ hasText: "Esco" })).toContainText("Spegne TV del salotto e condizionatore");
  await scene.filter({ hasText: "Buonanotte" }).click();
  await expect(scene.filter({ hasText: "Buonanotte" })).toHaveAttribute("aria-pressed", "true");
  await expect(scene.filter({ hasText: "Buonanotte" })).toHaveAttribute("aria-pressed", "false", {
    timeout: 5000,
  });
  // scelte a mano, anche una che in HA non c'è
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  // campo su più righe: il valore vale quando si esce dal campo
  await page.getByTestId("campo-scene").fill("script.jarvis_rientro, script.non_esiste");
  await page.getByTestId("campo-scene").blur();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(casa).toHaveText(["Rientro", "Non esiste"]);
  await daAltro(page, "scene");
  await expect(scene).toHaveCount(2);
  await expect(scene.filter({ hasText: "Non esiste" })).toBeDisabled();
  await expect(page.getByTestId("scena-mancante")).toContainText("script.non_esiste");
});

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

test("Avvisi: batterie basse, eventi dei dispositivi dal registro di HA, filtri, interruzioni della connessione", async ({
  page,
  request,
}) => {
  await accedi(page);
  await daAltro(page, "avvisi");
  // batteria del meter della camera al 12%; quella dello scaldabagno (100%) no
  const batterie = page.getByTestId("avviso-batteria");
  await expect(batterie).toHaveCount(1);
  await expect(batterie).toContainText("Meter letto batteria");
  await expect(batterie).toContainText("12%");
  // dispositivi: ultime 24 ore, dal più recente; "unknown" (infrarossi) e i sensori no
  const eventi = page.getByTestId("avviso-dispositivo");
  await expect(eventi).toHaveCount(3);
  await expect(eventi.nth(0)).toContainText("TV Salotto");
  await expect(eventi.nth(0)).toContainText("accensione");
  await expect(eventi.nth(0)).toContainText("da un utente");
  await expect(eventi.nth(1)).toContainText("Condizionatore");
  await expect(eventi.nth(1)).toContainText("ventola");
  await expect(eventi.nth(1)).toContainText("da Jarvis · Rientro");
  await expect(eventi.nth(2)).toContainText("Scaldabagno");
  await expect(eventi.nth(2)).toContainText("spegnimento");
  // filtri
  await page.getByTestId("filtro-batterie").click();
  await expect(eventi).toHaveCount(0);
  await expect(batterie).toHaveCount(1);
  await page.getByTestId("filtro-dispositivi").click();
  await expect(batterie).toHaveCount(0);
  await expect(eventi).toHaveCount(3);
  await page.getByTestId("filtro-connessione").click();
  await expect(page.getByTestId("avvisi-nessuno")).toContainText("Nessuna interruzione");
  // Home Assistant giù e su: l'interruzione la scrive il pannello
  await comando(request, "spegni");
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
  await comando(request, "accendi");
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso", { timeout: 20_000 });
  await expect(page.getByTestId("avviso-connessione")).toContainText("Home Assistant non raggiungibile");
  // e resta dopo la ricarica
  await page.reload();
  await daAltro(page, "avvisi");
  await page.getByTestId("filtro-connessione").click();
  await expect(page.getByTestId("avviso-connessione")).toHaveCount(1);
});

test("Avvisi: un comando dato adesso entra nel registro; soglia della batteria e ore dalle impostazioni", async ({
  page,
}) => {
  await accedi(page);
  await page.getByTestId("card-media").locator("button.principale").click();
  // il volume compare solo quando HA conferma lo stato vero (non quello ottimistico)
  await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible({ timeout: 5000 });
  await daAltro(page, "avvisi");
  await expect(page.getByTestId("avviso-dispositivo")).toHaveCount(4);
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-avvisi-soglia").fill("10");
  await page.getByTestId("campo-avvisi-soglia").press("Enter");
  await page.getByTestId("campo-avvisi-ore").fill("3");
  await page.getByTestId("campo-avvisi-ore").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  await daAltro(page, "avvisi");
  await expect(page.getByTestId("avvisi-batterie-ok")).toHaveText("Nessuna batteria sotto il 10%.");
  // nelle ultime 3 ore: la TV accesa adesso e quella di 2 ore fa
  await expect(page.getByTestId("avviso-dispositivo")).toHaveCount(2);
});
