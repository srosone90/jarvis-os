import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "./aiuti";

/**
 * v0.5.9: la musica parte dal dispositivo da cui la chiedi (jarvis_musica
 * 0.5.0). Il finto HA fa `dispositivi`, `imposta_pannello`, `riproduci` /
 * `controllo` con `pannello` e `dispositivo` (errore `dispositivo_assente`
 * se Spotify non lo vede) e un Spotify finto in cui un dispositivo compare
 * dopo N secondi (`/__prova/spotify-compare`), come quando si apre l'app.
 * Problema reale del 02/10: dal Redmi una playlist era partita dall'Echo della
 * cucina.
 */

const ECHO = ["Echo Pop cucina", "echo Pop camera da letto", "Tutta la casa", "Ovunque"];
const PLAYLIST = [
  { nome: "Rock", uri: "spotify:playlist:rock", copertina: null, proprietario: "Salvatore" },
  { nome: "Jazz", uri: "spotify:playlist:jazz", copertina: null, proprietario: "Spotify" },
];
const ferma = {
  stato: "niente",
  titolo: "",
  stanza: "",
  volume: null,
  playlist: PLAYLIST,
};
const ASSENTE = "Su Spotify non vedo «Redmi Note 13»: apri l'app Spotify su quel dispositivo e riprova.";

/** Le chiamate a jarvis_musica che cambiano qualcosa (non le letture). */
async function scritture(request: APIRequestContext): Promise<string[]> {
  return (await info(request)).chiamate
    .filter((c) => /^jarvis_musica\.(riproduci|controllo|imposta_pannello)$/.test(c.servizio))
    .map((c) => `${c.servizio.replace("jarvis_musica.", "")} ${JSON.stringify(c.dati)}`);
}

async function inCucina(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
}

/** Il pannello va in secondo piano (si apre Spotify) e torna. */
async function esciETorna(page: Page): Promise<void> {
  await page.evaluate(() => {
    const vai = (v: string) => {
      Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    vai("hidden");
    vai("visible");
  });
}

/** Tocco su «Collega»: aspetta che l'elenco di prima sia letto (poi i dispositivi possono comparire). */
async function collega(page: Page, dove: Page | ReturnType<Page["getByTestId"]> = page): Promise<void> {
  await dove.getByTestId("collega-spotify").click();
  await expect(page.getByTestId("collega-esito").first()).toContainText("Apro Spotify");
}

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
  await comando(request, "musica", ferma);
});

test("prima playlist senza scelta: «Dove la suono?», ricordato per il pannello; poi suona lì senza chiedere", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await expect(page.getByTestId("musica-dispositivo")).toContainText("Ogni volta ti chiedo dove suonare");
  await page.getByTestId("playlist-riproduci").first().click();
  const dove = page.getByTestId("dove-la-suono");
  await expect(dove).toBeVisible();
  await expect(dove.getByTestId("dove-dispositivo")).toHaveText(ECHO.map((n) => new RegExp(n)));
  await expect(dove.getByTestId("dove-ricorda")).toBeChecked();
  await expect(dove.getByTestId("collega-spotify")).toHaveText(/Collega questo dispositivo/);
  // niente parte finché non si sceglie
  expect(await scritture(request)).toEqual([]);
  await dove.getByTestId("dove-dispositivo").filter({ hasText: "echo Pop camera da letto" }).click();
  await expect(dove).toHaveCount(0);
  await expect
    .poll(() => scritture(request))
    .toEqual([
      'imposta_pannello {"pannello":"jarvis_cucina","dispositivo":"echo Pop camera da letto"}',
      'riproduci {"cosa":"spotify:playlist:rock","pannello":"jarvis_cucina","dispositivo":"echo Pop camera da letto"}',
    ]);
  await expect(page.getByTestId("musica-dispositivo")).toContainText(
    "Questo pannello suona su echo Pop camera da letto",
  );
  // la seconda volta non chiede: il dispositivo salvato
  await page.getByTestId("playlist-riproduci").nth(1).click();
  await expect
    .poll(async () => (await scritture(request)).at(-1))
    .toBe(
      'riproduci {"cosa":"spotify:playlist:jazz","pannello":"jarvis_cucina","dispositivo":"echo Pop camera da letto"}',
    );
  await expect(page.getByTestId("dove-la-suono")).toHaveCount(0);
  // i comandi dicono anche chi chiede
  await page.getByTestId("musica-play").click();
  await expect
    .poll(async () => (await scritture(request)).at(-1))
    .toBe('controllo {"azione":"pausa","pannello":"jarvis_cucina","dispositivo":"echo Pop camera da letto"}');
});

