import { expect, test, type Page } from "@playwright/test";
import { apriDiagnostica, aspettaServiceWorker, comando, HA, info, pallino } from "../aiuti";

/**
 * Origine veloce e origine di riserva (CLAUDE.md, "Due origini"). Nelle prove
 * sono lo stesso finto HA visto da due nomi: localhost = riserva (il link che
 * si apre sempre), 127.0.0.1 = veloce. Due origini vere per il browser: login,
 * localStorage, sessionStorage e service worker separati, come sul telefono.
 */
const RISERVA = HA;
const VELOCE = "http://127.0.0.1:18123";
const PAGINA = "/local/jarvis/index.html";

test.beforeEach(async ({ request, context }) => {
  await comando(request, "reset");
  await comando(request, "veloce?stato=su");
  await context.addInitScript(
    (o) => ((window as unknown as { __JARVIS_ORIGINI__: unknown }).__JARVIS_ORIGINI__ = o),
    { riserva: RISERVA, veloce: VELOCE },
  );
});

async function accediQui(page: Page): Promise<void> {
  await expect(page.getByTestId("accesso")).toBeVisible();
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
}

/** Con l'orologio finto la pressione lunga di 3 s sull'ora va fatta avanzare a mano. */
async function origineInUso(page: Page, orologioFinto = false): Promise<string> {
  if (orologioFinto) {
    const box = await page.getByTestId("ora").boundingBox();
    if (!box) throw new Error("orologio non visibile");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.runFor(3300);
    await page.mouse.up();
    await page.getByTestId("sezione-diagnostica").click();
    await expect(page.getByTestId("diagnostica")).toBeVisible();
  } else await apriDiagnostica(page);
  const testo = (await page.getByTestId("origine-in-uso").textContent()) ?? "";
  await page.getByTestId("chiudi-impostazioni").click();
  return testo;
}

test("veloce raggiungibile: si passa lì con percorso e parametri, login una volta sola", async ({
  page,
  request,
}) => {
  await page.goto(`${RISERVA}${PAGINA}?prova=1#x`);
  await expect(page).toHaveURL(`${VELOCE}${PAGINA}?prova=1#x`, { timeout: 5000 });
  // login per-origine: sulla veloce la prima volta si chiede "Accedi"
  await accediQui(page);
  expect(new URL(page.url()).origin).toBe(VELOCE);
  expect((await info(request)).login).toBe(1);
  expect(await origineInUso(page)).toBe("veloce · passato dal link di riserva");
  // ricarica: resta sulla veloce, già connesso, nessun login nuovo
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  expect(new URL(page.url()).origin).toBe(VELOCE);
  expect((await info(request)).login).toBe(1);
});

test("veloce irraggiungibile: si resta sulla riserva e il pannello funziona come prima", async ({
  page,
  request,
}) => {
  await comando(request, "veloce?stato=giu");
  await page.goto(`${RISERVA}${PAGINA}`);
  await accediQui(page);
  // tornando dal login la veloce non si prova (il codice del login vale solo qui)
  expect(await origineInUso(page)).toBe(
    "di riserva · login appena fatto qui, la veloce si riprova alla prossima apertura",
  );
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).origin).toBe(RISERVA);
  expect(await origineInUso(page)).toMatch(/^di riserva · origine veloce non raggiungibile/);
});

test("veloce che non risponde entro 1,5 s: si resta sulla riserva, senza aspettarla", async ({
  page,
  request,
}) => {
  await comando(request, "veloce?stato=lenta");
  await page.goto(`${RISERVA}${PAGINA}`);
  // il pannello non aspetta la prova: la schermata d'accesso c'è subito
  await expect(page.getByTestId("accesso")).toBeVisible({ timeout: 1500 });
  await accediQui(page);
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  await page.waitForTimeout(3500); // la risposta lenta arriva a 3 s: ormai non conta
  expect(new URL(page.url()).origin).toBe(RISERVA);
  expect(await origineInUso(page)).toBe("di riserva · origine veloce non ha risposto entro 1,5 s");
});

