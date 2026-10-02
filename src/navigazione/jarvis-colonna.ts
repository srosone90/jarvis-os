import { mdiCircleSlice8 } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import { navigatore } from "./istanza";
import { vista } from "../riposo";
import { RiquadroSicuro, icona, stileBase } from "../interfaccia";
import { ICONE_SCHERMATE } from "./icone-schermate";

/**
 * Colonna di navigazione N2 (v0.5.5): le schermate principali, nell'ordine
 * scelto in Impostazioni → Schermate, e in fondo l'Hub. Sul telefono in
 * verticale diventa una riga in alto (non c'è spazio di lato). Una schermata
 * aperta da «Altro» (che nella colonna non c'è) accende Altro.
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
        /* con tante voci scorre dentro, senza spingere fuori l'Hub */
        overflow-y: auto;
        overflow-x: hidden;
        background: #10131a;
        border-right: 1px solid #232834;
      }
      button {
        all: unset;
        box-sizing: border-box;
        flex: none;
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
      /* telefono in verticale: una riga in alto; con tante voci va su due righe (mai di lato) */
      @media (max-width: 699px) {
        :host {
          flex-direction: row;
          flex-wrap: wrap;
          justify-content: space-around;
          padding: 4px;
          overflow: visible;
          border-right: none;
          border-bottom: 1px solid #232834;
          border-radius: 14px;
        }
        button {
          flex: 1 1 0;
          min-width: 52px;
          width: auto;
          min-height: 52px;
        }
        .hub {
          margin-top: 0;
        }
      }
      /* telefono stretto: 6 voci (le 5 di serie + Hub) stanno in una riga sola */
      @media (max-width: 379px) {
        button {
          min-width: 44px;
          font-size: 11px;
        }
        .icona {
          width: 24px;
          height: 24px;
        }
      }
      /* tablet: stretta, lascia spazio alle stanze */
      @media (min-width: 900px) and (min-height: 560px) {
        :host {
          padding: 12px 6px;
        }
        /* 52 px: anche con tutte le 9 schermate nella colonna l'Hub resta in vista */
        button {
          width: 62px;
          min-height: 52px;
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
    const colonna = navigatore.colonna;
    const principale = navigatore.principale;
    // aperta da Altro: si accende Altro
    const attuale = colonna.some((v) => v.id === principale) ? principale : "altro";
    return html`<nav aria-label="Schermate" style="display: contents">
      ${colonna.map(
        (v) =>
          html`<button
            data-test="colonna-${v.id}"
            aria-current=${v.id === attuale ? "page" : "false"}
            @click=${() => navigatore.vai({ tipo: v.id }, "colonna")}
          >
            ${icona(ICONE_SCHERMATE[v.id])}${v.titolo}
          </button>`,
      )}
      <button class="hub" data-test="colonna-hub" @click=${() => vista.vai("hub", "colonna")}>
        ${icona(mdiCircleSlice8)}Hub
      </button>
    </nav>`;
  }
}
customElements.define("jarvis-colonna", JarvisColonna);