test("controprove: «Ricorda» tolto → nessun salvataggio e la volta dopo richiede; Annulla non suona niente", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await page.getByTestId("playlist-riproduci").first().click();
  await page.getByTestId("dove-annulla").click();
  await expect(page.getByTestId("dove-la-suono")).toHaveCount(0);
  expect(await scritture(request)).toEqual([]);
  await page.getByTestId("playlist-riproduci").first().click();
  await page.getByTestId("dove-ricorda").uncheck();
  await page.getByTestId("dove-dispositivo").first().click();
  await expect
    .poll(() => scritture(request))
    .toEqual([
      'riproduci {"cosa":"spotify:playlist:rock","pannello":"jarvis_cucina","dispositivo":"Echo Pop cucina"}',
    ]);
  await page.getByTestId("playlist-riproduci").first().click();
  await expect(page.getByTestId("dove-la-suono")).toBeVisible();
});

test("Impostazioni → Musica: «Questo pannello suona su», salvato con imposta_pannello; «Chiedi ogni volta» lo cancella", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await accedi(page);
  await apriImpostazioni(page);
  await page.getByTestId("sezione-musica").click();
  const campo = page.getByTestId("campo-musica-dispositivo");
  await expect(campo).toHaveValue("");
  await expect(campo.locator("option")).toHaveText([
    "Chiedi ogni volta",
    ...ECHO.map((n) => `${n} (Speaker)`),
  ]);
  await campo.selectOption("Echo Pop cucina");
  await expect
    .poll(async () => (await scritture(request)).at(-1))
    .toBe('imposta_pannello {"pannello":"jarvis_cucina","dispositivo":"Echo Pop cucina"}');
  await expect(campo).toHaveValue("Echo Pop cucina");
  await campo.selectOption("");
  await expect
    .poll(async () => (await scritture(request)).at(-1))
    .toBe('imposta_pannello {"pannello":"jarvis_cucina","dispositivo":""}');
  await expect(page.getByTestId("musica-istruzioni")).toContainText("Installa l'app Spotify");
});

test("Collega questo dispositivo (computer): si apre il sito; il dispositivo compare dopo 3 s → salvato, «Collegato ✓»", async ({
  page,
  request,
  context,
}) => {
  await inCucina(page);
  await accedi(page);
  await apriImpostazioni(page);
  await page.getByTestId("sezione-musica").click();
  // senza rete: il sito di Spotify è una pagina vuota servita qui
  await context.route("https://open.spotify.com/**", (r) => r.fulfill({ body: "<title>Spotify</title>" }));
  const scheda = context.waitForEvent("page");
  await collega(page);
  expect((await scheda).url()).toContain("open.spotify.com");
  await comando(request, "spotify-compare", {
    dispositivi: [{ nome: "Web Player (Chrome)", tipo: "Computer" }],
    dopoMs: 3000,
  });
  // il pannello non va in secondo piano (nuova scheda): cerca lo stesso dopo 5 s
  await expect(page.getByTestId("collega-esito")).toHaveText(/Collegato: Web Player \(Chrome\)/, {
    timeout: 10_000,
  });
  expect(await scritture(request)).toEqual([
    'imposta_pannello {"pannello":"jarvis_cucina","dispositivo":"Web Player (Chrome)"}',
  ]);
  await expect(page.getByTestId("campo-musica-dispositivo")).toHaveValue("Web Player (Chrome)");
  // mai password o token del pannello verso Spotify: solo i servizi di jarvis_musica
  const servizi = new Set((await info(request)).chiamate.map((c) => c.servizio.split(".")[0]));
  expect([...servizi].filter((s) => s !== "jarvis_musica" && s !== "jarvis_voce")).toEqual([]);
});

test("Collega: due dispositivi nuovi insieme → si sceglie; in «Dove la suono?» poi parte lì", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await page.getByTestId("playlist-riproduci").first().click();
  await collega(page, page.getByTestId("dove-la-suono"));
  await comando(request, "spotify-compare", {
    dispositivi: [
      { nome: "Redmi Note 13", tipo: "Smartphone" },
      { nome: "Tablet cucina", tipo: "Tablet" },
    ],
    dopoMs: 0,
  });
  await esciETorna(page);
  await expect(page.getByTestId("collega-scegli")).toHaveText([/Redmi Note 13/, /Tablet cucina/]);
  await page.getByTestId("collega-scegli").filter({ hasText: "Tablet cucina" }).click();
  await expect(page.getByTestId("dove-la-suono")).toHaveCount(0);
  await expect
    .poll(() => scritture(request))
    .toEqual([
      'imposta_pannello {"pannello":"jarvis_cucina","dispositivo":"Tablet cucina"}',
      'riproduci {"cosa":"spotify:playlist:rock","pannello":"jarvis_cucina","dispositivo":"Tablet cucina"}',
    ]);
});

