import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { log } from "../diagnostica/log";
import { osservaPrevisione } from "../meteo/previsione";
import { condizione, gradiInteri, numero, prossimiGiorni, type PrevisioneGiorno } from "../meteo/testi";
import { icona, OsservaEntita, RiquadroSicuro, stileBase } from "./base";

/**
 * Meteo attuale + previsione dei prossimi 4 giorni, da weather.forecast_casa.
 * La previsione arriva in push; si risottoscrive quando cambia la connessione.
 */
export class JarvisMeteo extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
      }
      .adesso {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .adesso .icona {
        width: 52px;
        height: 52px;
        color: var(--accento);
      }
      .temp {
        font-size: 48px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }
      .cond {
        font-size: 16px;
        color: var(--attenuato);
        line-height: 1.35;
      }
      .prev {
        display: flex;
        gap: 8px;
        margin-top: 14px;
      }
      .giorno {
        flex: 1;
        padding: 6px 4px;
        text-align: center;
        font-size: 14px;
        color: var(--attenuato);
        border-radius: 12px;
        background: var(--superficie);
      }
      .giorno b {
        display: block;
        color: var(--testo);
        font-size: 18px;
        font-weight: 500;
      }
      .giorno .icona {
        width: 22px;
        height: 22px;
        display: block;
        margin: 2px auto;
      }
      .mancante {
        color: var(--attenuato);
        font-size: 16px;
      }
    `,
  ];

  static override properties = { nonAggiornato: { type: Boolean }, previsione: { state: true } };
  declare nonAggiornato: boolean;
  declare previsione: PrevisioneGiorno[] | null;

  private smettiPrevisione: (() => Promise<void>) | null = null;
  private smettiConnessione: (() => void) | null = null;
  private connPrevisione: unknown = null;
  private segnalataMancanza = false;

  constructor() {
    super();
    this.nonAggiornato = false;
    this.previsione = null;
    new OsservaEntita(this, () => [PREFERENZE.meteo]);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.smettiConnessione = connessione.ascolta(() => void this.sottoscrivi());
    void this.sottoscrivi();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiConnessione?.();
    void this.smettiPrevisione?.();
    this.smettiPrevisione = null;
    this.connPrevisione = null;
  }

  /** Una sola sottoscrizione per oggetto Connection (la libreria la rinnova da sola). */
  private async sottoscrivi(): Promise<void> {
    const conn = connessione.conn;
    if (!conn || conn === this.connPrevisione || connessione.stato.stato !== "connesso") return;
    this.connPrevisione = conn;
    void this.smettiPrevisione?.();
    this.smettiPrevisione = await osservaPrevisione(conn, PREFERENZE.meteo, (p) => {
      this.previsione = p;
    });
  }

  protected disegna(): TemplateResult {
    const negozio = connessione.negozio;
    const meteo = negozio.entitaDi(PREFERENZE.meteo);
    if (!meteo) {
      if (!negozio.pronto) return html`<div class="mancante">In attesa di Home Assistant…</div>`;
      if (!this.segnalataMancanza) log.errore(`Entità meteo non trovata: ${PREFERENZE.meteo}`);
      this.segnalataMancanza = true;
      return html`<div class="mancante" role="status">
        Meteo non disponibile (${PREFERENZE.meteo} non trovato)
      </div>`;
    }
    this.segnalataMancanza = false;
    const c = condizione(meteo.state);
    const temp = gradiInteri(meteo.attributes["temperature"]);
    const nuvole = numero(meteo.attributes["cloud_coverage"], 0);
    const { oggi, prossimi } = prossimiGiorni(this.previsione ?? [], new Date());
    const classe = this.nonAggiornato ? "non-aggiornato" : "";
    return html`
      <div class="adesso">
        ${icona(c.icona)}
        <div class="temp ${classe}" data-test="meteo-temp">${temp ?? "—"}</div>
        <div class="cond">
          <span data-test="meteo-cond">${c.testo}</span><br />
          ${nuvole !== null ? html`nuvole ${nuvole}%<br />` : nothing}
          ${oggi ? html`max ${oggi.massima ?? "—"} · min ${oggi.minima ?? "—"}` : nothing}
          ${this.nonAggiornato ? html`<br /><span class="non-aggiornato">non aggiornato</span>` : nothing}
        </div>
      </div>
      ${
        prossimi.length
          ? html`<div class="prev" data-test="previsione">
              ${prossimi.map(
                (g) =>
                  html`<div
                    class="giorno"
                    aria-label="${g.etichetta}: ${g.condizione.testo}, max ${g.massima}, min ${g.minima}"
                  >
                    ${g.etichetta}${icona(g.condizione.icona)}<b>${g.massima ?? "—"}</b>${g.minima ?? ""}
                  </div>`,
              )}
            </div>`
          : nothing
      }
    `;
  }
}
customElements.define("jarvis-meteo", JarvisMeteo);
