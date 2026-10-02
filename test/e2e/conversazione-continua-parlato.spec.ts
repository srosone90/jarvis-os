import { expect, test } from "@playwright/test";
import { accedi, apriChat, comando, eContesto, info, microfonoDaFile } from "./aiuti";

/**
 * Conversazione continua (v0.5.3) con qualcuno che parla: il microfono finto
 * suona in loop una frase vera (Piper). Domanda col tocco → risposta →
 * riascolto → si sente parlare → seconda domanda SENZA «Jarvis», con lo
 * stesso conversation_id e senza pipeline del contesto.
 */

test.use(microfonoDaFile("contesto-fine.wav"));

for (const domanda of [false, true])
  test(`${domanda ? "dopo una domanda di Jarvis (8 s)" : "dopo un'azione (finestra breve, v0.5.8)"}: si continua a parlare → seconda domanda senza parola, stessa conversazione`, async ({
    page,
    request,
  }) => {
    await comando(request, "reset");
    if (domanda) await comando(request, "assistente?continua=1");
    await accedi(page);
    await apriChat(page);
    await page.getByRole("button", { name: "Parla", exact: true }).click();
    await expect(page.getByTestId("risposta").first()).toHaveText(
      "In camera ci sono 25,1°, con umidità al 43%.",
    );
    await comando(request, "assistente?trascrizione=E in soggiorno?");
    await expect(page.getByTestId("domanda").nth(1)).toHaveText("E in soggiorno?", { timeout: 20_000 });
    const [prima, seconda] = (await info(request)).richiesteAssistente;
    expect(prima?.conversation_id).toBeNull();
    expect(seconda).toMatchObject({ start_stage: "stt", end_stage: "tts", wake_word_phrase: null });
    // stesso conversation_id: quello che HA ha dato alla prima risposta
    expect(seconda?.conversation_id).toBe("conv-1");
    expect((await info(request)).richiesteAssistente.filter(eContesto)).toHaveLength(0);
    // la conversazione si chiude col tocco
    await expect(page.getByTestId("risposta").nth(1)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("voce-pulsante").click();
  });
