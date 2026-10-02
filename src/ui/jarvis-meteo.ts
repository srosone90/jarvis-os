import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../comune";
import { connessione } from "../connessione";
import { log } from "../diagnostica";
import { osservaPrevisione } from "../meteo/previsione";
import { condizione, gradiInteri, numero, prossimiGiorni, type PrevisioneGiorno } from "../meteo/testi";
import { OsservaEntita, RiquadroSicuro, icona, stileBase } from "../interfaccia";

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
      .giorno-nome,
      .giorno-temp {
        display: block;
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
      /* compatto (schermi orizzontali bassi): temperatura sempre grande, previsione su due righe corte */
      @media (orientation: landscape) and (max-height: 559px) {
        .adesso {
          gap: 8px;
        }
        .adesso .icona {
          width: 32px;
          height: 32px;
        }
        .temp {
          font-size: 38px;
        }
        .cond {
          font-size: 12px;
        }
        .nuvole {
          display: none;
        }
        .prev {
          gap: 4px;
          margin-top: 6px;
        }
        .giorno {
          padding: 3px 2px;
          font-size: 12px;
          line-height: 1.2;
        }
        .giorno-nome {
          display: block;
        }
        .giorno b {
          display: inline;
          font-size: 16px;
        }
        .giorno .icona {
          width: 16px;
          height: 16px;
          display: inline-block;
          vertical-align: -3px;
          margin: 0 0 0 2px;
        }
      }
      .mancante {
        color: var(--attenuato);
        font-size: 16px;
      }
    `,
  ];

  static override properties = {
    nonAggiornato: { type: Boolean },
    senzaGiorni: { type: Boolean },
    previsione: { state: true },
  };
  declare nonAggiornato: boolean;
  /** Sul tablet con timer attivi: i prossimi giorni lasciano il posto ai timer (v0.4.5). */
  declare senzaGiorni: boolean;
  declare previsione: PrevisioneGiorno[] | null;

  private smettiPrevisione: (() => Promise<void>) | null = null;
  private smettiConnessione: (() => void) | null = null;
  private connPrevisione: unknown = null;
  private segnalataMancanza = false;

  constructor() {
    super();
    this.nonAggiornato = false;
    this.senzaGiorni = false;
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
          ${nuvole !== null ? html`<span class="nuvole">nuvole ${nuvole}%<br /></span>` : nothing}
          ${oggi ? html`max ${oggi.massima ?? "—"} · min ${oggi.minima ?? "—"}` : nothing}
          ${this.nonAggiornato ? html`<br /><span class="non-aggiornato">non aggiornato</span>` : nothing}
        </div>
      </div>
      ${
        prossimi.length && !this.senzaGiorni
          ? html`<div class="prev" data-test="previsione">
              ${prossimi.map(
                (g) =>
                  html`<div
                    class="giorno"
                    aria-label="${g.etichetta}: ${g.condizione.testo}, max ${g.massima}, min ${g.minima}"
                  >
                    <span class="giorno-nome">${g.etichetta}${icona(g.condizione.icona)}</span>
                    <span class="giorno-temp"><b>${g.massima ?? "—"}</b> ${g.minima ?? ""}</span>
                  </div>`,
              )}
            </div>`
          : nothing
      }
    `;
  }
}
customElements.define("jarvis-meteo", JarvisMeteo);
