import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { CONFIGURAZIONE } from "../configurazione";
import { OsservaConnessione } from "./base";
import "./jarvis-orologio";
import "./jarvis-meteo";
import "./jarvis-clima-stanza";
import "./jarvis-connessione";
import "./jarvis-accesso";
import "./jarvis-diagnostica";

/**
 * Schermata principale (F1): a sinistra orologio e meteo, a destra il clima
 * delle stanze. Scene, comandi e assistente arrivano nelle fasi successive.
 * Ogni riquadro è indipendente: se uno si guasta gli altri continuano.
 */
export class JarvisApp extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-columns: minmax(300px, 330px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
      overflow: hidden;
      color: var(--testo);
      background:
        radial-gradient(
          900px 500px at 0% 0%,
          color-mix(in srgb, var(--accento) 22%, transparent),
          transparent 70%
        ),
        var(--sfondo);
    }
    .sinistra {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 0;
    }
    .destra {
      display: grid;
      align-content: start;
      gap: 12px;
      padding-top: 28px;
      min-height: 0;
    }
    @media (max-width: 700px) {
      :host {
        grid-template-columns: 1fr;
        overflow: auto;
      }
    }
  `;

  static override properties = { diagnostica: { state: true } };
  declare diagnostica: boolean;
  private readonly connessione = new OsservaConnessione(this);

  constructor() {
    super();
    this.diagnostica = false;
    this.addEventListener("apri-diagnostica", () => {
      this.diagnostica = true;
    });
    this.addEventListener("chiudi-diagnostica", () => {
      this.diagnostica = false;
    });
  }

  protected override render(): TemplateResult {
    const offline = this.connessione.offline;
    const loginRichiesto = this.connessione.info.stato === "login-richiesto";
    return html`
      <jarvis-connessione></jarvis-connessione>
      <section class="sinistra">
        <jarvis-orologio></jarvis-orologio>
        <jarvis-meteo .nonAggiornato=${offline}></jarvis-meteo>
      </section>
      <section class="destra" aria-label="Clima in casa">
        ${CONFIGURAZIONE.climaInterno.map(
          (s) => html`<jarvis-clima-stanza .stanza=${s} .nonAggiornato=${offline}></jarvis-clima-stanza>`,
        )}
      </section>
      ${loginRichiesto ? html`<jarvis-accesso></jarvis-accesso>` : nothing}
      ${this.diagnostica ? html`<jarvis-diagnostica tabindex="-1"></jarvis-diagnostica>` : nothing}
    `;
  }
}
customElements.define("jarvis-app", JarvisApp);
