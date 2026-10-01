import { css, html, nothing, type TemplateResult } from "lit";
import { SOGLIA_OFFLINE_MS } from "../connessione/connessione";
import { ascoltaOrigine, statoOrigine, tornaAllaRiserva } from "../pwa/origine";
import { OsservaConnessione, RiquadroSicuro, stileBase } from "./base";
import "./jarvis-indicatore-parola";

const TESTO_STATO = {
  avvio: "Avvio",
  "login-richiesto": "Login richiesto",
  connessione: "In collegamento",
  connesso: "Connesso",
  riconnessione: "In riconnessione",
} as const;

/**
 * Stato della connessione, in due pezzi che il layout mette dove serve
 * (attributo `parte`):
 *  - "pallino": sempre visibile, discreto;
 *  - "banner": messaggio esplicito, solo quando HA manca da più di 10 s.
 * Nessuno dei due è un livello sovrapposto: stanno nel flusso della pagina.
 * Lo stato è sempre scritto anche a parole: mai informazioni solo col colore.
 */
export class JarvisConnessione extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .pallino {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--attenuato);
        white-space: nowrap;
      }
      .punto {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--ok);
      }
      .attesa .punto {
        background: var(--attenuato);
      }
      .offline .punto {
        background: var(--avviso);
      }
      .banner {
        background: var(--avviso-sfondo);
        color: var(--avviso-testo);
        border: 1px solid var(--avviso);
        border-radius: 12px;
        padding: 10px 16px;
        font-size: 16px;
        text-align: center;
      }
      .ritorno {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px 12px;
      }
      .ritorno button {
        min-height: 48px;
        padding: 0 16px;
        border-radius: 12px;
        border: 1px solid var(--avviso);
        background: var(--sfondo);
        color: var(--testo);
        font: inherit;
        cursor: pointer;
      }
    `,
  ];

  static override properties = { parte: { type: String } };
  declare parte: "pallino" | "banner";
  private readonly stato = new OsservaConnessione(this);
  private smettiOrigine: (() => void) | null = null;

  constructor() {
    super();
    this.parte = "pallino";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.smettiOrigine = ascoltaOrigine(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiOrigine?.();
    this.smettiOrigine = null;
  }

  protected disegna(): TemplateResult {
    const info = this.stato.info;
    const offline = this.stato.offline;
    if (this.parte === "banner") {
      const secondi =
        info.disconnessoDa !== null
          ? Math.round((Date.now() - info.disconnessoDa) / 1000)
          : SOGLIA_OFFLINE_MS / 1000;
      return html`<div class="banner" data-test="banner" role="alert">
        Home Assistant non raggiungibile da ${secondi} s · valori non aggiornati · riprovo da solo
        ${
          statoOrigine().riservaDisponibile
            ? html`<div class="ritorno" data-test="proposta-riserva">
                <span>Il link di riserva risponde (più lento).</span>
                <button @click=${() => tornaAllaRiserva()}>Torna al link di riserva</button>
              </div>`
            : nothing
        }
      </div>`;
    }
    const classe = info.stato === "connesso" ? "" : offline ? "offline" : "attesa";
    return html`<div
      class="pallino ${classe}"
      data-test="pallino"
      data-stato=${info.stato}
      role="status"
      aria-live="polite"
    >
      <span class="punto"></span><span>${offline ? "Offline" : TESTO_STATO[info.stato]}</span>
      <jarvis-indicatore-parola></jarvis-indicatore-parola>
    </div>`;
  }
}
customElements.define("jarvis-connessione", JarvisConnessione);
