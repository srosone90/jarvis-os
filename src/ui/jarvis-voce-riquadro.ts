import { mdiClose } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { messaggioErrore } from "../assistente/messaggi";
import { connessione } from "../connessione/connessione";
import { icona, RiquadroSicuro, stileBase } from "./base";
import "./jarvis-voce";

/**
 * Riquadro piccolo della voce (deciso il 29/09): chat chiusa + microfono della
 * barra. Mostra cosa ho sentito e la risposta; toccandolo la conversazione
 * passa nella chat. Sparisce da solo qualche secondo dopo la risposta. Lo
 * userà anche "Ehi Jarvis" quando arriverà.
 *
 * È un pannello sovrapposto apposta (come gli avvisi): sul tablet sta sopra le
 * stanze, a destra, e non copre mai la barra; sul telefono in fondo allo schermo.
 */
export class JarvisVoceRiquadro extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 15;
        max-height: 70dvh;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        background: color-mix(in srgb, var(--superficie) 97%, #000);
        border: 1px solid #2b303a;
        border-radius: 20px;
        box-shadow: 0 16px 48px #000b;
      }
      /* tablet: a destra, sopra la barra dell'assistente (alta 60 px + 16 di margine) */
      @media (min-width: 900px) and (min-height: 560px) {
        :host {
          left: auto;
          right: 22px;
          bottom: 92px;
          width: 440px;
        }
      }
      .testa {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .testa b {
        flex: 1;
        font-size: 16px;
      }
      .chiudi {
        width: 48px;
        height: 48px;
        border: none;
        border-radius: 50%;
        background: var(--superficie-2);
        color: var(--testo);
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .chiudi .icona {
        width: 22px;
        height: 22px;
      }
      .contenuto {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow-y: auto;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        padding: 0;
        cursor: pointer;
      }
      .io {
        align-self: flex-end;
        max-width: 90%;
        padding: 8px 12px;
        border-radius: 16px;
        background: color-mix(in srgb, var(--accento) 30%, var(--superficie-2));
        font-size: 16px;
        overflow-wrap: break-word;
      }
      .jarvis {
        align-self: flex-start;
        max-width: 100%;
        padding: 8px 12px;
        border-radius: 16px;
        background: var(--superficie-2);
        font-size: 16px;
        line-height: 1.4;
        overflow-wrap: break-word;
      }
      .errore b {
        color: var(--avviso);
      }
      .errore {
        font-size: 15px;
        line-height: 1.4;
      }
      .apri {
        color: var(--attenuato);
        font-size: 13px;
      }
    `,
  ];

  private smetti: (() => void) | null = null;
  private smettiAssistente: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.voce.ascolta(() => this.requestUpdate());
    this.smettiAssistente = connessione.assistente.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smettiAssistente?.();
    this.smetti = this.smettiAssistente = null;
  }

  private apriChat(): void {
    connessione.voce.spostaInChat();
    this.dispatchEvent(new CustomEvent("apri-chat", { bubbles: true, composed: true }));
  }

  private chiudi(): void {
    const v = connessione.voce;
    // mai lasciare il microfono aperto dietro un riquadro chiuso
    if (v.fase === "apertura" || v.fase === "ascolto" || v.fase === "risponde" || v.fase === "errore")
      v.ferma();
    v.nascondiRiquadro();
  }

  protected disegna(): TemplateResult {
    const t = connessione.voce.turno;
    const errore = t?.fase === "errore" && t.errore ? messaggioErrore(t.errore, t.voce && !t.domanda) : null;
    const contenuto = t?.domanda || t?.risposta || errore;
    return html`
      <div class="testa">
        <b>Jarvis</b>
        <button class="chiudi" aria-label="Chiudi il riquadro" @click=${() => this.chiudi()}>
          ${icona(mdiClose)}
        </button>
      </div>
      ${
        contenuto
          ? html`<button class="contenuto" data-test="riquadro-contenuto" @click=${() => this.apriChat()}>
              ${t?.domanda ? html`<span class="io" data-test="domanda">${t.domanda}</span>` : nothing}
              ${t?.risposta ? html`<span class="jarvis" data-test="risposta">${t.risposta}</span>` : nothing}
              ${
                errore
                  ? html`<span class="errore" role="alert" data-test="errore-assistente"
                      ><b>${errore.titolo}</b><br />${errore.spiegazione}</span
                    >`
                  : nothing
              }
              <span class="apri">Tocca per aprire la chat</span>
            </button>`
          : nothing
      }
      ${
        connessione.voce.fase !== "spenta" &&
        (connessione.voce.fase !== "errore" || connessione.voce.erroreMicrofono)
          ? html`<jarvis-voce data-test="voce"></jarvis-voce>`
          : nothing
      }
    `;
  }
}
customElements.define("jarvis-voce-riquadro", JarvisVoceRiquadro);