test("Collega: non compare in 60 s → «Non vedo ancora questo dispositivo», niente salvato", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await page.clock.install();
  await accedi(page);
  await apriImpostazioni(page);
  await page.getByTestId("sezione-musica").click();
  await page.getByTestId("collega-spotify").click();
  await esciETorna(page);
  await expect(page.getByTestId("collega-esito")).toContainText("Cerco questo dispositivo");
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId("collega-esito")).toContainText(
    "Non vedo ancora questo dispositivo su Spotify: controlla di aver fatto il login con lo stesso account e riprova",
  );
  expect(await scritture(request)).toEqual([]);
});

test("dispositivo salvato sparito (Android ha chiuso Spotify): errore in chiaro col nome, niente Echo; «Ricollega» lo ritrova", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await comando(request, "musica-pannello", { pannello: "jarvis_cucina", dispositivo: "Redmi Note 13" });
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await expect(page.getByTestId("musica-dispositivo")).toContainText("Su Spotify non vedo Redmi Note 13");
  await page.getByTestId("playlist-riproduci").first().click();
  await expect(page.getByTestId("avviso").filter({ hasText: ASSENTE })).toBeVisible();
  // il finto HA non ha fatto partire niente da nessuna parte
  await expect(page.getByTestId("musica-niente")).toBeVisible();
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page);
  await page.getByTestId("sezione-musica").click();
  await expect(page.getByTestId("musica-dispositivo-sparito")).toContainText("Redmi Note 13");
  const tasto = page.getByTestId("collega-spotify");
  await expect(tasto).toHaveText(/Ricollega Redmi Note 13/);
  await collega(page);
  await comando(request, "spotify-compare", {
    dispositivi: [
      { nome: "PC di Salvatore", tipo: "Computer" },
      { nome: "Redmi Note 13", tipo: "Smartphone" },
    ],
    dopoMs: 0,
  });
  await esciETorna(page);
  // riconosciuto per nome anche se insieme a un altro nuovo
  await expect(page.getByTestId("collega-esito")).toHaveText(/Collegato: Redmi Note 13/);
  await expect(tasto).toHaveText(/Collega questo dispositivo/);
  await expect(page.getByTestId("musica-dispositivo-sparito")).toHaveCount(0);
});

test("controprova: jarvis_musica vecchio (senza dispositivi) → la playlist parte come prima, la sezione lo dice", async ({
  page,
  request,
}) => {
  await inCucina(page);
  await comando(request, "musica", { ...ferma, versione: "0.4.0" });
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await page.getByTestId("playlist-riproduci").first().click();
  await expect(page.getByTestId("dove-la-suono")).toHaveCount(0);
  await expect
    .poll(() => scritture(request))
    .toEqual(['riproduci {"cosa":"spotify:playlist:rock","pannello":"jarvis_cucina"}']);
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page);
  await page.getByTestId("sezione-musica").click();
  await expect(page.getByTestId("musica-dispositivi-problema")).toContainText("Serve jarvis_musica 0.5.0");
});

test.describe("Android", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Redmi Note 13) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36",
  });
  test("Collega su Android: intent verso l'app Spotify (ripiego Play Store), il pannello resta qui e riconosce il Redmi", async ({
    page,
    request,
  }) => {
    await inCucina(page);
    await accedi(page);
    await apriImpostazioni(page);
    await page.getByTestId("sezione-musica").click();
    const prima = page.url();
    await collega(page);
    await comando(request, "spotify-compare", {
      dispositivi: [{ nome: "Redmi Note 13", tipo: "Smartphone" }],
      dopoMs: 0,
    });
    await esciETorna(page);
    await expect(page.getByTestId("collega-esito")).toHaveText(/Collegato: Redmi Note 13/);
    expect(page.url()).toBe(prima);
    expect((await scritture(request)).at(-1)).toBe(
      'imposta_pannello {"pannello":"jarvis_cucina","dispositivo":"Redmi Note 13"}',
    );
  });
});
