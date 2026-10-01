import { css, html, nothing, type TemplateResult } from "lit";
import { dimenticaLogin, origineHA } from "../connessione/autenticazione";
import { connessione } from "../connessione/connessione";
import { log, type VoceLog } from "../diagnostica/log";
import { statoAggiornamento, applicaAggiornamento, versioneSulServer } from "../pwa/aggiornamenti";
import { statoOrigine } from "../pwa/origine";
import { OsservaConnessione, RiquadroSicuro, stileBase } from "./base";
import "./jarvis-parola-dal-vivo";

/**
 * Diagnostica: versione, indirizzo in uso, stato della connessione, latenza,
 * log degli errori. Dalla fase G (v0.4.8) è l'ultima sezione delle
 * impostazioni (jarvis-impostazioni), che si aprono tenendo premuto l'orologio.
 */
export class JarvisDiagnostica extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        overflow: auto;
        display: flex;
        flex-direction: column;
        padding: 20px 24px;
        gap: 12px;
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
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
      /* telefono: due colonne (etichetta, valore); con quattro sbordava a 360 px */
      @media (max-width: 699px) {
        :host {
          padding: 16px;
        }
        /* etichetta sopra il valore: gli indirizzi hanno tutta la riga e non si spezzano */
        dl {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
        dt {
          margin-top: 8px;
          font-size: 13px;
        }
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
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiLog?.();
    clearInterval(this.timer);
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
        <div class="azioni">
          ${
            agg === "pronto"
              ? html`<button @click=${() => applicaAggiornamento()}>Aggiorna ora</button>`
              : nothing
          }
          <button @click=${() => location.reload()}>Ricarica app</button>
          <button @click=${() => this.esci()}>Esci (dimentica login)</button>
        </div>
      </header>
      <dl data-test="diagnostica">
        <dt>Versione</dt>
        <dd data-test="versione">${__VERSIONE__}</dd>
        <dt>Sul server</dt>
        <dd data-test="versione-server">${versioneSulServer() ?? "—"}</dd>
        <dt>Indirizzo</dt>
        <dd data-test="origine">${origineHA()}</dd>
        <dt>Origine in uso</dt>
        <dd data-test="origine-in-uso">${testoOrigine()}</dd>
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
        <dd data-test="entita-ricevute">${connessione.negozio.quante}</dd>
        <dt>Aggiornamento app</dt>
        <dd data-test="aggiornamento">
          ${
            {
              nessuno: "nessuno",
              "in-download": "in download…",
              pronto: "pronto (si applica alle 04:00)",
              "non-supportato": "service worker non attivo",
            }[agg]
          }
        </dd>
        <dt>«Jarvis» dal vivo</dt>
        <dd><jarvis-parola-dal-vivo></jarvis-parola-dal-vivo></dd>
      </dl>
      <ol data-test="log" aria-label="Log degli errori">
        ${log.voci().map((v) => html`<li class=${v.livello}>${ora(v)} · ${v.livello} · ${v.messaggio}</li>`)}
        ${log.voci().length === 0 ? html`<li>Nessun evento registrato</li>` : nothing}
      </ol>
    `;
  }
}
function testoOrigine(): string {
  const { uso, motivo } = statoOrigine();
  const nome = { veloce: "veloce", riserva: "di riserva", altra: "altra" }[uso];
  return motivo ? `${nome} · ${motivo}` : nome;
}

customElements.define("jarvis-diagnostica", JarvisDiagnostica);
