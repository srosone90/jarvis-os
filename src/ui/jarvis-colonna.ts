import { mdiCircleSlice8, mdiHome, mdiWeatherPartlyCloudy } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import { navigatore } from "../navigazione/istanza";
import type { Principale } from "../navigazione/navigazione";
import { vista } from "../vista/istanza";
import { icona, RiquadroSicuro, stileBase } from "./base";

const ICONE: Record<Principale, string> = {
  casa: mdiHome,
  meteo: mdiWeatherPartlyCloudy,
};

/**
 * Colonna di navigazione N2 (v0.5.5): le schermate principali, nell'ordine
 * scelto in Impostazioni → Schermate, e in fondo l'Hub. Sul telefono in
 * verticale diventa una riga in alto (non c'è spazio di lato).
 */
export class JarvisColonna extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
        min-height: 0;
        background: #10131a;
        border-right: 1px solid #232834;
      }
      button {
        all: unset;
        box-sizing: border-box;
        width: 72px;
        min-height: 60px;
        padding: 6px 0;
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        font-size: 12px;
        color: var(--attenuato);
        cursor: pointer;
        touch-action: manipulation;
      }
      button:focus-visible {
        outline: 2px solid var(--accento);
      }
      button[aria-current="page"] {
        background: #1c2640;
        color: #fff;
      }
      button[aria-current="page"] .icona {
        color: var(--accento);
      }
      .icona {
        width: 26px;
        height: 26px;
      }
      .hub {
        margin-top: auto;
      }
      /* telefono in verticale: una riga in alto */
      @media (max-width: 699px) {
        :host {
          flex-direction: row;
          justify-content: space-around;
          padding: 4px;
          border-right: none;
          border-bottom: 1px solid #232834;
          border-radius: 14px;
        }
        button {
          flex: 1 1 0;
          width: auto;
          min-height: 52px;
        }
        .hub {
          margin-top: 0;
        }
      }
      /* tablet: stretta, lascia spazio alle stanze */
      @media (min-width: 900px) and (min-height: 560px) {
        :host {
          padding: 12px 6px;
        }
        button {
          width: 62px;
        }
      }
      @media (orientation: landscape) and (max-height: 559px) {
        button {
          width: 64px;
          min-height: 48px;
          font-size: 11px;
        }
        .icona {
          width: 22px;
          height: 22px;
        }
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = navigatore.ascolta(() => this.requestUpdate());
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
  }
  private smetti: (() => void) | null = null;

  protected disegna(): TemplateResult {
    const attuale = navigatore.principale;
    return html`<nav aria-label="Schermate" style="display: contents">
      ${navigatore.colonna.map(
        (v) =>
          html`<button
            data-test="colonna-${v.id}"
            aria-current=${v.id === attuale ? "page" : "false"}
            @click=${() => navigatore.vai({ tipo: v.id }, "colonna")}
          >
            ${icona(ICONE[v.id])}${v.titolo}
          </button>`,
      )}
      <button class="hub" data-test="colonna-hub" @click=${() => vista.vai("hub", "colonna")}>
        ${icona(mdiCircleSlice8)}Hub
      </button>
    </nav>`;
  }
}
customElements.define("jarvis-colonna", JarvisColonna);
