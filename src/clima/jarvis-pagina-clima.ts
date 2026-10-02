import { mdiChevronRight, mdiFlash, mdiThermometer } from "@mdi/js";
import { css, html, nothing, svg, type TemplateResult } from "lit";
import { sensoriConsumo } from "./consumi";
import { PREFERENZE } from "../comune";
import { connessione } from "../connessione";
import { descriviErrore, log } from "../diagnostica";
import { numero } from "../meteo";
import { navigatore, schermate } from "../navigazione";
import { costruisciStanze, leggiStorico, linea, scalaComune, type Punto, type StanzaVista } from "../casa";
import { OsservaEntita, RiquadroSicuro, icona, stileBase, stilePagina } from "../interfaccia";
import "../casa/componenti";

const W = 600;
const H = 140;
const COLORI = ["#5b8def", "#3ecf7a", "#e0a33a", "#e06c9f", "#4fb3d9", "#c9b458"];

/**
 * Schermata Clima (v0.5.7, mockup N2 "4 · Clima ed energia"): le temperature
 * di tutte le stanze con un termometro in un grafico solo (stessa scala), le
 * stanze con i valori di adesso (un tocco apre la stanza), lo scaldabagno col
 * suo programma, e i consumi SOLO se in casa c'è un sensore (oggi no).
 */
export class JarvisPaginaClima extends RiquadroSicuro {
  static override properties = {
    storico: { state: true },
    erroreStorico: { state: true },
  };
  declare storico: Record<string, Punto[]> | null;
  declare erroreStorico: string | null;

  static override styles = [
    stileBase,
    stilePagina,
    css`
      svg {
        display: block;
        width: 100%;
        height: 140px;
      }
      .assi,
      .legenda {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px 16px;
        color: var(--attenuato);
        font-size: 14px;
        margin-top: 6px;
      }
      .legenda {
        justify-content: flex-start;
      }
      .legenda i {
        display: inline-block;
        width: 12px;
        height: 4px;
        border-radius: 2px;
        margin-right: 6px;
        vertical-align: middle;
      }
      button.riga {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        padding: 10px 4px;
        border-bottom: 1px solid #1c2029;
        cursor: pointer;
      }
      .valore {
        font-size: 18px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .programmi {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
      }
    `,
  ];

  private letta = "";

  constructor() {
    super();
    this.storico = null;
    this.erroreStorico = null;
    new OsservaEntita(this, () => [
      ...this.stanze().flatMap((s) =>
        s.clima ? [s.clima.temperatura, s.clima.umidita, s.clima.percepita] : [],
      ),
      ...sensoriConsumo(connessione.negozio.tutte).map((c) => c.entita),
    ]);
  }

