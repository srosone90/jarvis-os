import { mdiClose, mdiMicrophone, mdiStop } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { icona, RiquadroSicuro, stileBase } from "./base";

/**
 * Barra della voce (F5, mockup docs/mockup-f5.html): stato in parole + un solo
 * pulsante rotondo che fa la cosa giusta per il momento (ferma l'ascolto,
 * interrompe la risposta, chiude l'errore). Nella chat prende il posto del
 * campo di testo; nel riquadro piccolo sta in fondo.
 *
 * L'anello intorno al pulsante segue il livello del microfono: si aggiorna
 * cambiando lo stile, senza ridisegnare il componente ~16 volte al secondo.
 */
export class JarvisVoce extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: 14px;
        min-height: 72px;
        min-width: 0;
        padding: 2px 2px 2px 8px;
      }
      .testo {
        flex: 1;
        min-width: 0;
        font-size: 17px;
        line-height: 1.35;
      }
      .testo small {
        display: block;
        margin-top: 2px;
        color: var(--attenuato);
        font-size: 13px;
      }
      .errore b {
        color: var(--avviso);
      }
      .lenta small {
        color: var(--avviso);
      }
      .pulsante {
        position: relative;
        flex: none;
        display: grid;
      }
      button {
        position: relative;
        flex: none;
        width: 64px;
        height: 64px;
        border: none;
        border-radius: 50%;
        font: inherit;
        color: var(--sfondo);
        background: var(--accento);
        display: grid;
        place-items: center;
        cursor: pointer;
        touch-action: manipulation;
      }
      button[disabled] {
        cursor: default;
      }
      button.fase-pensa,
      button.fase-risponde,
      button.fase-errore {
        background: var(--superficie-2);
        color: var(--testo);
      }
      .anello {
        position: absolute;
        inset: -7px;
        border-radius: 50%;
        border: 3px solid var(--accento);
        opacity: 0.55;
        transform: scale(var(--livello, 1));
        transition: transform 90ms linear;
        pointer-events: none;
      }
      .onde {
        display: inline-flex;
        gap: 3px;
        align-items: center;
        height: 24px;
      }
      .onde i {
        width: 4px;
        height: 6px;
        border-radius: 2px;
        background: var(--accento);
        animation: onda 0.9s ease-in-out infinite;
      }
      .onde i:nth-child(2) {
        animation-delay: 0.1s;
      }
      .onde i:nth-child(3) {
        animation-delay: 0.2s;
      }
      .onde i:nth-child(4) {
        animation-delay: 0.3s;
      }
      @keyframes onda {
        50% {
          height: 22px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .onde i {
          animation: none;
          height: 12px;
        }
        .anello {
          transition: none;
        }
      }
      @media (orientation: landscape) and (max-height: 559px) {
        :host {
          min-height: 56px;
          gap: 10px;
        }
        button {
          width: 52px;
          height: 52px;
        }
        .testo {
          font-size: 15px;
        }
      }
    `,
  ];

  private smetti: (() => void) | null = null;
  private smettiLivello: (() => void) | null = null;

  private get voce() {
    return connessione.voce;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = this.voce.ascolta(() => this.requestUpdate());
    this.smettiLivello = this.voce.ascoltaLivello((l) => {
      this.shadowRoot
        ?.querySelector<HTMLElement>(".anello")
        ?.style.setProperty("--livello", String(1 + Math.min(1, l) * 0.35));
    });
    // lo stato "più lento del solito" arriva dal motore dell'assistente
    this.smettiAssistente = connessione.assistente.ascolta(() => this.requestUpdate());
  }

  private smettiAssistente: (() => void) | null = null;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smettiLivello?.();
    this.smettiAssistente?.();
    this.smetti = this.smettiLivello = this.smettiAssistente = null;
  }

  protected disegna(): TemplateResult {
    const v = this.voce;
    const fase = v.fase;
    const lenta = fase === "pensa" && connessione.assistente.lenta;
    const mic = v.erroreMicrofono;
    const [testo, sotto, etichetta, simbolo]: [TemplateResult | string, string, string, string] =
      fase === "apertura"
        ? ["Apro il microfono…", "", "Annulla", mdiClose]
        : fase === "ascolto"
          ? [
              "Ti ascolto…",
              "Parla pure. Mi fermo quando smetti, o tocca il pulsante.",
              "Ferma l'ascolto",
              mdiStop,
            ]
          : fase === "pensa"
            ? [
                // risposta già scritta, HA sta preparando l'audio (tra intent-end e tts-end)
                v.turno?.risposta
                  ? "Preparo la risposta a voce…"
                  : lenta
                    ? "Ci sto mettendo più del solito…"
                    : "Sto pensando…",
                "",
                "Sto pensando",
                mdiMicrophone,
              ]
            : fase === "risponde"
              ? [
                  html`<span class="onde" aria-label="Sto rispondendo"><i></i><i></i><i></i><i></i></span>`,
                  "Tocca per interrompere",
                  "Interrompi la risposta",
                  mdiStop,
                ]
              : mic
                ? [html`<b>${mic.titolo}</b>`, mic.spiegazione, "Chiudi", mdiClose]
                : ["", "", "Chiudi", mdiClose];
    return html`<div
        class="testo ${mic && fase === "errore" ? "errore" : ""} ${lenta ? "lenta" : ""}"
        role="status"
        data-test="voce-stato"
      >
        ${testo}${sotto ? html`<small>${sotto}</small>` : ""}
      </div>
      <span class="pulsante">
        ${fase === "ascolto" ? html`<span class="anello"></span>` : ""}
        <button
          class="fase-${fase}"
          aria-label=${etichetta}
          ?disabled=${fase === "pensa"}
          data-test="voce-pulsante"
          @click=${() => v.ferma()}
        >
          ${icona(simbolo)}
        </button>
      </span>`;
  }
}
customElements.define("jarvis-voce", JarvisVoce);
