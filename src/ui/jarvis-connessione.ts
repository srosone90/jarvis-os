import { css, html, nothing, type TemplateResult } from "lit";
import { SOGLIA_OFFLINE_MS } from "../connessione/connessione";
import { OsservaConnessione, RiquadroSicuro, stileBase } from "./base";

const TESTO_STATO = {
  avvio: "Avvio",
  "login-richiesto": "Login richiesto",
  connessione: "In collegamento",
  connesso: "Connesso",
  riconnessione: "In riconnessione",
} as const;

/**
 * Pallino di stato sempre visibile (discreto) + banner esplicito solo quando
 * Home Assistant manca da più di 10 secondi. Lo stato è sempre scritto anche a
 * parole: mai informazioni affidate solo al colore.
 */
export class JarvisConnessione extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: contents;
      }
      .pallino {
        position: absolute;
        top: 14px;
        right: 22px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--attenuato);
        z-index: 3;
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
        position: absolute;
        left: 50%;
        bottom: 26px;
        transform: translateX(-50%);
        background: var(--avviso-sfondo);
        color: var(--avviso-testo);
        border: 1px solid var(--avviso);
        border-radius: 12px;
        padding: 10px 16px;
        font-size: 16px;
        z-index: 5;
        white-space: nowrap;
        max-width: calc(100% - 32px);
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];

  private readonly stato = new OsservaConnessione(this);

  protected disegna(): TemplateResult {
    const info = this.stato.info;
    const offline = this.stato.offline;
    const classe = info.stato === "connesso" ? "" : offline ? "offline" : "attesa";
    const secondi =
      info.disconnessoDa !== null
        ? Math.round((Date.now() - info.disconnessoDa) / 1000)
        : SOGLIA_OFFLINE_MS / 1000;
    return html`
      <div
        class="pallino ${classe}"
        data-test="pallino"
        data-stato=${info.stato}
        role="status"
        aria-live="polite"
      >
        <span class="punto"></span><span>${offline ? "Offline" : TESTO_STATO[info.stato]}</span>
      </div>
      ${
        offline && info.stato !== "login-richiesto"
          ? html`<div class="banner" data-test="banner" role="alert">
              Home Assistant non raggiungibile da ${secondi} s · valori non aggiornati · riprovo da solo
            </div>`
          : nothing
      }
    `;
  }
}
customElements.define("jarvis-connessione", JarvisConnessione);
