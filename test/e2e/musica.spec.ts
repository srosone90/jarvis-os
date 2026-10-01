import { expect, test, type APIRequestContext } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info } from "./aiuti";

/**
 * Musica M1 + mini-lettore (v0.5.6). Il finto HA fa jarvis_musica 0.4.0:
 * stato con copertina e posizione, controllo (anche successivo, alza, sposta),
 * playlist e riproduci con l'uri.
 */

const copertina =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#7a3"/></svg>',
  );

const suonaInCucina = {
  stato: "in_riproduzione",
  titolo: "Bohemian Rhapsody",
  artisti: "Queen",
  dispositivo: "Echo Cucina",
  stanza: "Cucina",
  volume: 30,
  copertina,
  posizione_ms: 60_000,
  durata_ms: 354_000,
  playlist: [
    { nome: "Rock", uri: "spotify:playlist:rock", copertina, proprietario: "Salvatore" },
    { nome: "Jazz", uri: "spotify:playlist:jazz", copertina: null, proprietario: "Spotify" },
    { nome: "Lo-fi", uri: "spotify:playlist:lofi", copertina: null, proprietario: null },
  ],
};

async function musica(request: APIRequestContext, m: Record<string, unknown> | null): Promise<void> {
  await comando(request, "musica", m);
}

/** I comandi dati dal pannello (le letture di stato e playlist no). */
async function comandi(request: APIRequestContext): Promise<string[]> {
  return (await info(request)).chiamate
    .filter((c) => c.servizio === "jarvis_musica.controllo" || c.servizio === "jarvis_musica.riproduci")
    .map((c) => `${c.servizio.replace("jarvis_musica.", "")} ${JSON.stringify(c.dati)}`);
}

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("schermata Musica: brano vero, avanzamento che scorre, comandi confermati da Spotify", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  await page.getByTestId("colonna-musica").click();
  await expect(page.getByTestId("pagina-musica")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#musica");
  await expect(page.getByTestId("musica-titolo")).toHaveText("Bohemian Rhapsody");
  await expect(page.getByTestId("musica-lettore")).toContainText("Queen");
  await expect(page.getByTestId("musica-dove")).toHaveText("Suona su Echo Cucina · Cucina");
  await expect(page.getByTestId("musica-volume")).toHaveText("30%");
  // la barra scorre in locale tra una lettura e l'altra
  await expect(page.getByTestId("musica-posizione")).toHaveText(/^1:0[0-2]$/);
  await expect(page.getByTestId("musica-posizione")).toHaveText(/^1:0[3-6]$/, { timeout: 6000 });

  await page.getByTestId("musica-successivo").click();
  await expect(page.getByTestId("musica-titolo")).toHaveText("Don't Stop Me Now");
  await page.getByTestId("musica-alza").click();
  await expect(page.getByTestId("musica-volume")).toHaveText("40%");
  await page.getByTestId("musica-play").click();
  await expect(page.getByTestId("musica-dove")).toHaveText("In pausa su Echo Cucina · Cucina");
  await expect(page.getByTestId("musica-play")).toHaveAttribute("aria-label", "Riprendi");
  // in pausa la barra resta ferma
  const ferma = await page.getByTestId("musica-posizione").textContent();
  await page.waitForTimeout(2200);
  await expect(page.getByTestId("musica-posizione")).toHaveText(ferma ?? "");
  await page.getByTestId("musica-play").click();
  await expect(page.getByTestId("musica-play")).toHaveAttribute("aria-label", "Pausa");
  expect(await comandi(request)).toEqual([
    'controllo {"azione":"successivo"}',
    'controllo {"azione":"alza"}',
    'controllo {"azione":"pausa"}',
    'controllo {"azione":"riprendi"}',
  ]);
});

test("sposta la musica: le stanze di Home Assistant, quella dove suona è segnata", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  await page.goto("./index.html#musica");
  const stanze = page.getByTestId("musica-stanza");
  await expect(stanze).toHaveText(["Camera da letto", "Cucina", "Soggiorno", "Veranda"]);
  await expect(stanze.filter({ hasText: "Cucina" })).toHaveAttribute("aria-pressed", "true");
  await expect(stanze.filter({ hasText: "Cucina" })).toBeDisabled();
  await stanze.filter({ hasText: "Camera da letto" }).click();
  await expect(page.getByTestId("musica-dove")).toHaveText("Suona su Echo Camera da letto · Camera da letto");
  await expect(stanze.filter({ hasText: "Camera da letto" })).toHaveAttribute("aria-pressed", "true");
  expect(await comandi(request)).toEqual(['controllo {"azione":"sposta","dove":"Camera da letto"}']);
});

test("stanze scelte nelle impostazioni al posto delle aree di HA; Ripristina torna alle aree", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-musica-stanze").fill("Cucina,  Studio , ");
  await page.getByTestId("campo-musica-stanze").press("Enter");
  await page.getByTestId("campo-musica-stanze").blur();
  await expect(page.getByTestId("ripristina-musica-stanze")).toBeVisible();
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("colonna-musica").click();
  await expect(page.getByTestId("musica-stanza")).toHaveText(["Cucina", "Studio"]);
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("ripristina-musica-stanze").click();
  await expect(page.getByTestId("campo-musica-stanze")).toHaveValue("");
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("colonna-musica").click();
  await expect(page.getByTestId("musica-stanza")).toHaveCount(4);
});

