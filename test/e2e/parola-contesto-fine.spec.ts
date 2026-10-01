import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info, microfonoDaFile } from "./aiuti";

/**
 * Contesto PRIMA di «Jarvis» (v0.5.2), nel pannello vero con la clip come
 * microfono: "It is a bit cold in this room, what do you think, hey jarvis?"
 * (3,4 s, «hey jarvis» in fondo). A HA deve arrivare TUTTA la frase, subito,
 * non solo il secondo prima della parola; e l'Hub la mostra intera.
 * La clip gira in loop: si guarda lo scatto migliore (il primo può cadere a
 * metà frase, quando il pannello ha appena cominciato ad ascoltare).
 */

test.use(microfonoDaFile("contesto-fine.wav"));

const frase = JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8"))["contesto-fine"]
  .segmenti[1] as { da: number; a: number };
const BYTE_FRASE = (frase.a - frase.da) * 2;
const DOMANDA =
  "C'è un po' di freddo in questa stanza, cosa ne pensi, Jarvis? Secondo te accendo il condizionatore o metto un maglione?";

test("«Jarvis» in fondo alla frase: a HA arriva la frase intera, e l'Hub la mostra tutta", async ({
  page,
  request,
}) => {
  await comando(request, `assistente?trascrizione=${encodeURIComponent(DOMANDA)}`);
  // il motore parte dopo 9 s (parola.json in ritardo): intanto il pannello va a riposo
  await comando(request, "file", { nome: "parola.json", contenuto: "{}", ritardo: 9000 });
  await page.addInitScript(() => {
    localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true }));
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 }));
  });
  await accedi(page);
  await apriImpostazioni(page, "riposo");
  await page.getByTestId("prova-riposo").click();
  await expect(page.getByTestId("riposo")).toBeVisible();

  // l'Hub mostra la domanda intera, dentro lo schermo
  await expect(page.getByTestId("hub-domanda")).toHaveText(`«${DOMANDA}»`, { timeout: 40_000 });
  const box = await page.getByTestId("hub-domanda").boundingBox();
  const vista = page.viewportSize();
  expect(box && vista && box.y >= 0 && box.y + box.height <= vista.height).toBe(true);

  // almeno uno scatto con tutta la frase: 3,4 s (110 KB), non 1 s né 10 s
  await expect
    .poll(async () => Math.max(0, ...(await info(request)).audioVoce.map((a) => a.byteSubito)), {
      timeout: 40_000,
    })
    .toBeGreaterThanOrEqual(BYTE_FRASE);
  for (const a of (await info(request)).audioVoce)
    expect(a.byteSubito).toBeLessThan(BYTE_FRASE + 32000 * 1.5);
  for (const r of (await info(request)).richiesteAssistente)
    expect(r).toMatchObject({ wake_word_phrase: "Jarvis", no_vad: null });
});
