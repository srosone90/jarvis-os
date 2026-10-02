import { mdiCircleSlice8, mdiCogOutline } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import { navigatore } from "../navigazione/istanza";
import { vista } from "../vista/istanza";
import { RiquadroSicuro, icona, stileBase, stilePagina } from "../interfaccia";
import { ICONE_SCHERMATE } from "./icone-schermate";

/**
 * Schermata Altro (v0.5.7, mockup N2: il riquadro "Altro" della colonna):
 * tutte le schermate accese, nell'ordine scelto, più Impostazioni e Hub. È
 * il secondo modo di aprire le impostazioni, oltre all'orologio tenuto
 * premuto in Casa.
 */
export class JarvisPaginaAltro extends RiquadroSicuro {
  static override styles = [
    stileBase,
    stilePagina,
    css`
      .griglia {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
        gap: 12px;
      }
      button {
        all: unset;
        box-sizing: border-box;
        min-height: 96px;
        padding: 12px 8px;
        border-radius: var(--raggio);
        background: var(--superficie);
        border: 1px solid #2b303a;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 17px;
        text-align: center;
        cursor: pointer;
        touch-action: manipulation;
        min-width: 0;
        overflow-wrap: break-word;
      }
      button:focus-visible {
        outline: 2px solid var(--accento);
      }
      .icona {
        width: 32px;
        height: 32px;
        color: var(--accento);
      }
      @media (orientation: landscape) and (max-height: 559px) {
        button {
          min-height: 72px;
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
    return html`<h1>Altro</h1>
      <nav class="griglia" aria-label="Tutte le schermate" data-test="altro-griglia">
        ${navigatore.altro.map(
          (s) =>
            html`<button data-test="altro-${s.id}" @click=${() => navigatore.vai({ tipo: s.id }, "Altro")}>
              ${icona(ICONE_SCHERMATE[s.id])}${s.titolo}
            </button>`,
        )}
        <button
          data-test="altro-impostazioni"
          @click=${() =>
            // lo stesso evento dell'orologio tenuto premuto (nome storico)
            this.dispatchEvent(new CustomEvent("apri-diagnostica", { bubbles: true, composed: true }))}
        >
          ${icona(mdiCogOutline)}Impostazioni
        </button>
        <button data-test="altro-hub" @click=${() => vista.vai("hub", "Altro")}>
          ${icona(mdiCircleSlice8)}Hub
        </button>
      </nav>`;
  }
}
customElements.define("jarvis-pagina-altro", JarvisPaginaAltro);