test("playlist: un tocco la fa partire dove suona già; la preferita va in cima e ci resta", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  await page.goto("./index.html#musica");
  const nomi = page.getByTestId("playlist-nome");
  await expect(nomi).toHaveText(["Rock", "Jazz", "Lo-fi"]);
  await nomi.filter({ hasText: "Jazz" }).click();
  await expect(page.getByTestId("musica-titolo")).toHaveText("Primo brano di Jazz");
  expect(await comandi(request)).toEqual(['riproduci {"cosa":"spotify:playlist:jazz","dove":"Cucina"}']);

  await page.getByRole("button", { name: "Preferita: Lo-fi" }).click();
  await expect(nomi).toHaveText(["Lo-fi", "Rock", "Jazz"]);
  await expect(page.getByRole("button", { name: "Preferita: Lo-fi" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByTestId("playlist-nome")).toHaveText(["Lo-fi", "Rock", "Jazz"]);
});

test("se non suona niente si sceglie una playlist; senza jarvis_musica lo si dice", async ({
  page,
  request,
}) => {
  await musica(request, { ...suonaInCucina, stato: "niente", titolo: "" });
  await accedi(page);
  await page.goto("./index.html#musica");
  await expect(page.getByTestId("musica-niente")).toContainText("Non suona niente");
  await expect(page.getByTestId("musica-stanze")).toHaveCount(0);
  await page.getByTestId("playlist-riproduci").filter({ hasText: "Rock" }).click();
  await expect(page.getByTestId("musica-titolo")).toHaveText("Primo brano di Rock");
  // senza stanza: decide jarvis_musica (la sua stanza predefinita)
  expect(await comandi(request)).toEqual(['riproduci {"cosa":"spotify:playlist:rock"}']);

  await musica(request, null);
  await page.reload();
  await expect(page.getByTestId("musica-niente")).toContainText("La musica non risponde");
  await expect(page.getByTestId("pagina-musica")).toContainText("Nessuna playlist da Spotify.");
});

test("mini-lettore sotto l'orologio solo mentre suona: pausa, tocco che apre la Musica", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  const mini = page.getByTestId("mini-lettore");
  await expect(mini).toBeVisible();
  await expect(page.getByTestId("mini-titolo")).toHaveText("Bohemian Rhapsody");
  await expect(mini).toContainText("Queen · Cucina");

  // più artisti: nel mini solo il primo, nella schermata Musica tutti
  await musica(request, { ...suonaInCucina, artisti: "Queen, David Bowie" });
  await page.reload();
  await expect(mini).toContainText("Queen · Cucina");
  await expect(mini).not.toContainText("Bowie");
  // sta nella colonna dell'orologio, non nella barra
  await expect(page.locator("section.info jarvis-mini-lettore")).toHaveCount(1);
  await expect(page.getByTestId("zona-assistente").locator("jarvis-mini-lettore")).toHaveCount(0);
  await mini.getByRole("button", { name: "Apri la musica" }).click();
  await expect(page.getByTestId("pagina-musica")).toBeVisible();
  await page.getByTestId("colonna-casa").click();
  await page.getByTestId("mini-pausa").click();
  // in pausa sparisce del tutto (niente spazio vuoto sotto l'orologio)
  await expect(mini).toHaveCount(0);
  await expect(page.locator("jarvis-mini-lettore")).toHaveAttribute("nascosto", "");
  expect(await comandi(request)).toEqual(['controllo {"azione":"pausa"}']);
});

test("mini-lettore: nella barra o spento dalle impostazioni; la rilettura segue l'intervallo scelto", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCucina);
  await accedi(page);
  await apriImpostazioni(page, "schermate");
  await expect(page.getByTestId("serie-musica-intervallo")).toHaveText("Di serie: 20 secondi");
  await page.getByTestId("campo-musica-posizione").selectOption("barra");
  await page.getByTestId("campo-musica-intervallo").fill("5");
  await page.getByTestId("campo-musica-intervallo").blur();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("zona-assistente").getByTestId("mini-lettore")).toBeVisible();
  await expect(page.locator("section.info jarvis-mini-lettore")).toHaveCount(0);

  // cambia brano su Spotify (da un'altra app): il mini se ne accorge alla prossima lettura
  await musica(request, { ...suonaInCucina, titolo: "Under Pressure" });
  await expect(page.getByTestId("mini-titolo")).toHaveText("Under Pressure", { timeout: 8000 });

  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-musica-mini").uncheck();
  await expect(page.getByTestId("campo-musica-posizione")).toBeDisabled();
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("mini-lettore")).toHaveCount(0);
  // valori salvati sul pannello
  await page.reload();
  await expect(page.getByTestId("stanza").first()).toBeVisible();
  await expect(page.getByTestId("mini-lettore")).toHaveCount(0);
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("ripristina-musica-mini").click();
  await page.getByTestId("ripristina-musica-posizione").click();
  await page.getByTestId("ripristina-musica-intervallo").click();
  await expect(page.getByTestId("campo-musica-intervallo")).toHaveValue("20");
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.locator("section.info").getByTestId("mini-lettore")).toBeVisible();
});

test("controprova: Musica si può togliere dalla colonna (resta in Altro)", async ({ page }) => {
  await accedi(page);
  await expect(page.getByTestId("colonna-musica")).toBeVisible();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("dove-musica").selectOption("altro");
  await page.getByTestId("chiudi-impostazioni").click();
  await expect(page.getByTestId("colonna-musica")).toHaveCount(0);
});
