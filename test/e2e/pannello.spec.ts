import { expect, test } from "@playwright/test";
import { HA, accedi, apriDiagnostica, aspettaServiceWorker, comando, info, pallino, stanza } from "./aiuti";

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
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(soggiorno).toContainText("Soggiorno");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(soggiorno.getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(camera.getByTestId("stanza-percepita")).toHaveText("25,6°");

  // un cambio in HA arriva in push (differenza "c", come HA vero)...
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "24.2" });
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("24,2°");
  // ...e NON cancella le altre entità (bug della v0.1.0 sul tablet vero)
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "25.3" });
  await expect(camera.getByTestId("stanza-temp")).toHaveText("25,3°");
  await expect(page.getByTestId("meteo-temp")).toHaveText("22°");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("24,2°");
  await expect(soggiorno.getByTestId("stanza-percepita")).toHaveText("26,5°");
  await expect(camera.getByTestId("stanza-percepita")).toHaveText("25,6°");
  await expect(page.getByText("non trovato")).toHaveCount(0);
  await apriDiagnostica(page);
  // 17 della casa + 12 del pacchetto annunci (v0.5.4)
  await expect(page.getByTestId("entita-ricevute")).toHaveText("29");
  await page.getByTestId("chiudi-impostazioni").click();

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
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(camera).toContainText("43%");

  await comando(request, "spegni");
  await expect(pallino(page)).toHaveAttribute("data-stato", "riconnessione", { timeout: 5000 });
  // nei primi secondi niente banner: una riconnessione breve non deve far lampeggiare niente
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("banner")).toContainText("valori non aggiornati");
  // valori della stanza in arancione (il banner lo dice a parole)
  await expect(soggiorno.locator(".clima.non-aggiornato")).toBeVisible();
  await expect(pallino(page)).toContainText("Offline");

  // mentre HA è giù: un valore cambia e un sensore viene cancellato
  await comando(request, "stato", { entity_id: "sensor.meter_salone_temperatura", state: "27.3" });
  await comando(request, "rimuovi?entity_id=sensor.meter_letto_umidita");
  await comando(request, "accendi");

  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 45_000 });
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("27,3°");
  // il sensore cancellato NON resta come "fantasma" col vecchio valore
  await expect(camera).toContainText("Sensore non trovato: sensor.meter_letto_umidita");
  await expect(camera).not.toContainText("43%");

  // dopo la riconnessione, un piccolo aggiornamento NON deve cancellare il resto
  await comando(request, "stato", { entity_id: "sensor.meter_letto_temperatura", state: "24.8" });
  await expect(camera.getByTestId("stanza-temp")).toHaveText("24,8°");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("27,3°");
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
  const soggiorno = stanza(page, "Soggiorno");
  const camera = stanza(page, "Camera da letto");
  await expect(soggiorno.getByTestId("stanza-temp")).toHaveText("25,7°");
  await expect(camera).toContainText("Sensore non trovato: sensor.jarvis_temperatura_percepita_camera");
  await expect(camera.getByTestId("stanza-temp")).toHaveText("25,1°");

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
  await page.getByTestId("chiudi-impostazioni").click();
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

test("layout del mockup approvato: zone delle fasi future presenti ma dichiarate non attive", async ({
  page,
  request,
}) => {
  await accedi(page);
  // stanze tutte insieme, con il clima nell'intestazione
  await expect(page.getByTestId("stanza")).toHaveCount(3);
  await expect(stanza(page, "Veranda")).toBeVisible();
  await expect(stanza(page, "Soggiorno").getByTestId("stanza-temp")).toHaveText("25,7°");
  // zone future (scene F3): si vedono, dicono "in arrivo" e non contengono niente di toccabile
  const scene = page.getByTestId("zona-scene");
  await expect(scene).toContainText("Buonanotte");
  await expect(scene).toContainText("in arrivo");
  await expect(scene.locator("button, input, a, [role=button]")).toHaveCount(0);
  // barra: assistente testuale (F4) e microfono (F5), entrambi attivi
  const assistente = page.getByTestId("zona-assistente");
  await expect(assistente.locator("button, input, a, [role=button]")).toHaveCount(2);
  await expect(assistente.getByRole("button", { name: "Chiedi a Jarvis…" })).toBeEnabled();
  await expect(assistente.getByRole("button", { name: "Parla con Jarvis" })).toBeEnabled();
  // niente esce dallo schermo del tablet (1024×600), card comprese
  await expect(page.locator("[data-test^=card-]").first()).toBeVisible();
  expect(await sbordati(page)).toEqual([]);
  // i testi dei pulsanti delle modalità non vengono tagliati
  const tagliati = await page
    .locator("jarvis-card-clima .comandi button")
    .evaluateAll((bottoni) =>
      bottoni.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent?.trim()),
    );
  expect(tagliati).toEqual([]);

  // caso peggiore: TV accesa (riga del volume in più nel Soggiorno) e poi offline,
  // con le righe "non aggiornato" in più: niente deve sbordare
  await page.getByTestId("card-media").locator("button.principale").click();
  await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible();
  expect(await sbordati(page)).toEqual([]);
  await comando(request, "spegni");
  await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
  expect(await sbordati(page)).toEqual([]);
});

/**
 * Elementi che escono dallo schermo o dal riquadro della propria stanza
 * (per esempio una card che finisce sotto la barra dell'assistente).
 */
async function sbordati(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const fuori: string[] = [];
    const guarda = (radice: Document | ShadowRoot, contenitore: DOMRect | null): void => {
      for (const e of radice.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        const fuoriSchermo = r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
        const fuoriStanza = contenitore !== null && r.bottom > contenitore.bottom + 1;
        if (fuoriSchermo || fuoriStanza) fuori.push(`${e.localName}.${String(e.className)}`);
        const stanza = e.localName === "jarvis-stanza" ? r : contenitore;
        if (e.shadowRoot) guarda(e.shadowRoot, stanza);
      }
    };
    guarda(document, null);
    return fuori;
  });
}

test("mai su una versione vecchia: all'avvio, prima di qualsiasi tocco, la versione in attesa si applica", async ({
  page,
  request,
}) => {
  await accedi(page);
  await aspettaServiceWorker(page);
  await comando(request, "nuova-versione?versione=9.9.9");
  // riapertura del pannello (come il tablet che si riavvia): nessuno tocca niente
  await page.reload();
  // la pagina si ricarica da sola: le letture durante la navigazione si ritentano
  const leggi = <T>(f: () => Promise<T> | T, riserva: T) => page.evaluate(f).catch(() => riserva);
  await expect
    .poll(() => leggi(() => localStorage.getItem("jarvis-log") ?? "", ""), { timeout: 20_000 })
    .toContain("la applico subito, nessuno ha ancora toccato il pannello");
  await expect
    .poll(
      () =>
        leggi(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg?.waiting === null && navigator.serviceWorker.controller !== null;
        }, false),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  // una volta sola: niente giri di ricariche
  const ricariche = await page.evaluate(
    () => (localStorage.getItem("jarvis-log") ?? "").split("la applico subito").length - 1,
  );
  await page.waitForTimeout(3000);
  expect(
    await page.evaluate(
      () => (localStorage.getItem("jarvis-log") ?? "").split("la applico subito").length - 1,
    ),
  ).toBe(ricariche);
  await apriDiagnostica(page);
  await expect(page.getByTestId("versione-server")).toHaveText("9.9.9");
});
