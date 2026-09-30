import { readdirSync } from "node:fs";
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
  // ogni serie e ogni conteggio dicono se il verificatore era acceso (confronto prima/dopo)
  expect(risultati).toContain(
    "Serie «Jarvis» da solo a 3 m, soglia 0,50, verificatore no: 0/20 riconosciuti",
  );
  expect(risultati).toMatch(/Falsi positivi \(TV\), verificatore no: 0 in \d/);
});

/**
 * Verificatore personale (v0.4.3). Il microfono finto suona un tono: qui si
 * prova la meccanica (inviti, salvataggio locale, addestramento, uso,
 * persistenza, esportazione, cancellazione), non la pronuncia. I numeri del
 * verificatore sono verificati contro scikit-learn (test/unit/verificatore.test.ts).
 */
test("verificatore: registrazione guidata, addestramento e uso, tutto sul telefono", async ({ page }) => {
  // niente deve uscire dal telefono: solo GET dei file della pagina
  const uscite: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() !== "GET" || !u.pathname.startsWith("/local/jarvis/"))
      uscite.push(`${r.method()} ${r.url()}`);
  });
  const errori: string[] = [];
  page.on("pageerror", (e) => errori.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto("./prova-ehi-jarvis.html");
  await expect(page.getByTestId("esempi")).toContainText("Nessun esempio registrato.");

  // senza nome non parte: serve a distinguere le voci di casa
  await page.getByRole("button", { name: "Registra «Ehi Jarvis»" }).click();
  await expect(page.getByTestId("stato")).toContainText("Scrivi prima chi parla");

  await page.getByTestId("persona").fill("Prova");
  await page.getByTestId("quanti").fill("3");
  await page.getByRole("button", { name: "Registra «Ehi Jarvis»" }).click();
  // l'ascolto parte da solo, poi gli inviti uno alla volta
  await expect(page.getByTestId("invito")).toContainText("Di' «Ehi Jarvis» adesso · 1/3", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("invito")).toContainText("adesso · 3/3", { timeout: 15_000 });
  await expect(page.getByTestId("registro")).toContainText("Registrazione finita: 3 esempi di Prova", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("invito")).toBeHidden();
  await expect(page.getByTestId("esempi")).toContainText("Prova");
  await expect(page.getByTestId("esempi")).toContainText("3 esempi");
  // soglia base: nessuno l'ha scelta, quindi la consigliata dai loro esempi (il tono dà ~0 → 0,005)
  await expect(page.getByTestId("soglia-base")).toHaveValue("0.005");
  await expect(page.getByTestId("consiglio-soglia-base")).toContainText("già impostata");
  // durante la registrazione non si contano attivazioni
  await expect(page.getByTestId("attivazioni")).toHaveText("0");

  await page.getByTestId("secondi-normale").fill("5");
  await page.getByRole("button", { name: "Registra parlato normale" }).click();
  await expect(page.getByTestId("invito")).toContainText("mancano");
  await expect(page.getByTestId("registro")).toContainText("Parlato normale salvato", { timeout: 15_000 });
  await expect(page.getByTestId("registro")).toContainText("solo numeri, niente audio");
  await expect(page.getByTestId("esempi")).toContainText("Parlato normale");

  await page.getByRole("button", { name: "Addestra il verificatore" }).click();
  await expect(page.getByTestId("registro")).toContainText("Verificatore addestrato", { timeout: 30_000 });
  await expect(page.getByTestId("stato-verificatore")).toContainText("addestrato su questo telefono");
  await expect(page.getByTestId("stato-verificatore")).toContainText("(Prova)");
  await expect(page.getByTestId("usa-verificatore")).toBeChecked();
  await expect(page.getByTestId("punteggio-base")).toBeVisible();
  await expect(page.getByTestId("punteggio-base")).toContainText("Modello base");

  // le serie dicono se il verificatore era acceso: il confronto prima/dopo esce dai risultati
  await page.getByRole("button", { name: "Inizia serie" }).click();
  await page.getByRole("button", { name: "Fine serie" }).click();
  await page.getByTestId("usa-verificatore").uncheck();
  await page.getByRole("button", { name: "Inizia serie" }).click();
  await page.getByRole("button", { name: "Fine serie" }).click();
  const risultati = await page.getByTestId("risultati").inputValue();
  expect(risultati).toContain("verificatore sì (soglia base 0,005)");
  expect(risultati).toContain("verificatore no:");
  expect(risultati).toMatch(
    /Verificatore: spento, addestrato su questo telefono: \d+ esempi della parola \(Prova\)/,
  );
  expect(risultati).toContain("Esempi di Prova: 3");
  expect(risultati).toContain("Impostazioni: valori predefiniti (parola.json assente)");

  // esportazione: solo i pesi, niente audio né esempi
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Esporta" }).click(),
  ]);
  const esportato = JSON.parse(
    await (await download.createReadStream()).toArray().then((p) => Buffer.concat(p).toString()),
  );
  expect(esportato.pesi).toHaveLength(1536);
  expect(Object.keys(esportato).sort()).toEqual([
    "info",
    "intercetta",
    "media",
    "modello",
    "pesi",
    "scala",
    "versione",
  ]);

  // resta dopo una ricarica (IndexedDB del telefono)
  await page.reload();
  await expect(page.getByTestId("stato-verificatore")).toContainText("addestrato su questo telefono");
  await expect(page.getByTestId("esempi")).toContainText("3 esempi");

  // cancellazione: esempi e verificatore spariscono davvero, anche dopo una ricarica
  await page.getByRole("button", { name: "Cancella esempi e verificatore" }).click();
  await expect(page.getByTestId("stato-verificatore")).toHaveText("Nessun verificatore.");
  await expect(page.getByTestId("esempi")).toContainText("Nessun esempio registrato.");
  await page.reload();
  await expect(page.getByTestId("esempi")).toContainText("Nessun esempio registrato.");
  await expect(page.getByTestId("usa-verificatore")).toBeDisabled();

  // importazione di quello esportato; un file sbagliato è rifiutato e lo si dice
  await page.getByTestId("importa").setInputFiles({
    name: "verificatore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(esportato)),
  });
  await expect(page.getByTestId("stato-verificatore")).toContainText("importato da verificatore.json");
  await page.getByTestId("importa").setInputFiles({
    name: "rotto.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"pesi":[1,2]}'),
  });
  await expect(page.getByTestId("registro")).toContainText("Importazione non riuscita");

  expect(uscite).toEqual([]);
  expect(errori).toEqual([]);
});