  private smetti: (() => void)[] = [];
  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [
      connessione.registri.ascolta(ridisegna),
      connessione.ascolta(ridisegna),
      schermate.ascolta(ridisegna),
    ];
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    this.letta = "";
  }

  private stanze(): StanzaVista[] {
    const r = connessione.registri;
    return costruisciStanze(r.aree, r.dispositivi, r.entita, connessione.negozio.tutte, PREFERENZE);
  }

  protected override updated(): void {
    // lo storico si legge una volta per insieme di stanze e ore (e alla connessione)
    const conn = connessione.conn;
    const termometri = this.stanze().flatMap((s) => (s.clima ? [s.clima.temperatura] : []));
    const ore = schermate.valori.climaOre;
    const chiave = `${termometri.join("|")}|${ore}`;
    if (!termometri.length || !conn?.connected || chiave === this.letta) return;
    this.letta = chiave;
    leggiStorico(conn, termometri, ore).then(
      (s) => {
        this.storico = s;
        this.erroreStorico = null;
      },
      (errore: unknown) => {
        log.avviso(`Clima: storico non letto (${descriviErrore(errore)})`);
        this.erroreStorico = descriviErrore(errore);
      },
    );
  }

  private grafico(conTermometro: StanzaVista[]): TemplateResult | typeof nothing {
    if (!conTermometro.length) return nothing;
    const ore = schermate.valori.climaOre;
    const adesso = Date.now();
    const da = adesso - ore * 3_600_000;
    let contenuto: TemplateResult;
    if (this.erroreStorico)
      contenuto = html`<div class="nota">Storico non disponibile da Home Assistant.</div>`;
    else if (!this.storico) contenuto = html`<div class="nota">Leggo lo storico…</div>`;
    else {
      const punti = conTermometro.map((s) => this.storico?.[s.clima?.temperatura ?? ""] ?? []);
      const scala = scalaComune(punti);
      const linee = punti.map((p) => (scala ? linea(p, da, adesso, W, H, scala) : null));
      if (!scala || linee.every((l) => l === null))
        contenuto = html`<div class="nota">Nelle ultime ${ore} ore non ci sono abbastanza misure.</div>`;
      else {
        const ora = (t: number) =>
          new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        contenuto = html`<svg
            viewBox="0 -4 ${W} ${H + 8}"
            preserveAspectRatio="none"
            role="img"
            aria-label="Temperature delle stanze, ultime ${ore} ore"
          >
            ${linee.map((l, i) =>
              (l?.tratti ?? []).map(
                (p) =>
                  svg`<polyline points=${p} fill="none" stroke=${COLORI[i % COLORI.length] ?? "#5b8def"} stroke-width="2.5" vector-effect="non-scaling-stroke" />`,
              ),
            )}
          </svg>
          <div class="assi">
            <span>${ora(da)}</span><span>${numero(scala.min)}°–${numero(scala.max)}°</span><span>adesso</span>
          </div>
          <div class="legenda" data-test="clima-legenda">
            ${conTermometro.map(
              (s, i) =>
                html`<span
                  ><i style="background:${COLORI[i % COLORI.length] ?? "#5b8def"}"></i>${s.nome}</span
                >`,
            )}
          </div>`;
      }
    }
    return html`<section class="riquadro" data-test="clima-grafico">
      <h2>Temperature, ultime ${ore} ore</h2>
      ${contenuto}
    </section>`;
  }

  private elenco(stanze: StanzaVista[]): TemplateResult {
    const n = connessione.negozio;
    return html`<section>
      <h2>Stanze</h2>
      ${stanze.map((s) => {
        const c = s.clima;
        const t = c ? numero(n.entitaDi(c.temperatura)?.state) : null;
        const u = c ? numero(n.entitaDi(c.umidita)?.state, 0) : null;
        const p = c ? numero(n.entitaDi(c.percepita)?.state) : null;
        return html`<button
          class="riga"
          data-test="clima-stanza"
          @click=${() => navigatore.vai({ tipo: "stanza", area: s.areaId }, "tocco su Clima")}
        >
          ${icona(mdiThermometer)}
          <span class="testo"
            >${s.nome}${
              c
                ? html`<small
                    >${[u ? `umidità ${u}%` : null, p ? `percepita ${p}°` : null].filter(Boolean).join(" · ")}</small
                  >`
                : html`<small>nessun termometro</small>`
            }</span
          >
          ${t ? html`<span class="valore" data-test="clima-temperatura">${t}°</span>` : nothing}
          ${icona(mdiChevronRight)}
        </button>`;
      })}
    </section>`;
  }

  private programmi(stanze: StanzaVista[]): TemplateResult | typeof nothing {
    const carte = stanze.flatMap((s) => s.card).filter((c) => PREFERENZE.programmi[c.entita] !== undefined);
    if (!carte.length) return nothing;
    const off = connessione.stato.stato !== "connesso";
    return html`<section>
      <h2>Programmi</h2>
      <div class="programmi">
        ${carte.map(
          (c) =>
            html`<jarvis-card-interruttore
              .card=${c}
              .offline=${off}
              .nonAggiornato=${false}
            ></jarvis-card-interruttore>`,
        )}
      </div>
    </section>`;
  }

  private consumi(): TemplateResult | typeof nothing {
    if (!schermate.valori.climaConsumi) return nothing;
    const sensori = sensoriConsumo(connessione.negozio.tutte);
    if (!sensori.length) return nothing;
    return html`<section data-test="clima-consumi">
      <h2>Consumi</h2>
      ${sensori.map(
        (s) =>
          html`<div class="riga">
            ${icona(mdiFlash)}
            <span class="testo">${s.nome}<small>${s.tipo === "potenza" ? "adesso" : "energia"}</small></span>
            <span class="valore"
              >${s.valore.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${s.unita}</span
            >
          </div>`,
      )}
    </section>`;
  }

  protected disegna(): TemplateResult {
    const r = connessione.registri;
    const stanze = this.stanze();
    if (!stanze.length)
      return html`<h1>Clima</h1>
        <div class="nota" role="status">
          ${r.caricati ? "Nessuna stanza da mostrare." : "Caricamento delle stanze…"}
        </div>`;
    return html`<h1>Clima</h1>
      ${this.grafico(stanze.filter((s) => s.clima))} ${this.elenco(stanze)} ${this.programmi(stanze)}
      ${this.consumi()}`;
  }
}
customElements.define("jarvis-pagina-clima", JarvisPaginaClima);
