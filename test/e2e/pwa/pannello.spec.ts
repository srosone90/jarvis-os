import { expect, test } from "@playwright/test";
import { HA, accedi, apriDiagnostica, aspettaServiceWorker, comando, info, pallino } from "../aiuti";

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
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
