import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const HA = "http://localhost:18123";

async function comando(request: APIRequestContext, percorso: string, corpo?: unknown): Promise<void> {
  const r = await request.post(`${HA}/__prova/${percorso}`, corpo === undefined ? {} : { data: corpo });
  expect(r.ok()).toBeTruthy();
}

async function info(request: APIRequestContext): Promise<{
  login: number;
  rinnovi: number;
  connessioni: number;
  richieste: Record<string, number>;
}> {
  return (await request.get(`${HA}/__prova/info`)).json();
}

const pallino = (page: Page) => page.getByTestId("pallino");

/** Primo accesso: schermata "Collega", login OAuth, pannello connesso. */
async function accedi(page: Page): Promise<void> {
  await page.goto("./index.html");
  await expect(page.getByTestId("accesso")).toBeVisible();
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
}

/** Aspetta che il service worker controlli la pagina (app in cache). */
async function aspettaServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active !== null && navigator.serviceWorker.controller !== null;
  });
}

async function apriDiagnostica(page: Page): Promise<void> {
  const ora = page.getByTestId("ora");
  const box = await ora.boundingBox();
  if (!box) throw new Error("orologio non visibile");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId("diagnostica")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("primo accesso: login OAuth, dati reali di HA, indirizzo ripulito, login ricordato", async ({
  page,
  request,
}) => {
  await accedi(page);
  expect(page.url()).toBe(`${HA}/local/jarvis/index.html`);

  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
  await expect(page.getByTestId("meteo-cond")).toHaveText("Parz. nuvoloso");
  await expect(page.getByTestId("previsione").locator(".giorno")).toHaveCount(4);
  const stanze = page.getByTestId("stanza");
  await expect(stanze).toHaveCount(2);
  await expect(stanze.nth(0)).toContainText("Soggiorno");
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(stanze.nth(0).getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(stanze.nth(1).getByTestId("stanza-percepita")).toHaveText("25,6°");

  // un cambio in HA arriva in push (differenza "c", come HA vero)...
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "24.2" });
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("24,2°");
  // ...e NON cancella le altre entità (bug della v0.1.0 sul tablet vero)
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "25.3" });
  await expect(stanze.nth(1).getByTestId("stanza-temp")).toHaveText("25,3°");
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("24,2°");
  await expect(stanze.nth(0).getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(stanze.nth(1).getByTestId("stanza-percepita")).toHaveText("25,6°");
  await expect(page.getByText("non trovato")).toHaveCount(0);
  await apriDiagnostica(page);
  await expect(page.getByTestId("entita-ricevute")).toHaveText("9");
  await page.getByTestId("chiudi-diagnostica").click();

  // ricaricando non si rifà il login
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  expect((await info(request)).login).toBe(1);
});

test("HA che cade e torna: banner dopo 10 s, valori non aggiornati, poi risincronizzazione completa", async ({
  page,
  request,
}) => {
  await accedi(page);
  const stanze = page.getByTestId("stanza");
  await expect(stanze.nth(1)).toContainText("43%");

  await comando(request, "spegni");
  await expect(pallino(page)).toHaveAttribute("data-stato", "riconnessione", { timeout: 5000 });
  // nei primi secondi niente banner: una riconnessione breve non deve far lampeggiare niente
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("banner")).toContainText("valori non aggiornati");
  await expect(stanze.nth(0)).toContainText("Valori non aggiornati");
  await expect(pallino(page)).toContainText("Offline");

  // mentre HA è giù: un valore cambia e un sensore viene cancellato
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "27.3" });
  await comando(request, "rimuovi?entity_id=sensor.meter_letto_umidita");
  await comando(request, "accendi");

  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 45_000 });
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("27,3°");
  // il sensore cancellato NON resta come "fantasma" col vecchio valore
  await expect(stanze.nth(1)).toContainText("Sensore non trovato: sensor.meter_letto_umidita");
  await expect(stanze.nth(1)).not.toContainText("43%");

  // dopo la riconnessione, un piccolo aggiornamento NON deve cancellare il resto
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "24.8" });
  await expect(stanze.nth(1).getByTestId("stanza-temp")).toHaveText("24,8°");
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("27,3°");
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");

  await apriDiagnostica(page);
  await expect(page.getByTestId("riconnessioni")).toHaveText("1");
  await expect(page.getByTestId("log")).toContainText("Connessione a Home Assistant persa");
});

