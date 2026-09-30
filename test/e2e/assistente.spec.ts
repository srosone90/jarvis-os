import { expect, test } from "@playwright/test";
import { accedi, apriChat, chiedi, comando, info, pallino } from "./aiuti";

/**
 * Assistente testuale (F4) contro il finto HA, che risponde con gli eventi di
 * assist_pipeline/run di HA 2026.9.3. Controprove (fatte, vedi CLAUDE.md):
 *  - senza la disattivazione offline, "offline" deve bocciare;
 *  - senza la gestione della connessione persa a metà, "cade" deve bocciare.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const risposte = (page: import("@playwright/test").Page) => page.getByTestId("risposta");

test("risposta normale: domanda, sto pensando, risposta; il contesto resta tra le domande; pipeline chiusa", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "Che temperatura c'è in camera?");
  await expect(page.getByTestId("domanda")).toHaveText("Che temperatura c'è in camera?");
  await expect(page.getByText("Sto pensando…")).toBeVisible();
  await expect(risposte(page)).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(page.getByText("Sto pensando…")).toHaveCount(0);

  let i = await info(request);
  expect(i.richiesteAssistente).toEqual([
    {
      testo: "Che temperatura c'è in camera?",
      conversation_id: null,
      start_stage: "intent",
      end_stage: "intent",
      timeout: 60,
    },
  ]);
  // a fine risposta il pannello si disiscrive: nessuna pipeline lasciata aperta in HA
  await expect.poll(async () => (await info(request)).pipelineAperte).toBe(0);

  await chiedi(page, "E in soggiorno?");
  await expect(risposte(page)).toHaveCount(2);
  i = await info(request);
  expect(i.richiesteAssistente[1]?.conversation_id).toBe("conv-1");

  // "nuova conversazione": chat vuota, contesto nuovo
  await page.getByRole("button", { name: "Nuova conversazione" }).click();
  await expect(page.getByTestId("domanda")).toHaveCount(0);
  await chiedi(page, "Ciao");
  await expect(risposte(page)).toHaveCount(1);
  expect((await info(request)).richiesteAssistente[2]?.conversation_id).toBeNull();
});

test("risposta con azione: etichetta dallo stato vero di HA e card aggiornata da sola", async ({
  page,
  request,
}) => {
  await comando(request, "stato", { entity_id: "media_player.soggiorno_tv_salotto", state: "on" });
  await accedi(page);
  await expect(page.getByTestId("card-media").getByTestId("card-stato")).toHaveText("Accesa");
  await comando(request, "assistente?modo=azione");
  await apriChat(page);
  await chiedi(page, "Spegni la TV del salotto");
  await expect(page.getByTestId("azione")).toHaveText("TV Salotto · spenta");
  await expect(risposte(page)).toHaveText("Fatto, ho spento la TV del salotto.");
  await page.getByRole("button", { name: "Chiudi" }).click();
  // la card si è aggiornata da subscribe_entities, senza logica duplicata
  await expect(page.getByTestId("card-media").getByTestId("card-stato")).toHaveText("Spenta");
});

test("risposta lenta (10 s): resta 'sto pensando', poi arriva", async ({ page, request }) => {
  await comando(request, "assistente?modo=lenta&ms=10000");
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "Quanti gradi in soggiorno?");
  await expect(page.getByText("Sto pensando…")).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.getByText("Sto pensando…")).toBeVisible();
  await expect(page.getByTestId("stato-assistente")).toHaveText("sta rispondendo…");
  await expect(risposte(page)).toHaveText("Scusa l'attesa: in soggiorno ci sono 25,7°.", { timeout: 15_000 });
  await expect(page.getByTestId("stato-assistente")).toHaveText("Gemini");
});

test("errore di Gemini: messaggio chiaro, la domanda resta e si riprova con un tocco", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?modo=errore");
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "Che tempo fa?");
  const errore = page.getByTestId("errore-assistente");
  // all'invio HA non dice la causa: messaggio onesto che copre entrambe
  await expect(errore).toContainText("Gemini non ha risposto.");
  await expect(errore).toContainText("riprova tra un minuto");
  // mai il testo tecnico in inglese davanti all'utente
  await expect(page.getByText(/Sorry|Google Generative AI/)).toHaveCount(0);
  await expect(page.getByTestId("domanda")).toHaveText("Che tempo fa?");
  await expect(risposte(page)).toHaveCount(0);
  await comando(request, "assistente?modo=normale");
  await page.getByRole("button", { name: "Riprova" }).click();
  await expect(risposte(page)).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(page.getByTestId("domanda")).toHaveCount(1);
  await expect(errore).toHaveCount(0);
});

for (const [modo, titolo] of [
  ["quota", "Gemini ha raggiunto il limite di richieste."],
  ["occupato", "Gemini è occupato in questo momento."],
] as const) {
  test(`errore di Gemini "${modo}": messaggio umano in italiano, niente inglese`, async ({
    page,
    request,
  }) => {
    await comando(request, `assistente?modo=${modo}`);
    await accedi(page);
    await apriChat(page);
    await chiedi(page, "Che tempo fa domani?");
    const errore = page.getByTestId("errore-assistente");
    await expect(errore).toContainText(titolo);
    await expect(errore).toContainText("Riprova tra un minuto.");
    await expect(page.getByText(/Sorry|exhausted|overloaded/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Riprova" })).toBeEnabled();
  });
}

test("connessione persa a metà: errore chiaro, nessun reinvio automatico, si rimanda con un tocco", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?modo=cade");
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "Spegni la TV");
  await expect(page.getByTestId("errore-assistente")).toContainText(
    "Connessione persa durante la risposta.",
    {
      timeout: 8000,
    },
  );
  await expect(page.getByTestId("domanda")).toHaveText("Spegni la TV");
  // riconnesso: la libreria NON deve rimandare la pipeline da sola ("spegni" due volte)
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso", { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect((await info(request)).richiesteAssistente).toHaveLength(1);

  await comando(request, "assistente?modo=normale");
  await page.getByRole("button", { name: "Rimanda" }).click();
  await expect(risposte(page)).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  const i = await info(request);
  expect(i.richiesteAssistente).toHaveLength(2);
  expect(i.richiesteAssistente[1]?.testo).toBe("Spegni la TV");
});

test("offline: campo e barra disattivati con spiegazione, nessuna domanda parte, mai risposte finte", async ({
  page,
  request,
}) => {
  await accedi(page);
  await apriChat(page);
  await comando(request, "spegni");
  const campo = page.getByRole("textbox", { name: "Domanda per Jarvis" });
  await expect(campo).toBeDisabled({ timeout: 5000 });
  await expect(page.getByTestId("assistente-offline")).toContainText("Home Assistant non raggiungibile.");
  await expect(page.getByRole("button", { name: "Invia" })).toBeDisabled();
  // tablet: dopo 10 s il banner va nella barra, SOTTO la chat, senza sovrapporsi
  const banner = page.getByTestId("banner");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const chat = await page.locator("jarvis-chat").boundingBox();
  const posto = await banner.boundingBox();
  expect(chat && posto && chat.y + chat.height <= posto.y).toBe(true);
  await page.screenshot({ path: "schermate/layout/chat-tablet-offline.png" });
  await page.getByRole("button", { name: "Chiudi" }).click();
  // la barra sotto un altro formato di schermo
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(banner).toBeVisible();
  const barra = page.getByRole("button", { name: /Chiedi a Jarvis/ });
  await expect(barra).toBeDisabled();
  await expect(barra).toContainText("non disponibile senza Home Assistant");
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
  await expect(page.getByTestId("risposta")).toHaveCount(0);
});

test("la chat si chiude da sola dopo 60 s senza tocchi; riaperta entro 5 minuti la conversazione c'è ancora", async ({
  page,
}) => {
  await page.clock.install();
  await accedi(page);
  await apriChat(page);
  await chiedi(page, "Domanda");
  // risposta finita (non solo il primo pezzo), poi si fa passare il tempo
  await expect(page.getByTestId("stato-assistente")).toHaveText("Gemini");
  await expect(risposte(page)).toHaveCount(1);
  await page.clock.fastForward(50_000);
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chiedi a Jarvis…" })).toBeVisible();
  await apriChat(page);
  await expect(risposte(page)).toHaveCount(1);
  // oltre 5 minuti HA ha dimenticato il contesto: la chat riparte vuota
  await page.getByRole("button", { name: "Chiudi" }).click();
  await page.clock.fastForward(5 * 60_000);
  await apriChat(page);
  await expect(risposte(page)).toHaveCount(0);
});

// --- tastiera della chat (v0.4.5, richiesta della sessione server del 30/09) ---

test("tastiera: un tocco fuori dal campo la chiude, la chat resta aperta", async ({ page }) => {
  await accedi(page);
  await apriChat(page);
  const campo = page.getByRole("textbox", { name: "Domanda per Jarvis" });
  await expect(campo).toBeFocused();
  // Tocco di Android che fa scorrere i messaggi: arriva solo pointerdown, senza
  // il clic che sposterebbe il focus (col mouse del desktop la tastiera si
  // chiuderebbe da sola e la prova non direbbe niente).
  const tocca = (testId: string) =>
    page.getByTestId(testId).dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
  await tocca("messaggi");
  await expect(campo).not.toBeFocused();
  await expect(campo).toBeVisible();
  // tocco fuori dalla chat (sul tablet: l'orologio a sinistra)
  await campo.click();
  await expect(campo).toBeFocused();
  await tocca("ora");
  await expect(campo).not.toBeFocused();
  await expect(campo).toBeVisible();
  // il tocco sul campo stesso non la chiude
  await campo.click();
  await campo.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
  await expect(campo).toBeFocused();
});

test("tastiera: sul tablet si chiude dopo l'invio; sul telefono resta per il seguito", async ({ page }) => {
  await accedi(page);
  await apriChat(page);
  const campo = page.getByRole("textbox", { name: "Domanda per Jarvis" });
  await chiedi(page, "che temperatura c'è in camera?");
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(campo).not.toBeFocused();

  await page.setViewportSize({ width: 412, height: 915 });
  await campo.click();
  await chiedi(page, "e in soggiorno?");
  await expect(page.getByTestId("risposta")).toHaveCount(2);
  await expect(campo).toBeFocused();
});

test("Indietro di Android chiude la chat, non l'app; chiusa col tasto non resta niente da togliere", async ({
  page,
}) => {
  await accedi(page);
  const prima = await page.evaluate(() => history.length);
  await apriChat(page);
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chiedi a Jarvis…" })).toBeVisible();
  expect(page.url()).toContain("/local/jarvis/index.html");

  // chiusa con la X: la sua voce nella cronologia sparisce, Indietro non la riapre
  await apriChat(page);
  await page.getByRole("button", { name: "Chiudi" }).click();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state as unknown)).toBeNull();
  expect(await page.evaluate(() => history.length)).toBe(prima + 1);
  // riaperta: Indietro la richiude ancora
  await apriChat(page);
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toHaveCount(0);
});
