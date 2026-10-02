import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accedi, comando, eContesto, info, microfonoDaFile } from "../aiuti";

/**
 * Il minuto prima di «Jarvis» (v0.5.3, "persona sempre presente"), nel
 * pannello vero con una clip Piper come microfono: 40 s di discussione, una
 * pausa di 1,4 s, poi "so what is the weather going to be like tomorrow, hey
 * jarvis". A HA devono arrivare DUE pipeline:
 *  - il contesto: stt→stt, no_vad, device_id «…__contesto», la discussione
 *    (~40 s) a raffica e subito il frame di fine, PRIMA della richiesta;
 *  - la richiesta: solo l'ultima frase, con wake_word_phrase e senza no_vad.
 */

test.use(microfonoDaFile("discussione-poi-jarvis.wav"));

const segmenti = (
  JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8")) as Record<
    string,
    { segmenti: { testo: string | null; da: number; a: number }[] }
  >
)["discussione-poi-jarvis"]?.segmenti.filter((s) => s.testo !== null);
const frase = segmenti?.at(-1);
const discussione = segmenti?.slice(0, -1);
if (!frase || !discussione?.length) throw new Error("segmenti mancanti");
const BYTE_FRASE = (frase.a - frase.da) * 2;
const BYTE_DISCUSSIONE = ((discussione.at(-1)?.a ?? 0) - (discussione[0]?.da ?? 0)) * 2;

test("«hey jarvis» dopo 40 s di discussione: contesto prima (no_vad, …__contesto), poi solo la frase", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await comando(request, "reset");
  await page.addInitScript(() => {
    localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true }));
  });
  await accedi(page);
  // il primo scatto con la discussione intera in memoria (la clip dura 47 s e gira in loop)
  await expect
    .poll(async () => Math.max(0, ...(await info(request)).audioVoce.filter(eContesto).map((a) => a.byte)), {
      timeout: 120_000,
      intervals: [1000],
    })
    .toBeGreaterThanOrEqual(BYTE_DISCUSSIONE);
  const i = await info(request);
  const k = i.richiesteAssistente.findIndex(
    (r, n) => eContesto(r) && (i.audioVoce[n]?.byte ?? 0) >= BYTE_DISCUSSIONE,
  );
  const contesto = i.richiesteAssistente[k];
  const audioContesto = i.audioVoce[k];
  const richiesta = i.richiesteAssistente[k + 1];
  const audioRichiesta = i.audioVoce[k + 1];
  // la pipeline del contesto
  expect(contesto).toMatchObject({
    start_stage: "stt",
    end_stage: "stt",
    no_vad: true,
    wake_word_phrase: null,
  });
  expect(contesto?.device_id).toBe(`${richiesta?.device_id ?? "jarvis_pannello"}__contesto`);
  // ~40 s di discussione, senza il silenzio iniziale né la pausa prima della frase (margini 0,25 s)
  expect(audioContesto?.byte).toBeLessThanOrEqual(BYTE_DISCUSSIONE + 32000 * 0.6);
  // a raffica: tutto e il frame di fine in pochi istanti, non al ritmo del parlato
  expect(audioContesto?.fine).toBe(true);
  expect(audioContesto?.msFine).toBeLessThan(3000);
  // subito dopo, la richiesta: solo l'ultima frase (più l'audio dal vivo)
  expect(richiesta).toMatchObject({
    start_stage: "stt",
    end_stage: "tts",
    wake_word_phrase: "Jarvis",
    no_vad: null,
  });
  expect(audioRichiesta?.byteSubito).toBeGreaterThanOrEqual(BYTE_FRASE);
  expect(audioRichiesta?.byteSubito).toBeLessThan(BYTE_FRASE + 32000 * 1.5);
});
