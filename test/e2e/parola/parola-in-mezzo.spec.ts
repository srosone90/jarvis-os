import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accedi, comando, info, microfonoDaFile } from "../aiuti";

/**
 * «Jarvis» IN MEZZO (v0.5.2): "hey jarvis" — 0,4 s — "turn on the TV in the
 * living room please". Lo scatto arriva dopo la parola: subito si manda solo
 * la parola, il resto della frase arriva dal vivo e la fine la decide il
 * server. Qui il finto HA non chiude da solo (stt=manuale) per misurare
 * l'audio dopo la parola.
 */

test.use(microfonoDaFile("jarvis-in-mezzo.wav"));

const [parola, resto] = (
  JSON.parse(readFileSync("test/dati/audio/segmenti.json", "utf8"))["jarvis-in-mezzo"].segmenti as {
    testo: string | null;
    da: number;
    a: number;
  }[]
).filter((s) => s.testo !== null);

test("subito la sola parola, poi la frase dal vivo; nessun errore se dopo c'è silenzio", async ({
  page,
  request,
}) => {
  if (!parola || !resto) throw new Error("segmenti mancanti");
  await comando(request, "reset");
  await comando(request, "assistente?stt=manuale");
  await page.addInitScript(() => localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true })));
  await accedi(page);
  await expect
    .poll(async () => (await info(request)).audioVoce.length, { timeout: 40_000 })
    .toBeGreaterThan(0);
  const [a] = (await info(request)).audioVoce;
  // subito: la parola (0,75 s) col margine, non il resto della frase
  expect(a?.byteSubito).toBeLessThan((parola.a - parola.da) * 2 + 32000 * 1.0);
  // poi la frase dopo la parola arriva dal vivo (2 s di "turn on the TV…")
  await expect
    .poll(async () => (await info(request)).audioVoce[0]?.byte ?? 0, { timeout: 15_000 })
    .toBeGreaterThan((a?.byteSubito ?? 0) + (resto.a - resto.da) * 2);
  await expect(page.getByText("Non ho capito")).toHaveCount(0);
});
