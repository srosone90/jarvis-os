import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accedi, apriChat, apriDiagnostica, apriImpostazioni, comando, HA, info } from "./aiuti";

/**
 * Pausa della musica durante la voce (v0.4.4). Il finto HA simula jarvis_musica
 * (stato vero di Spotify, comandi confermati), compreso l'Echo che cambia il
 * volume da solo alla ripresa (30 → 40, visto il 30/09).
 */
test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

async function musica(request: APIRequestContext, m: Record<string, unknown> | null): Promise<void> {
  const r = await request.post(`${HA}/__prova/musica`, { data: JSON.stringify(m) });
  expect(r.ok()).toBeTruthy();
}

/** Le chiamate a jarvis_musica fatte dal pannello (non da Gemini), in ordine. */
async function chiamateMusica(request: APIRequestContext): Promise<string[]> {
  return (await info(request)).chiamate
    .filter((c) => c.servizio.startsWith("jarvis_musica.") && !("da" in c))
    .map((c) =>
      c.servizio === "jarvis_musica.stato"
        ? "stato"
        : `${String(c.dati["azione"])}${c.dati["livello"] !== undefined ? ` ${String(c.dati["livello"])}` : ""}`,
    );
}

async function statoMusica(request: APIRequestContext): Promise<string | undefined> {
  const i = (await info(request)) as unknown as { musica: { stato: string } | null };
  return i.musica?.stato;
}

async function impostaStanza(page: Page, stanza: string): Promise<void> {
  await apriImpostazioni(page, "stanza");
  await page.getByTestId("stanza-pannello").selectOption(stanza);
  await page.getByTestId("chiudi-impostazioni").click();
}

async function domandaAVoce(page: Page): Promise<void> {
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("risposta")).not.toBeEmpty({ timeout: 15_000 });
  // finito l'audio torna il campo di testo
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 10_000 });
}

const suonaInCamera = {
  stato: "in_riproduzione",
  stanza: "Camera da letto",
  volume: 30,
  volumeDopoRipresa: 40,
};

test("musica nella stanza del pannello: pausa subito, risposta chiara, poi ripresa allo stesso volume", async ({
  page,
  request,
}) => {
  await musica(request, suonaInCamera);
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  // la pausa arriva mentre Jarvis ascolta, senza aspettare la risposta
  await expect.poll(() => statoMusica(request), { timeout: 5000 }).toBe("in_pausa");
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 10_000 });
  // dopo la risposta riparte, e il volume torna a 30 (l'Echo lo aveva messo a 40)
  await expect
    .poll(() => chiamateMusica(request), { timeout: 5000 })
    .toEqual(["stato", "pausa", "riprendi", "volume 30"]);
  expect(await statoMusica(request)).toBe("in_riproduzione");
});

test("senza stanza del pannello la musica non si tocca", async ({ page, request }) => {
  await musica(request, suonaInCamera);
  await accedi(page);
  await domandaAVoce(page);
  await page.waitForTimeout(2500);
  expect(await chiamateMusica(request)).toEqual([]);
});

test("musica già in pausa: resta in pausa, niente ripresa", async ({ page, request }) => {
  await musica(request, { ...suonaInCamera, stato: "in_pausa" });
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await domandaAVoce(page);
  await page.waitForTimeout(2500);
  expect(await chiamateMusica(request)).toEqual(["stato"]);
  expect(await statoMusica(request)).toBe("in_pausa");
});

test("musica in un'altra stanza: non si tocca", async ({ page, request }) => {
  await musica(request, { ...suonaInCamera, stanza: "Soggiorno" });
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await domandaAVoce(page);
  await page.waitForTimeout(2500);
  expect(await chiamateMusica(request)).toEqual(["stato"]);
  expect(await statoMusica(request)).toBe("in_riproduzione");
});

test("«metti in pausa la musica»: resta in pausa, niente ripresa automatica", async ({ page, request }) => {
  await musica(request, suonaInCamera);
  await comando(request, "assistente?modo=musica&trascrizione=Metti in pausa la musica");
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await domandaAVoce(page);
  await page.waitForTimeout(2500);
  expect(await chiamateMusica(request)).toEqual(["stato", "pausa"]);
  expect(await statoMusica(request)).toBe("in_pausa");
});

test("errore di Gemini: la musica riparte comunque", async ({ page, request }) => {
  await musica(request, suonaInCamera);
  await comando(request, "assistente?modo=errore");
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect.poll(() => statoMusica(request), { timeout: 5000 }).toBe("in_pausa");
  await expect
    .poll(() => chiamateMusica(request), { timeout: 15_000 })
    .toEqual(["stato", "pausa", "riprendi", "volume 30"]);
  expect(await statoMusica(request)).toBe("in_riproduzione");
});

test("componente della musica assente: la voce funziona lo stesso, l'errore va nel log", async ({
  page,
  request,
}) => {
  await musica(request, null);
  await accedi(page);
  await impostaStanza(page, "Camera da letto");
  await domandaAVoce(page);
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("Musica: pausa non riuscita");
});

test("stanza del pannello: si sceglie tra le aree di HA e resta dopo una ricarica", async ({ page }) => {
  // telefono piccolo: avviso e nota non devono allargare la pagina
  await page.setViewportSize({ width: 360, height: 740 });
  await accedi(page);
  await apriImpostazioni(page, "stanza");
  const scelta = page.getByTestId("stanza-pannello");
  await expect(scelta).toHaveValue("");
  await expect(scelta.locator("option")).toHaveText([
    "Nessuna",
    "Camera da letto",
    "Cucina",
    "Soggiorno",
    "Veranda",
  ]);
  await expect(page.getByTestId("avviso-stanza")).toContainText("Scegli la stanza per i timer");
  await page.screenshot({ path: "schermate/layout/diagnostica-senza-stanza-360.png" });
  const larghezza = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await larghezza()).toBeLessThanOrEqual(360);
  await scelta.selectOption("Cucina");
  await expect(page.getByTestId("dispositivo-timer")).toContainText("jarvis_cucina");
  await page.screenshot({ path: "schermate/layout/diagnostica-stanza-360.png" });
  expect(await larghezza()).toBeLessThanOrEqual(360);
  await expect(page.getByTestId("avviso-stanza")).toHaveCount(0);
  await page.reload();
  await apriImpostazioni(page, "stanza");
  await expect(page.getByTestId("stanza-pannello")).toHaveValue("Cucina");
});
