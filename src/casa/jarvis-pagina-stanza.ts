import { css, html, nothing, svg, type TemplateResult } from "lit";
import { PREFERENZE } from "../comune";
import { connessione } from "../connessione";
import { descriviErrore, log } from "../diagnostica";
import { numero } from "../meteo";
import { costruisciStanze } from "./modello";
import { caricaPreferenzeStorico, leggiStorico, linea, type Punto } from "./storico";
import { OsservaEntita, RiquadroSicuro, stileBase } from "../interfaccia";
import "./jarvis-stanza";

const W = 600;
const H = 120;

/**
 * Schermata Stanza (v0.5.5, mockup N2 "1 · Stanza"): si apre toccando il nome
 * di una stanza. Temperatura (e umidità, se scelto) delle ultime ore dal
 * registro di Home Assistant, poi tutti i dispositivi della stanza. Una
 * stanza senza termometro (la cucina) non ha il grafico: niente si inventa.
 */
export class JarvisPaginaStanza extends RiquadroSicuro {
  static override properties = {
    areaId: { type: String },
    storico: { state: true },
    erroreStorico: { state: true },
  };
  declare areaId: string;
  declare storico: Record<string, Punto[]> | null;
  declare erroreStorico: string | null;

  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
        min-height: 0;
        overflow: auto;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 600;
      }
      .clima {
        color: var(--attenuato);
        font-size: 17px;
      }
      .grafico {
        padding: 14px 16px;
        border-radius: var(--raggio);
        background: var(--superficie);
      }
      .grafico h2 {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--attenuato);
      }
      svg {
        display: block;
        width: 100%;
        height: 120px;
      }
      .assi {
        display: flex;
        justify-content: space-between;
        color: var(--attenuato);
        font-size: 13px;
        margin-top: 4px;
      }
      .legenda {
        display: flex;
        gap: 16px;
        font-size: 14px;
        color: var(--attenuato);
      }
      .legenda i {
        display: inline-block;
        width: 14px;
        height: 3px;
        vertical-align: middle;
        margin-right: 6px;
        border-radius: 2px;
      }
      .nota {
        color: var(--attenuato);
        font-size: 15px;
      }
      jarvis-stanza {
        min-height: 0;
      }
    `,
  ];

  private letta = "";

  constructor() {
    super();
    this.areaId = "";
    this.storico = null;
    this.erroreStorico = null;
    new OsservaEntita(this, () => {
      const c = this.stanza()?.clima;
      return c ? [c.temperatura, c.umidita, c.percepita] : [];
    });
  }

  private stanza() {
    const r = connessione.registri;
    return costruisciStanze(r.aree, r.dispositivi, r.entita, connessione.negozio.tutte, PREFERENZE).find(
      (s) => s.areaId === this.areaId,
    );
  }

  protected override updated(): void {
    // lo storico si legge una volta per stanza (e alla connessione)
    const c = this.stanza()?.clima;
    const conn = connessione.conn;
    const chiave = `${this.areaId}|${c?.temperatura ?? ""}`;
    if (!c || !conn?.connected || chiave === this.letta) return;
    this.letta = chiave;
    const pref = caricaPreferenzeStorico();
    const entita = pref.umidita ? [c.temperatura, c.umidita] : [c.temperatura];
    leggiStorico(conn, entita, pref.ore).then(
      (s) => {
        this.storico = s;
        this.erroreStorico = null;
      },
      (errore: unknown) => {
        log.avviso(`Stanza: storico non letto (${descriviErrore(errore)})`);
        this.erroreStorico = descriviErrore(errore);
      },
    );
  }

  private grafico(clima: { temperatura: string; umidita: string }): TemplateResult {
    const pref = caricaPreferenzeStorico();
    const adesso = Date.now();
    const da = adesso - pref.ore * 3_600_000;
    if (this.erroreStorico)
      return html`<div class="grafico">
        <div class="nota">Storico non disponibile da Home Assistant.</div>
      </div>`;
    if (!this.storico) return html`<div class="grafico"><div class="nota">Leggo lo storico…</div></div>`;
    const temp = linea(this.storico[clima.temperatura] ?? [], da, adesso, W, H);
    const umi = pref.umidita ? linea(this.storico[clima.umidita] ?? [], da, adesso, W, H) : null;
    if (!temp)
      return html`<div class="grafico" data-test="grafico-stanza">
        <div class="nota">Nelle ultime ${pref.ore} ore non ci sono abbastanza misure.</div>
      </div>`;
    const ora = (t: number) =>
      new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return html`<div class="grafico" data-test="grafico-stanza">
      <h2>Ultime ${pref.ore} ore</h2>
      <svg
        viewBox="0 -4 ${W} ${H + 8}"
        preserveAspectRatio="none"
        role="img"
        aria-label="Temperatura, ultime ${pref.ore} ore"
      >
        ${temp.tratti.map(
          (p) =>
            svg`<polyline points=${p} fill="none" stroke="#5b8def" stroke-width="2.5" vector-effect="non-scaling-stroke" />`,
        )}
        ${(umi?.tratti ?? []).map(
          (p) =>
            svg`<polyline points=${p} fill="none" stroke="#3ecf7a" stroke-width="2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`,
        )}
      </svg>
      <div class="assi"><span>${ora(da)}</span><span>adesso</span></div>
      <div class="legenda">
        <span data-test="grafico-temperatura"
          ><i style="background:#5b8def"></i>temperatura ${numero(temp.min)}°–${numero(temp.max)}°</span
        >
        ${umi ? html`<span><i style="background:#3ecf7a"></i>umidità ${numero(umi.min, 0)}–${numero(umi.max, 0)}%</span>` : nothing}
      </div>
    </div>`;
  }

  protected disegna(): TemplateResult {
    const s = this.stanza();
    const r = connessione.registri;
    if (!s)
      return html`<h1>Stanza</h1>
        <div class="nota" role="status">
          ${r.caricati ? "Questa stanza non ha dispositivi da mostrare." : "Caricamento delle stanze…"}
        </div>`;
    const negozio = connessione.negozio;
    const c = s.clima;
    const t = c ? numero(negozio.entitaDi(c.temperatura)?.state) : null;
    const u = c ? numero(negozio.entitaDi(c.umidita)?.state, 0) : null;
    const p = c ? numero(negozio.entitaDi(c.percepita)?.state) : null;
    return html`<h1 data-test="pagina-stanza-nome">${s.nome}</h1>
      ${
        c
          ? html`<div class="clima" data-test="pagina-stanza-clima">
                ${[t ? `${t}°` : null, u ? `${u}%` : null, p ? `percepita ${p}°` : null].filter(Boolean).join(" · ")}
              </div>
              ${this.grafico(c)}`
          : html`<div class="nota">In questa stanza non c'è un termometro.</div>`
      }
      <jarvis-stanza
        .stanza=${s}
        .senzaTitolo=${true}
        .nonAggiornato=${false}
        .offline=${connessione.stato.stato !== "connesso"}
        .caricati=${r.caricati}
      ></jarvis-stanza>`;
  }
}
customElements.define("jarvis-pagina-stanza", JarvisPaginaStanza);
