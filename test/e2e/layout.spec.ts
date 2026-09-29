import { expect, test, type Page } from "@playwright/test";
import { accedi, comando } from "./aiuti";

/**
 * Regola: MAI sovrapposizioni, a nessuna misura da 320 px di larghezza in su.
 * Il tablet a muro (orizzontale) ha la schermata unica senza scorrere; sui
 * telefoni la pagina scorre. Per ogni misura, con la TV del salotto accesa (il
 * caso più alto) e poi anche offline:
 *  - nessun riquadro principale che si interseca con un altro;
 *  - ogni card dentro la sua stanza, e nessuna card sopra un'altra;
 *  - nessun testo tagliato, niente scorrimento orizzontale;
 *  - sul tablet: niente scorrimento verticale e tutto dentro lo schermo.
 * Gli screenshot finiscono in schermate/layout/ (ignorata da Git).
 */
const MISURE = [
  { nome: "tablet-1024x600", width: 1024, height: 600, unica: true },
  { nome: "telefono-orizzontale-915x412", width: 915, height: 412, unica: false },
  { nome: "telefono-in-chrome-915x330", width: 915, height: 330, unica: false },
  { nome: "telefono-verticale-412x915", width: 412, height: 915, unica: false },
  { nome: "telefono-verticale-360x740", width: 360, height: 740, unica: false },
  { nome: "minimo-320x640", width: 320, height: 640, unica: false },
];

interface Rettangolo {
  nome: string;
  x: number;
  y: number;
  r: number;
  b: number;
}

interface Misura {
  principali: Rettangolo[];
  stanze: { stanza: Rettangolo; card: Rettangolo[] }[];
  tagliati: string[];
  larghezzaPagina: number;
  altezzaPagina: number;
}

/** Misura dentro gli shadow DOM di Lit, con le coordinate della pagina intera. */
function misura(page: Page): Promise<Misura> {
  return page.evaluate(() => {
    const app = document.querySelector("jarvis-app")?.shadowRoot;
    if (!app) throw new Error("jarvis-app mancante");
    const ret = (nome: string, e: Element) => {
      const b = e.getBoundingClientRect();
      return { nome, x: b.left + scrollX, y: b.top + scrollY, r: b.right + scrollX, b: b.bottom + scrollY };
    };
    const visibile = (e: Element) => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const nomeStanza = (s: Element) => s.shadowRoot?.querySelector("h2")?.textContent ?? "?";
    const principali = [
      ...app.querySelectorAll(
        ".stato jarvis-connessione, .info, [data-test=zona-scene], .barra .chiedi, .barra .mic, .barra .posto-banner, jarvis-stanza",
      ),
    ]
      .filter(visibile)
      .map((e) =>
        ret(e.localName === "jarvis-stanza" ? `stanza ${nomeStanza(e)}` : e.className || e.localName, e),
      );
    const stanze = [...app.querySelectorAll("jarvis-stanza")].map((s) => ({
      stanza: ret(nomeStanza(s), s),
      card: [...(s.shadowRoot?.querySelectorAll(".carte > *") ?? [])]
        .filter(visibile)
        .map((c) => ret(c.localName, c)),
    }));
    const tagliati: string[] = [];
    const guarda = (radice: Document | ShadowRoot) => {
      for (const e of radice.querySelectorAll("*")) {
        if (!(e instanceof HTMLElement) || !visibile(e)) continue;
        const cs = getComputedStyle(e);
        const ritaglia =
          cs.overflowX !== "visible" || cs.textOverflow === "ellipsis" || e.localName === "button";
        if (ritaglia && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
          tagliati.push(`${e.localName}.${e.className}: «${e.textContent?.trim().slice(0, 40)}»`);
        if (e.shadowRoot) guarda(e.shadowRoot);
      }
    };
    guarda(document);
    return {
      principali,
      stanze,
      tagliati,
      larghezzaPagina: document.documentElement.scrollWidth,
      altezzaPagina: document.documentElement.scrollHeight,
    };
  });
}

const siIntersecano = (a: Rettangolo, b: Rettangolo) =>
  a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
const dentro = (a: Rettangolo, c: Rettangolo) =>
  a.x >= c.x - 0.5 && a.r <= c.r + 0.5 && a.y >= c.y - 0.5 && a.b <= c.b + 0.5;

/** Tutte le coppie (a, b) di elementi diversi, senza ripetizioni. */
function coppie<T>(elenco: readonly T[]): [T, T][] {
  return elenco.flatMap((a, i) => elenco.slice(i + 1).map((b): [T, T] => [a, b]));
}

function controlla(m: Misura, larghezza: number, altezza: number, unica: boolean): string[] {
  const problemi: string[] = [];
  const p = m.principali;
  for (const [a, b] of coppie(p))
    if (siIntersecano(a, b)) problemi.push(`sovrapposti: ${a.nome} ↔ ${b.nome}`);
  for (const { stanza, card } of m.stanze) {
    for (const c of card) if (!dentro(c, stanza)) problemi.push(`${c.nome} esce dalla stanza ${stanza.nome}`);
    for (const [a, b] of coppie(card))
      if (siIntersecano(a, b)) problemi.push(`card sovrapposte in ${stanza.nome}: ${a.nome} ↔ ${b.nome}`);
  }
  const tutti = [...p, ...m.stanze.flatMap((s) => s.card)];
  for (const r of tutti) {
    if (r.x < -0.5 || r.r > larghezza + 0.5) problemi.push(`${r.nome} esce dallo schermo in larghezza`);
    if (unica && r.b > altezza + 0.5)
      problemi.push(`${r.nome} esce dallo schermo in basso (${Math.round(r.b)} > ${altezza})`);
  }
  problemi.push(...m.tagliati.map((t) => `testo tagliato: ${t}`));
  if (m.larghezzaPagina > larghezza)
    problemi.push(`scorrimento orizzontale: ${m.larghezzaPagina} > ${larghezza}`);
  if (unica && m.altezzaPagina > altezza) problemi.push(`la pagina scorre: ${m.altezzaPagina} > ${altezza}`);
  return problemi;
}

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

for (const v of MISURE) {
  test(`layout ${v.nome}: niente sovrapposizioni né testi tagliati, anche offline`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    // caso più alto: TV del salotto accesa, con la riga del volume
    await page.getByTestId("card-media").locator("button.principale").click();
    await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible();
    await page.screenshot({ path: `schermate/layout/${v.nome}.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "in linea").toEqual([]);

    await comando(request, "spegni");
    await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `schermate/layout/${v.nome}-offline.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "offline").toEqual([]);
  });
}
