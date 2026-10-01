import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accedi, comando, info, microfonoDaFile } from "./aiuti";

/**
 * Contesto PRIMA di «Jarvis» con una pausa (v0.5.2): "I was watching the news
 * earlier today." — 1,6 s di silenzio — "what is the weather tomorrow, hey
 * jarvis". Si parte DOPO la pausa: se il server la ricevesse, ci vedrebbe una
 * fine frase (silenzio_secondi 1.0) e chiuderebbe prima di «Jarvis».
 */

test.use(microfonoDaFile("pausa-prima.wav"));

const [prima, seconda] = (
  JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8"))["pausa-prima"].segmenti as {
    testo: string | null;
    da: number;
    a: number;
  }[]
).filter((s) => s.testo !== null);

test("pausa di 1,6 s prima: arriva solo la seconda frase, intera", async ({ page, request }) => {
  if (!prima || !seconda) throw new Error("segmenti mancanti");
  await comando(request, "reset");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await accedi(page);
  const byteSeconda = (seconda.a - seconda.da) * 2;
  await expect
    .poll(async () => Math.max(0, ...(await info(request)).audioVoce.map((a) => a.byteSubito)), {
      timeout: 40_000,
    })
    .toBeGreaterThanOrEqual(byteSeconda);
  // mai la prima frase (né la pausa): al massimo la seconda + margine + il tempo fino allo scatto
  for (const a of (await info(request)).audioVoce)
    expect(a.byteSubito).toBeLessThan(byteSeconda + 32000 * 1.2);
});
