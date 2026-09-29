import { css, html, type TemplateResult } from "lit";
import { avvisi } from "../comandi/avvisi";
import { RiquadroSicuro, stileBase } from "./base";

/** Avvisi brevi dei comandi, in alto al centro; spariscono da soli. */
export class JarvisAvvisi extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 6;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(560px, calc(100% - 32px));
        pointer-events: none;
      }
      .avviso {
        background: var(--superficie-2);
        border: 1px solid #343a46;
        border-radius: 12px;
        padding: 10px 16px;
        font-size: 15px;
        box-shadow: 0 8px 24px #0008;
      }
      .errore {
        border-color: var(--avviso);
        color: var(--avviso-testo);
        background: var(--avviso-sfondo);
      }
    `,
  ];
  private smetti: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = avvisi.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
  }

  protected disegna(): TemplateResult {
    return html`${avvisi.attivi.map(
      (a) =>
        html`<div
          class="avviso ${a.tipo}"
          role=${a.tipo === "errore" ? "alert" : "status"}
          data-test="avviso"
        >
          ${a.testo}
        </div>`,
    )}`;
  }
}
customElements.define("jarvis-avvisi", JarvisAvvisi);