test("niente giri: un solo passaggio per sessione; una scheda nuova è una sessione nuova", async ({
  page,
  context,
}) => {
  await page.goto(`${RISERVA}${PAGINA}`);
  await expect(page).toHaveURL(`${VELOCE}${PAGINA}`, { timeout: 5000 });
  // di nuovo il link di riserva nella stessa scheda: niente secondo passaggio
  await page.goto(`${RISERVA}${PAGINA}`);
  await accediQui(page);
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).origin).toBe(RISERVA);
  expect(await origineInUso(page)).toBe("di riserva · passaggio già fatto in questa sessione");
  // la veloce non rimanda mai alla riserva da sola
  const altra = await context.newPage();
  await altra.goto(`${RISERVA}${PAGINA}`);
  await expect(altra).toHaveURL(`${VELOCE}${PAGINA}`, { timeout: 5000 });
  await altra.waitForTimeout(2500);
  expect(new URL(altra.url()).origin).toBe(VELOCE);
});

test("offline: ognuna delle due origini si apre dalla sua cache, mai pagina bianca", async ({
  page,
  context,
  request,
}) => {
  // riserva con la veloce giù: login e cache sulla riserva
  await comando(request, "veloce?stato=giu");
  await page.goto(`${RISERVA}${PAGINA}`);
  await accediQui(page);
  await aspettaServiceWorker(page);
  // veloce su: una scheda nuova passa di là, login e cache anche lì
  await comando(request, "veloce?stato=su");
  const veloce = await context.newPage();
  await veloce.goto(`${RISERVA}${PAGINA}`);
  await expect(veloce).toHaveURL(`${VELOCE}${PAGINA}`, { timeout: 5000 });
  await accediQui(veloce);
  await aspettaServiceWorker(veloce);

  await context.setOffline(true);
  await veloce.reload();
  await expect(pallino(veloce)).toBeVisible();
  await expect(veloce.getByTestId("ora")).toBeVisible();
  // riserva senza rete in una scheda nuova: la prova della veloce fallisce, si resta
  const riserva = await context.newPage();
  await riserva.goto(`${RISERVA}${PAGINA}`);
  await expect(pallino(riserva)).toBeVisible();
  await riserva.waitForTimeout(2500);
  expect(new URL(riserva.url()).origin).toBe(RISERVA);
  expect(await origineInUso(riserva)).toMatch(/^di riserva · origine veloce non raggiungibile/);
  await context.setOffline(false);
});

test("sulla veloce senza HA da 30 s, con la riserva che risponde: si propone di tornare, e non si riparte", async ({
  page,
  request,
}) => {
  await page.clock.install();
  // già usata in passato anche la riserva (login fatto)
  await comando(request, "veloce?stato=giu");
  await page.goto(`${RISERVA}${PAGINA}`);
  await accediQui(page);
  await comando(request, "veloce?stato=su");
  // poi la veloce, aperta direttamente in questa scheda
  await page.goto(`${VELOCE}${PAGINA}`);
  await accediQui(page);
  expect(await origineInUso(page, true)).toBe("veloce");
  await comando(request, "veloce?stato=giu"); // l'app Tailscale si è spenta
  await expect(pallino(page)).not.toHaveAttribute("data-stato", "connesso");
  await page.clock.fastForward(20_000);
  await expect(page.getByTestId("banner")).toBeVisible();
  // a 20 s ancora nessuna proposta
  await expect(page.getByTestId("proposta-riserva")).toBeHidden();
  await page.clock.fastForward(12_000);
  const proposta = page.getByTestId("proposta-riserva");
  await expect(proposta).toBeVisible();
  await expect(proposta).toContainText("Il link di riserva risponde");
  await expect(proposta.getByRole("button", { name: "Torna al link di riserva" })).toBeInViewport();
  await page.screenshot({ path: "test-results/origine-proposta-1024.png" });
  await page.setViewportSize({ width: 375, height: 740 });
  await expect(proposta.getByRole("button", { name: "Torna al link di riserva" })).toBeInViewport();
  await page.screenshot({ path: "test-results/origine-proposta-375.png" });

  await proposta.getByRole("button", { name: "Torna al link di riserva" }).click();
  // stessa pagina (il login aveva già pulito l'indirizzo), ?origine=riserva tolto appena arrivati
  await expect(page).toHaveURL(`${RISERVA}${PAGINA}`);
  await expect(pallino(page)).toBeVisible();
  expect(await origineInUso(page, true)).toBe("di riserva · tornato qui dall'origine veloce");
  await comando(request, "veloce?stato=su");
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).origin).toBe(RISERVA);
  // anche ricaricando, in questa sessione si resta
  await page.reload();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).origin).toBe(RISERVA);
});