test("indirizzo lento (1,5 s a richiesta): dopo il primo caricamento l'app si apre dalla cache", async ({
  page,
  request,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  const primaDellaRicarica = (await info(request)).richieste;

  await comando(request, "latenza?ms=1500");
  const inizio = Date.now();
  await page.reload();
  await expect(page.getByTestId("ora")).toBeVisible();
  const apertura = Date.now() - inizio;
  expect(apertura, `app aperta in ${apertura} ms nonostante 1,5 s di latenza`).toBeLessThan(1500);

  // nessun file dell'app è stato richiesto di nuovo al server
  const dopo = (await info(request)).richieste;
  for (const [file, n] of Object.entries(dopo)) {
    if (file !== "sw.js") expect(n, `richieste per ${file}`).toBe(primaDellaRicarica[file]);
  }

  // e il WebSocket, anche lento, porta i dati
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 30_000 });
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°", { timeout: 20_000 });
});

test("HA spento all'avvio: l'app si apre lo stesso dalla cache e dice che manca HA", async ({
  page,
  request,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  await comando(request, "spegni");
  await page.reload();
  await expect(page.getByTestId("ora")).toBeVisible();
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("meteo-temp")).toHaveCount(0);
  await comando(request, "accendi");
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 45_000 });
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
});

test("entità mancanti: il riquadro lo dice, il resto funziona, l'errore finisce nel log", async ({
  page,
  request,
}) => {
  await comando(request, "rimuovi?entity_id=weather.forecast_casa");
  await comando(request, "rimuovi?entity_id=sensor.jarvis_temperatura_percepita_camera");
  await accedi(page);

  await expect(page.getByText("Meteo non disponibile (weather.forecast_casa non trovato)")).toBeVisible();
  const stanze = page.getByTestId("stanza");
  await expect(stanze.nth(0).getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(stanze.nth(1)).toContainText(
    "Sensore non trovato: sensor.jarvis_temperatura_percepita_camera",
  );
  await expect(stanze.nth(1).getByTestId("stanza-temp")).toHaveText("25,1°");

  // un'entità che ricompare torna visibile senza ricaricare
  await comando(request, "stato", {
    entity_id: "weather.forecast_casa",
    state: "rainy",
    attributes: { temperature: 17.8, cloud_coverage: 95 },
  });
  await expect(page.getByTestId("meteo-temp")).toHaveText("18°");
  await expect(page.getByTestId("meteo-cond")).toHaveText("Pioggia");

  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("Entità meteo non trovata: weather.forecast_casa");
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
  await page.getByTestId("chiudi-diagnostica").click();
  await expect(page.getByTestId("diagnostica")).toHaveCount(0);
});

test("login revocato in HA: il pannello chiede di accedere di nuovo, senza redirect a sorpresa", async ({
  page,
  request,
}) => {
  await accedi(page);
  await comando(request, "revoca");
  await expect(page.getByTestId("accesso")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("accesso")).toContainText("accedi di nuovo");
  expect(page.url()).toBe(`${HA}/local/jarvis/index.html`);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
});

test("come su HA vero: la cartella /local/jarvis/ non ha indice e l'app lo sa", async ({ request }) => {
  // Guardia sul finto server: se servisse la cartella, le prove non coprirebbero l'errore reale.
  expect((await request.get(`${HA}/local/jarvis/`)).status()).toBe(403);
  // Il service worker non deve chiedere la cartella, o l'installazione della cache fallisce tutta.
  const sw = await (await request.get(`${HA}/local/jarvis/sw.js`)).text();
  expect(sw).not.toMatch(/"\.\/"\s*[,\]]/);
  expect(sw).toContain('"./index.html"');
});

test("aggiornamento controllato: la versione nuova si scarica ma si applica solo su comando", async ({
  page,
  request,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  await apriDiagnostica(page);
  await expect(page.getByTestId("aggiornamento")).toHaveText("nessuno");

  await comando(request, "nuova-versione");
  // il pannello controlla da solo ogni 6 ore; qui lo si fa subito
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);

  // scaricata ma NON attiva: niente ricariche a sorpresa mentre il pannello è in uso
  await expect(page.getByTestId("aggiornamento")).toHaveText("pronto (si applica alle 04:00)");
  const controlloreVecchio = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  expect(controlloreVecchio).toBeTruthy();

  await page.getByRole("button", { name: "Aggiorna ora" }).click();
  await page.waitForLoadState("load");
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  const inAttesa = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.waiting,
  );
  expect(inAttesa).toBeNull();
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
});

test("aggiornamento come sul tablet: ricarica su indirizzo lento, diagnostica aperta subito", async ({
  page,
  request,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  await comando(request, "nuova-versione");
  await comando(request, "latenza?ms=1500");
  await page.reload();
  await expect(page.getByTestId("ora")).toBeVisible();
  await apriDiagnostica(page);
  // la versione nuova si scarica in qualche secondo: la diagnostica aperta deve accorgersene da sola
  await expect(page.getByTestId("aggiornamento")).toHaveText("pronto (si applica alle 04:00)", {
    timeout: 45_000,
  });
});