test("verificatore: fermare l'ascolto a metà registrazione la annulla e lo dice", async ({ page }) => {
  await page.goto("./prova-ehi-jarvis.html");
  await page.getByTestId("persona").fill("Prova");
  await page.getByTestId("quanti").fill("5");
  await page.getByRole("button", { name: "Registra «Ehi Jarvis»" }).click();
  await expect(page.getByTestId("invito")).toContainText("adesso · 1/5", { timeout: 20_000 });
  await page.getByRole("button", { name: "Ferma" }).click();
  await expect(page.getByTestId("registro")).toContainText("Registrazione interrotta (tocco)");
  await expect(page.getByTestId("invito")).toBeHidden();
  await expect(page.getByRole("button", { name: "Registra «Ehi Jarvis»" })).toBeEnabled();
});

test("parola.json: soglie e modello cambiano senza release; se è scritto male si dice", async ({
  page,
  request,
}) => {
  const classificatore = readdirSync("dist/prova").find((f) => f.startsWith("hey_jarvis"));
  await comando(request, "file", {
    nome: "parola.json",
    contenuto: JSON.stringify({
      modello: {
        id: "jarvis_casa",
        url: `./prova/${classificatore}`,
        parola: "Jarvis",
        licenza: "CC BY-NC-SA 4.0",
        commerciale: false,
      },
      soglia: 0.35,
      sogliaBase: 0.05,
      colore: "blu",
    }),
  });
  await page.goto("./prova-ehi-jarvis.html");
  await expect(page.getByTestId("soglia")).toHaveText("0,35");
  await expect(page.getByTestId("soglia-base")).toHaveValue("0.05");
  // scelta da parola.json: non la si cambia da soli
  await expect(page.locator("h1")).toHaveText("Prova «Jarvis»");
  await expect(page.getByTestId("licenza")).toContainText("jarvis_casa");
  await expect(page.getByTestId("registro")).toContainText("chiavi sconosciute ignorate: colore");
  await page.getByRole("button", { name: "Avvia l'ascolto" }).click();
  await expect(page.getByTestId("stato")).toContainText("In ascolto. Di' «Jarvis»", { timeout: 20_000 });
  await expect(page.getByTestId("registro")).toContainText("Modello jarvis_casa caricato");
  expect(await page.getByTestId("risultati").inputValue()).toContain(
    "Impostazioni: parola.json (modello jarvis_casa, soglia 0,35, soglia base 0,050), 1 avvisi nel registro",
  );

  await comando(request, "file", { nome: "parola.json", contenuto: "{ non è json" });
  await page.reload();
  await expect(page.getByTestId("registro")).toContainText("parola.json non è un JSON valido");
  await expect(page.getByTestId("soglia")).toHaveText("0,50");
});

test("il verificatore decide davvero: uno che dice sempre sì fa scattare, spento no", async ({
  page,
  request,
}) => {
  // soglia base minuscola: il verificatore viene consultato anche col tono del microfono finto
  await comando(request, "file", {
    nome: "parola.json",
    contenuto: JSON.stringify({ sogliaBase: 0.000001 }),
  });
  const sempreSi = {
    versione: 1,
    modello: "hey_jarvis_v0.1",
    media: new Array(1536).fill(0),
    scala: new Array(1536).fill(1),
    pesi: new Array(1536).fill(0),
    intercetta: 20,
    info: { positivi: 1, negativi: 1, persone: ["Prova"], creato: "", iterazioni: 0, accuratezza: 1 },
  };
  await page.goto("./prova-ehi-jarvis.html");
  await page.getByTestId("importa").setInputFiles({
    name: "sempre-si.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(sempreSi)),
  });
  await expect(page.getByTestId("usa-verificatore")).toBeChecked();
  await page.getByRole("button", { name: "Avvia l'ascolto" }).click();
  await expect(page.getByTestId("registro")).toContainText("ATTIVAZIONE", { timeout: 20_000 });
  await expect(page.getByTestId("registro")).toContainText("dal verificatore; modello base");
  await expect(page.getByTestId("punteggio-base")).toContainText("deciso dal verificatore");

  // spento: il tono resta sotto la soglia, niente più attivazioni
  await page.getByTestId("usa-verificatore").uncheck();
  const prima = Number(await page.getByTestId("attivazioni").textContent());
  await page.waitForTimeout(3000);
  expect(Number(await page.getByTestId("attivazioni").textContent())).toBe(prima);
});
