import { expect, test, type Page } from "@playwright/test";
import { accedi, apriChat, apriDiagnostica, comando } from "./aiuti";

/**
 * Audio "sveglio" per l'Echo in Bluetooth (v0.4.5): rumore a -80 dB in loop,
 * acceso di serie, spegnibile dalla diagnostica. Le prove girano con
 * l'autoplay permesso (playwright.config.ts): parte senza tocco.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

/** Registra le sorgenti in loop e il loro contesto, senza cambiare cosa suona. */
async function spia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __sveglio: { sorgente: AudioBufferSourceNode; contesto: BaseAudioContext; ferma: boolean }[];
    };
    w.__sveglio = [];
    const crea = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const s = crea.call(this);
      const voce = { sorgente: s, contesto: this as BaseAudioContext, ferma: false };
      w.__sveglio.push(voce);
      const stop = s.stop.bind(s);
      s.stop = (quando?: number) => {
        voce.ferma = true;
        stop(quando);
      };
      return s;
    };
  });
}

const leggi = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __sveglio: { sorgente: AudioBufferSourceNode; contesto: BaseAudioContext; ferma: boolean }[];
    };
    return w.__sveglio.map((v) => {
      const dati = v.sorgente.buffer?.getChannelData(0) ?? new Float32Array();
      let picco = 0;
      for (const x of dati) picco = Math.max(picco, Math.abs(x));
      return { loop: v.sorgente.loop, picco, ferma: v.ferma, stato: v.contesto.state };
    });
  });

const statoInDiagnostica = (page: Page) => page.getByTestId("stato-audio-sveglio");

test("acceso di serie: rumore in loop a -80 dB, contesto attivo; la voce funziona lo stesso", async ({
  page,
}) => {
  await spia(page);
  await accedi(page);
  await expect
    .poll(async () => (await leggi(page)).filter((s) => s.loop && s.stato === "running"))
    .toHaveLength(1);
  const [s] = await leggi(page);
  expect(s?.picco).toBeGreaterThan(0);
  expect(s?.picco).toBeLessThanOrEqual(1e-4);

  // tocca per parlare: risposta sentita e parlata, e l'audio sveglio resta acceso
  await apriChat(page);
  await page.getByRole("button", { name: "Parla", exact: true }).click();
  await expect(page.getByTestId("risposta")).toHaveText("In camera ci sono 25,1°, con umidità al 43%.");
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible({ timeout: 10_000 });
  const dopo = await leggi(page);
  expect(dopo.filter((x) => x.loop && !x.ferma && x.stato === "running")).toHaveLength(1);
});

test("spento dalla diagnostica: si ferma e resta spento anche dopo una ricarica", async ({ page }) => {
  await spia(page);
  await accedi(page);
  await apriDiagnostica(page);
  await expect(statoInDiagnostica(page)).toHaveText("attivo");
  const interruttore = page.getByTestId("audio-sveglio");
  await expect(interruttore).toBeChecked();
  await interruttore.uncheck();
  await expect(statoInDiagnostica(page)).toHaveText("spento");
  expect((await leggi(page)).every((s) => s.ferma)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("jarvis-audio-sveglio"))).toBe("0");

  await page.reload();
  await expect(page.getByTestId("pallino")).toHaveAttribute("data-stato", "connesso");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(500);
  expect(await leggi(page)).toHaveLength(0);
  await apriDiagnostica(page);
  await expect(statoInDiagnostica(page)).toHaveText("spento");
  await page.getByTestId("audio-sveglio").check();
  await expect(statoInDiagnostica(page)).toHaveText("attivo");
});

test("sospeso dal sistema: lo scrive nel log e riprende al primo tocco", async ({ page }) => {
  await spia(page);
  await accedi(page);
  await expect.poll(async () => (await leggi(page))[0]?.stato).toBe("running");
  // come una chiamata o un'altra app che si prende l'audio
  await page.evaluate(() =>
    (window as unknown as { __sveglio: { contesto: AudioContext }[] }).__sveglio[0]?.contesto.suspend(),
  );
  await apriDiagnostica(page);
  await expect(page.getByTestId("log")).toContainText("Audio sveglio sospeso dal sistema");
  // aprire la diagnostica è già un tocco: riprende
  await expect(statoInDiagnostica(page)).toHaveText("attivo");
  await expect(page.getByTestId("log")).toContainText("Audio sveglio ripreso");
});
