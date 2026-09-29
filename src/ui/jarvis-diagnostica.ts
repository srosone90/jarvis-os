import { css, html, nothing, type TemplateResult } from "lit";
import { dimenticaLogin, origineHA } from "../connessione/autenticazione";
import { connessione } from "../connessione/connessione";
import { log, type VoceLog } from "../diagnostica/log";
import { statoAggiornamento, applicaAggiornamento } from "../pwa/aggiornamenti";
import { OsservaConnessione, RiquadroSicuro, stileBase } from "./base";

/**
 * Schermata diagnostica nascosta (orologio tenuto premuto 3 s): versione,
 * indirizzo in uso, stato della connessione, latenza, log degli errori.
 */
export class JarvisDiagnostica extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        position: absolute;
        inset: 0;
        background: color-mix(in srgb, var(--sfondo) 94%, transparent);
        z-index: 30;
        display: flex;
        flex-direction: column;
        padding: 20px 24px;
        gap: 12px;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h1 {
        font-size: 22px;
        margin: 0;
        font-weight: 600;
      }
      .azioni {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      button {
        min-height: 48px;
        min-width: 48px;
        padding: 0 16px;
        border-radius: 12px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 15px;
        cursor: pointer;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr max-content 1fr;
        gap: 6px 16px;
        margin: 0;
        font-size: 15px;
      }
      dt {
        color: var(--attenuato);
      }
      dd {
        margin: 0;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow: auto;
        flex: 1;
        font-size: 14px;
        font-family: ui-monospace, monospace;
        background: var(--superficie);
        border-radius: 12px;
      }
      li {
        padding: 6px 12px;
        border-bottom: 1px solid #262a33;
      }
      .errore {
        color: #ff8a80;
      }
      .avviso {
        color: var(--avviso);
      }
    `,
  ];

  private readonly stato = new OsservaConnessione(this);
  private smettiLog: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smettiLog = log.ascolta(() => this.requestUpdate());
    // "da quanto" e la latenza cambiano col tempo: si ridisegna ogni secondo solo mentre è aperta
    this.timer = setInterval(() => this.requestUpdate(), 1000);
    void connessione.misuraLatenza();
    this.addEventListener("keydown", this.suTasto);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiLog?.();
    clearInterval(this.timer);
    this.removeEventListener("keydown", this.suTasto);
  }

  private readonly suTasto = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.chiudi();
  };

  private chiudi(): void {
    this.dispatchEvent(new CustomEvent("chiudi-diagnostica", { bubbles: true, composed: true }));
  }

  private esci(): void {
    dimenticaLogin();
    log.info("Login dimenticato dalla diagnostica");
    location.reload();
  }

  protected disegna(): TemplateResult {
    const info = this.stato.info;
    const agg = statoAggiornamento();
    const durata = (da: number | null): string =>
      da === null ? "—" : `${Math.round((Date.now() - da) / 1000)} s`;
    const ora = (v: VoceLog): string =>
      new Date(v.t).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    return html`
      <header>
        <h1>Diagnostica</h1>
        <div class="azioni">
          ${
            agg === "pronto"
              ? html`<button @click=${() => applicaAggiornamento()}>Aggiorna ora</button>`
              : nothing
          }
          <button @click=${() => location.reload()}>Ricarica app</button>
          <button @click=${() => this.esci()}>Esci (dimentica login)</button>
          <button data-test="chiudi-diagnostica" @click=${() => this.chiudi()}>Chiudi</button>
        </div>
      </header>
      <dl data-test="diagnostica">
        <dt>Versione</dt>
        <dd data-test="versione">${__VERSIONE__}</dd>
        <dt>Indirizzo</dt>
        <dd data-test="origine">${origineHA()}</dd>
        <dt>Stato</dt>
        <dd data-test="diag-stato">${info.stato}</dd>
        <dt>Latenza WebSocket</dt>
        <dd data-test="latenza">${info.latenzaMs !== null ? `${info.latenzaMs} ms` : "—"}</dd>
        <dt>Connesso da</dt>
        <dd>${durata(info.connessoDa)}</dd>
        <dt>Disconnesso da</dt>
        <dd>${durata(info.disconnessoDa)}</dd>
        <dt>Riconnessioni</dt>
        <dd data-test="riconnessioni">${info.riconnessioni}</dd>
        <dt>Home Assistant</dt>
        <dd>${info.versioneHA ?? "—"}</dd>
        <dt>Entità ricevute</dt>
        <dd>${connessione.negozio.quante}</dd>
        <dt>Aggiornamento app</dt>
        <dd data-test="aggiornamento">
          ${
            {
              nessuno: "nessuno",
              pronto: "pronto (si applica alle 04:00)",
              "non-supportato": "service worker non attivo",
            }[agg]
          }
        </dd>
      </dl>
      <ol data-test="log" aria-label="Log degli errori">
        ${log.voci().map((v) => html`<li class=${v.livello}>${ora(v)} · ${v.livello} · ${v.messaggio}</li>`)}
        ${log.voci().length === 0 ? html`<li>Nessun evento registrato</li>` : nothing}
      </ol>
    `;
  }
}
customElements.define("jarvis-diagnostica", JarvisDiagnostica);
