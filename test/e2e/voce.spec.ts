import { expect, test, type Page } from "@playwright/test";
import { accedi, apriChat, comando, info } from "./aiuti";

/**
 * Voce "tocca per parlare" (F5) contro il finto HA con la pipeline stt→tts di
 *  HA 2026.9.3. Il microfono è quello finto di Chromium (un fruscio bassissimo dalla v0.5.3), il
 * permesso è già concesso (playwright.config.ts).
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

const voce = (page: Page) => page.getByTestId("voce-stato");

/** Conta le tracce del microfono ancora aperte (getUserMedia → stop). */
async function contaTracce(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __tracceVive: number };
    w.__tracceVive = 0;
    const originale = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const flusso = await originale(c);
      for (const t of flusso.getTracks()) {
        w.__tracceVive++;
        const stop = t.stop.bind(t);
        let fermata = false;
        t.stop = () => {
          if (!fermata) w.__tracceVive--;
          fermata = true;
          stop();
        };
      }
      return flusso;
    };
  });
}
const tracceVive = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tracceVive: number }).__tracceVive);

test("chat: tocco → ascolto → domanda sentita → risposta scritta e parlata; microfono chiuso", async ({
  page,
  request,
}) => {
  await contaTracce(page);
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(voce(page)).toContainText("Ti ascolto…");
  expect(await tracceVive(page)).toBe(1);
  await expect(page.getByTestId("domanda")).toHaveText("Che temperatura c'è in camera?");
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  // finito l'audio torna il campo di testo
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 10_000 });

  const i = await info(request);
  const r = i.richiesteAssistente[0];
  expect(r?.start_stage).toBe("stt");
  expect(r?.end_stage).toBe("tts");
  expect(i.audioVoce[0]?.sampleRate).toBe(16000);
  expect(i.audioVoce[0]?.byte).toBeGreaterThan(16000);
  expect(i.richiesteTts).toHaveLength(1);
  await expect.poll(async () => (await info(request)).pipelineAperte).toBe(0);
  // il microfono è davvero chiuso (nessuna traccia viva: si spegne l'indicatore)
  expect(await tracceVive(page)).toBe(0);
});

test("risposta locale in streaming: l'audio si scarica subito, così HA chiude la pipeline", async ({
  page,
  request,
}) => {
  // come HA con prefer_local_intents: run-end arriva solo dopo che l'audio è stato scaricato
  await comando(request, "assistente?tts=streaming&trascrizione=Che ore sono?");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("domanda")).toHaveText("Che ore sono?");
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await info(request)).pipelineAperte, { timeout: 5000 }).toBe(0);
  expect((await info(request)).richiesteTts).toHaveLength(1);
});

test("riquadro piccolo: chat chiusa + microfono della barra; toccandolo si apre la chat", async ({
  page,
  request,
}) => {
  await accedi(page);
  await page.getByRole("button", { name: "Parla con Jarvis" }).click();
  const riquadro = page.getByTestId("riquadro-voce");
  await expect(riquadro).toBeVisible();
  await expect(riquadro.getByTestId("domanda")).toHaveText("Che temperatura c'è in camera?");
  await expect(riquadro.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  // la chat non si è aperta da sola
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toHaveCount(0);
  await riquadro.getByTestId("riquadro-contenuto").click();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(riquadro).toHaveCount(0);
  expect((await info(request)).richiesteAssistente).toHaveLength(1);
});

test("riquadro piccolo: sparisce da solo qualche secondo dopo la risposta", async ({ page }) => {
  await accedi(page);
  await page.getByRole("button", { name: "Parla con Jarvis" }).click();
  const riquadro = page.getByTestId("riquadro-voce");
  await expect(riquadro.getByTestId("risposta")).toBeVisible();
  // v0.5.3: prima 8 s di riascolto ("Ti ascolto ancora"), poi i 6 s del riquadro
  await expect(riquadro.getByTestId("ascolto-ancora")).toBeVisible({ timeout: 5000 });
  await expect(riquadro).toHaveCount(0, { timeout: 20_000 });
  // il microfono della barra torna disponibile
  await expect(page.getByRole("button", { name: "Parla con Jarvis" })).toBeEnabled();
});

test("seguito quando HA chiede di continuare: come sempre dalla v0.5.3, si riascolta; nessuno parla, nessuna richiesta", async ({
  page,
  request,
}) => {
  // prima della v0.5.3 continue_conversation riapriva SUBITO una pipeline verso HA;
  // ora il seguito è lo stesso riascolto di 8 s, e la pipeline parte solo se qualcuno parla
  await comando(request, "assistente?continua=1");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("ascolto-ancora")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("risposta")).toHaveCount(1);
  expect((await info(request)).richiesteAssistente).toHaveLength(1);
});

