import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { attivaScena, ConfermaScena } from "../scene/attiva";
import { sceneDa, type Scena } from "../scene/scene";
import { schermate } from "../pagine/preferenze";
import { icona, OsservaEntita, RiquadroSicuro, stileBase } from "./base";
import { stilePagina } from "./stile-pagina";

/**
 * Schermata Scene (v0.5.7, mockup N2 "5 · Scene"): un tocco avvia la scena
 * (lo script di HA). Mentre lo script gira la scena è evidenziata col suo
 * colore. Con «chiedi conferma» (v0.5.8, spento di serie) serve un secondo
 * tocco. Quali scene e in che ordine: Impostazioni → Schermate. Le routine
 * non si creano dal pannello (decisione del mockup).
 */
export class JarvisPaginaScene extends RiquadroSicuro {
  static override properties = { inCorso: { state: true } };
  declare inCorso: string | null;

  static override styles = [
    stileBase,
    stilePagina,
    css`
      .scene {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
      }
      button.scena {
        all: unset;
        box-sizing: border-box;
        min-height: 120px;
        padding: 14px 16px;
        border-radius: var(--raggio);
        background: var(--superficie);
        border: 1px solid #2b303a;
        display: flex;
        flex-direction: column;
        gap: 6px;
        cursor: pointer;
        touch-action: manipulation;
        min-width: 0;
      }
      button.scena[aria-pressed="true"] {
        border-color: var(--c);
        background: color-mix(in srgb, var(--c) 18%, var(--superficie));
      }
      button.scena:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .scena b {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 19px;
        font-weight: 600;
      }
      .scena .icona {
        width: 28px;
        height: 28px;
        color: var(--c);
      }
      .scena small {
        color: var(--attenuato);
        font-size: 15px;
        overflow-wrap: break-word;
      }
      .scena .stato {
        color: var(--c);
      }
    `,
  ];

  constructor() {
    super();
    this.inCorso = null;
    new OsservaEntita(this, () => schermate.valori.scene);
  }

  private smetti: (() => void)[] = [];
  private readonly conferma = new ConfermaScena(() => this.requestUpdate());
  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [connessione.ascolta(ridisegna), schermate.ascolta(ridisegna)];
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    this.conferma.annulla();
  }

  private async attiva(s: Scena): Promise<void> {
    const v = schermate.valori;
    if (!this.conferma.tocca(s.entita, v.sceneConferma, v.sceneConfermaSecondi * 1000)) return;
    this.inCorso = s.entita;
    await attivaScena(s);
    this.inCorso = null;
  }

  protected disegna(): TemplateResult {
    const elenco = schermate.valori.scene;
    const scene = sceneDa(elenco, connessione.negozio.tutte);
    const scollegato = connessione.stato.stato !== "connesso";
    return html`<h1>Scene</h1>
      ${
        scene.length
          ? html`<div class="scene" data-test="scene-elenco">
              ${scene.map(
                (s) =>
                  html`<button
                    class="scena"
                    style="--c: ${s.colore}"
                    data-test="scena"
                    aria-pressed=${s.inCorso ? "true" : "false"}
                    aria-label=${this.conferma.inAttesa(s.entita) ? `Conferma ${s.nome}` : s.nome}
                    data-conferma=${this.conferma.inAttesa(s.entita) ? "si" : "no"}
                    ?disabled=${scollegato || this.inCorso !== null || (connessione.negozio.pronto && !s.esiste)}
                    @click=${() => void this.attiva(s)}
                  >
                    <b>${icona(s.icona)}${s.nome}</b>
                    ${s.descrizione ? html`<small>${s.descrizione}</small>` : nothing}
                    ${
                      this.conferma.inAttesa(s.entita)
                        ? html`<small class="stato" data-test="scena-tocca-ancora"
                            >Tocca ancora per avviarla</small
                          >`
                        : nothing
                    }
                    ${
                      connessione.negozio.pronto && !s.esiste
                        ? html`<small data-test="scena-mancante"
                            >${s.entita} non c'è in Home Assistant</small
                          >`
                        : s.inCorso
                          ? html`<small class="stato">in corso…</small>`
                          : nothing
                    }
                  </button>`,
              )}
            </div>`
          : html`<div class="nota">Nessuna scena scelta: si aggiungono in Impostazioni → Schermate.</div>`
      }
      <div class="nota">
        Le routine («sveglia alle 7 con il meteo») non si creano dal pannello: si scrivono in Home Assistant.
      </div>`;
  }
}
customElements.define("jarvis-pagina-scene", JarvisPaginaScene);
