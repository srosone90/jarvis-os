import { css, html, nothing, type TemplateResult } from "lit";
import { origineHA, vaiAlLogin } from "../connessione/autenticazione";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { RiquadroSicuro, stileBase } from "./base";

/**
 * Schermata di collegamento: il login si fa una volta per indirizzo. Prima di
 * mandare il tablet alla pagina di login si controlla che HA risponda, così un
 * server spento non lascia il pannello su una pagina d'errore del browser.
 */
export class JarvisAccesso extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        inset: 0;
        overflow: auto;
        display: grid;
        place-items: center;
        background: var(--sfondo);
        z-index: 20;
      }
      .scheda {
        max-width: 520px;
        padding: 32px;
        text-align: center;
      }
      h1 {
        font-size: 32px;
        font-weight: 300;
        margin: 0 0 12px;
      }
      p {
        color: var(--attenuato);
        font-size: 18px;
        line-height: 1.4;
      }
      button {
        margin-top: 16px;
        min-height: 56px;
        padding: 0 32px;
        border-radius: 28px;
        border: none;
        background: var(--accento);
        color: var(--sfondo);
        font: inherit;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
      }
      button[disabled] {
        opacity: 0.6;
      }
      .errore {
        color: var(--avviso);
      }
    `,
  ];

  static override properties = { inCorso: { state: true }, errore: { state: true } };
  declare inCorso: boolean;
  declare errore: string | null;

  constructor() {
    super();
    this.inCorso = false;
    this.errore = null;
  }

  private async accedi(): Promise<void> {
    this.inCorso = true;
    this.errore = null;
    try {
      const risposta = await fetch(`${origineHA()}/auth/providers`, { cache: "no-store" });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
      await vaiAlLogin();
    } catch (errore) {
      log.errore(`Home Assistant non raggiungibile per il login: ${descriviErrore(errore)}`);
      this.errore = "Home Assistant non risponde. Controlla che sia acceso e riprova.";
      this.inCorso = false;
    }
  }

  protected disegna(): TemplateResult {
    const motivo = connessione.stato.motivoLogin;
    return html`<div class="scheda" data-test="accesso">
      <h1>Collega Jarvis a Home Assistant</h1>
      <p>
        ${motivo ?? "Serve un solo accesso con il tuo utente di Home Assistant. Poi il pannello resta collegato."}
      </p>
      <p>Indirizzo: <b>${origineHA()}</b></p>
      ${this.errore ? html`<p class="errore" role="alert">${this.errore}</p>` : nothing}
      <button ?disabled=${this.inCorso} @click=${() => void this.accedi()}>
        ${this.inCorso ? "Collegamento…" : "Accedi"}
      </button>
    </div>`;
  }
}
customElements.define("jarvis-accesso", JarvisAccesso);
