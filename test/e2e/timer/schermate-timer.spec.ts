import { expect, test } from "@playwright/test";
import { accedi, apriImpostazioni, comando, info, soloComandi } from "../aiuti";

/**
 * v0.5.7: le altre schermate del mockup N2 (Timer, Clima, Scene, Spesa,
 * Avvisi) e Altro. Il finto HA fa la lista della spesa (todo/item/subscribe e
 * servizi todo.*), il registro (logbook/get_events), gli script delle scene e
 * le batterie con device_class.
 */

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

test("Timer (v0.5.8): nuovo, pausa, riprendi e annulla con i servizi di jarvis_voce, senza Jarvis", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Cucina"));
  await accedi(page);
  await page.getByTestId("colonna-timer").click();
  await expect(page.getByTestId("timer-nessuno")).toBeVisible();
  await expect(page.getByTestId("timer-nota")).toContainText("Cucina");
  const rapidi = page.getByTestId("timer-nuovo");
  await expect(rapidi).toHaveText(["1 min", "3 min", "5 min", "10 min", "15 min", "30 min"]);
  // per nome esatto: "5 min" è anche dentro "15 min"
  await page.getByRole("button", { name: "Timer di 5 minuti", exact: true }).click();
  const servizi = async () =>
    soloComandi((await info(request)).chiamate).filter((c) => c.servizio.startsWith("jarvis_voce.timer_"));
  await expect
    .poll(async () => (await servizi()).at(-1))
    .toEqual({
      servizio: "jarvis_voce.timer_stanza",
      dati: { stanza: "cucina", minuti: 5 },
    });
  // il timer arriva con l'evento started, per il pannello jarvis_cucina
  const t = page.getByTestId("timer-attivo");
  await expect(t).toHaveCount(1);
  await expect(t).toContainText("5 minuti");
  await expect(t.getByTestId("timer-resto")).toHaveText(/^4:5\d$/, { timeout: 5000 });
  // niente domande a Jarvis: la chat resta vuota
  expect((await info(request)).richiesteAssistente).toEqual([]);

  await t.getByTestId("timer-pausa").click();
  await expect(t).toContainText("in pausa");
  const fermo = await t.getByTestId("timer-resto").textContent();
  await page.waitForTimeout(1500);
  await expect(t.getByTestId("timer-resto")).toHaveText(fermo ?? "");
  await t.getByTestId("timer-riprendi").click();
  await expect(t).not.toContainText("in pausa");
  await expect(t.getByTestId("timer-pausa")).toBeVisible();
  await t.getByTestId("timer-annulla").click();
  await expect(page.getByTestId("timer-nessuno")).toBeVisible();
  const id = ((await servizi()).at(-1)?.dati as { id: string }).id;
  expect((await servizi()).slice(1).map((c) => c.dati)).toEqual([
    { id, azione: "pausa" },
    { id, azione: "riprendi" },
    { id, azione: "annulla" },
  ]);

  // durate scelte a mano
  await page.getByTestId("colonna-casa").click();
  await apriImpostazioni(page, "schermate");
  await page.getByTestId("campo-timer-durate").fill("2, 7, 90");
  await page.getByTestId("campo-timer-durate").press("Enter");
  await page.getByTestId("chiudi-impostazioni").click();
  await page.getByTestId("colonna-timer").click();
  await expect(page.getByTestId("timer-nuovo")).toHaveText(["2 min", "7 min", "1 h 30"]);
});

test("controprove Timer: già finito sul server, server senza la 0.3.0, pannello senza stanza", async ({
  page,
  request,
}) => {
  await accedi(page);
  await page.getByTestId("colonna-timer").click();
  // senza stanza: i pulsanti per uno nuovo sono spenti e la nota dice perché
  await expect(page.getByTestId("timer-nuovo").first()).toBeDisabled();
  await expect(page.getByTestId("timer-nota")).toContainText("scegli la stanza");
  // un timer che il pannello vede ma il server non ha più (finito nel frattempo)
  await comando(request, "timer", {
    tipo: "started",
    id: "t-x",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 600,
  });
  const t = page.getByTestId("timer-attivo");
  await expect(t).toHaveCount(1);
  await comando(request, "timer-server");
  await t.getByTestId("timer-annulla").click();
  await expect(
    page.getByTestId("avviso").filter({ hasText: "Timer non trovato (forse è già finito)." }),
  ).toBeVisible();
  // server vecchio: lo si dice chiaro
  await comando(request, "jarvis-voce?installato=0");
  await t.getByTestId("timer-pausa").click();
  await expect(
    page.getByTestId("avviso").filter({ hasText: "serve jarvis_voce 0.3.0 sul server" }),
  ).toBeVisible();
});