test("tocco per fermare: l'ascolto finisce quando lo dici tu, HA risponde a quello che ha sentito", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?stt=manuale");
  await contaTracce(page);
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(voce(page)).toContainText("Ti ascolto…");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Ferma l'ascolto" }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  expect((await info(request)).audioVoce[0]?.fine).toBe(true);
  expect(await tracceVive(page)).toBe(0);
});

test("microfono negato: messaggio umano con cosa fare, nessuna domanda parte", async ({ page, request }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(voce(page)).toContainText("Microfono non consentito.");
  await expect(voce(page)).toContainText("Consenti");
  await expect(page.getByText(/Permission|NotAllowed/)).toHaveCount(0);
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
  // si chiude e si torna a scrivere
  await page.getByRole("button", { name: "Chiudi", exact: true }).last().click();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
});

test("senza HTTPS: il microfono non esiste, lo dice e si può scrivere", async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { value: false });
  });
  await accedi(page);
  await page.getByRole("button", { name: "Parla con Jarvis" }).click();
  const riquadro = page.getByTestId("riquadro-voce");
  await expect(riquadro.getByTestId("voce-stato")).toContainText("Serve l'indirizzo sicuro.");
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
});

test("connessione persa a metà: errore chiaro, microfono spento, nessun reinvio automatico", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?modo=cade");
  await contaTracce(page);
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("errore-assistente")).toContainText(
    "Connessione persa durante la risposta.",
    {
      timeout: 10_000,
    },
  );
  expect(await tracceVive(page)).toBe(0);
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso", { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect((await info(request)).richiesteAssistente).toHaveLength(1);
});

test("Gemini al limite (429) a voce: messaggio umano in italiano", async ({ page, request }) => {
  await comando(request, "assistente?modo=quota");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("errore-assistente")).toContainText(
    "Gemini ha raggiunto il limite di richieste.",
  );
  await expect(page.getByText(/Sorry|exhausted/)).toHaveCount(0);
});

test("non ho sentito niente: messaggio e 'Parla di nuovo' riapre il microfono", async ({ page, request }) => {
  await comando(request, "assistente?stt=silenzio");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  const errore = page.getByTestId("errore-assistente");
  await expect(errore).toContainText("Non ho capito, puoi ripetere?");
  await comando(request, "assistente?stt=normale");
  await errore.getByRole("button", { name: "Parla di nuovo" }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
});

test("stream audio caduto (stt-stream-failed): 'Non ho capito, puoi ripetere?' e si riparla", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?stt=guasto");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  const errore = page.getByTestId("errore-assistente");
  await expect(errore).toContainText("Non ho capito, puoi ripetere?");
  await expect(page.getByText(/stt-stream|failed/)).toHaveCount(0);
  await comando(request, "assistente?stt=normale");
  await errore.getByRole("button", { name: "Parla di nuovo" }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
});

test("mentre pensa il pulsante non è bloccato: il tocco annulla, la pipeline si chiude, si riparla", async ({
  page,
  request,
}) => {
  await comando(request, "assistente?modo=lenta&ms=20000");
  await accedi(page);
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(voce(page)).toContainText("Sto pensando…");
  const pulsante = page.getByRole("button", { name: "Annulla la domanda" });
  await expect(pulsante).toBeEnabled();
  await pulsante.click();
  await expect(page.getByTestId("errore-assistente")).toContainText("Domanda annullata.");
  await expect.poll(async () => (await info(request)).pipelineAperte).toBe(0);
  await comando(request, "assistente?modo=normale");
  await page.getByTestId("errore-assistente").getByRole("button", { name: "Riprova" }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
});

test("offline: microfono della barra e della chat spenti", async ({ page, request }) => {
  await accedi(page);
  await comando(request, "spegni");
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByRole("button", { name: "Parla con Jarvis" })).toBeDisabled({ timeout: 5000 });
  expect((await info(request)).richiesteAssistente).toHaveLength(0);
});
