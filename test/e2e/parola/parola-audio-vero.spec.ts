import { expect, test } from "@playwright/test";
import { accedi, apriDiagnostica, comando, info, microfonoDaFile } from "../aiuti";

/**
 * «Jarvis» nel pannello vero con AUDIO VERO (v0.5.1): Chromium usa un file
 * WAV come microfono (`--use-file-for-fake-audio-capture`, in loop), quindi
 * passa tutto il percorso del tablet: getUserMedia → worklet (float → int16)
 * → microfono condiviso → ricampionamento → melspettrogramma → embedding →
 * hey_jarvis. Niente verificatore finto: decide il modello di serie.
 */

test.beforeEach(async ({ page, request }) => {
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
});

test.use(microfonoDaFile("hey-jarvis-piper.wav"));

test("il modello di serie lo sente: parte la domanda con wake_word_phrase, e la barra dal vivo supera la soglia", async ({
  page,
  request,
}) => {
  await accedi(page);
  await expect(page.getByTestId("indicatore-parola")).toHaveAttribute("data-stato", "ascolta", {
    timeout: 30_000,
  });
  await expect
    .poll(async () => (await info(request)).richiesteAssistente.length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  expect((await info(request)).richiesteAssistente[0]).toMatchObject({
    start_stage: "stt",
    wake_word_phrase: "Jarvis",
  });
  // nel registro: frequenza e impostazioni vere del microfono, e lo scatto col suo punteggio
  await apriDiagnostica(page);
  const registro = page.getByTestId("log");
  await expect(registro).toContainText(/Microfono aperto \(elaborazione: solo-eco\): AudioContext a \d+ Hz/);
  await expect(registro).toContainText("rumore no, guadagno automatico no");
  await expect(registro).toContainText(
    // con la conferma su 2 frame (v0.5.4) lo scatto è sul secondo frame sopra soglia: 0,5-1,0
    /«Jarvis» sentito \(punteggio (0\.[5-9]\d|1\.00), modello di base, soglia 0\.50\)/,
  );
  // e la barra dal vivo, nelle impostazioni: sopra la soglia mentre la clip dice «hey jarvis»
  await page.getByTestId("sezione-voce").click();
  await expect
    .poll(
      async () =>
        Number((await page.getByTestId("dal-vivo-punteggio").first().textContent())?.replace(",", ".")),
      {
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0.5);
});
