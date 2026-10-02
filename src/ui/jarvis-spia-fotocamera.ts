import { mdiCamera } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { icona, RiquadroSicuro, stileBase } from "./base";

/**
 * Spia della fotocamera (v0.6.0, punto 7.5): sempre visibile, in ogni
 * schermata (riposo e Hub compresi), mentre la fotocamera lavora. Piccola e
 * in alto al centro, dove non copre niente, e non prende i tocchi: si spegne
 * da Impostazioni → Fotocamera.
 */
export class JarvisSpiaFotocamera extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 50;
        pointer-events: none;
      }
      .spia {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px;
        border-radius: 10px;
        background: rgb(0 0 0 / 55%);
        color: #7fd1a4;
        font-size: 11px;
        line-height: 16px;
      }
      .spia .icona {
        width: 14px;
        height: 14px;
      }
      /* telefono stretto: solo l'icona, attaccata al bordo, per non coprire la colonna */
      @media (max-width: 499px) {
        :host {
          top: 0;
        }
        .spia {
          padding: 0 6px;
          border-radius: 0 0 8px 8px;
          line-height: 12px;
        }
        .spia .testo {
          display: none;
        }
        .spia .icona {
          width: 11px;
          height: 11px;
        }
      }
    `,
  ];

  private smetti: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.presenza.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
  }

  protected disegna(): TemplateResult {
    if (!connessione.presenza.attiva) return html`${nothing}`;
    return html`<div
      class="spia"
      role="status"
      aria-label="La fotocamera sta guardando"
      data-test="spia-fotocamera"
    >
      ${icona(mdiCamera)}<span class="testo">fotocamera</span>
    </div>`;
  }
}
customElements.define("jarvis-spia-fotocamera", JarvisSpiaFotocamera);
