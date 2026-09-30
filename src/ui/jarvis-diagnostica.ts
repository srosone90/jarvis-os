import { css, html, nothing, type TemplateResult } from "lit";
import { dimenticaLogin, origineHA } from "../connessione/autenticazione";
import { connessione } from "../connessione/connessione";
import { log, type VoceLog } from "../diagnostica/log";
import { statoAggiornamento, applicaAggiornamento, versioneSulServer } from "../pwa/aggiornamenti";
import { statoOrigine } from "../pwa/origine";
import { impostaStanzaPannello, stanzaPannello } from "../voce/stanza-pannello";
import { dispositivoDi } from "../timer/pannello";
import { audioSveglio, type StatoAudioSveglio } from "../voce/audio-sveglio";
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
        position: fixed;
        inset: 0;
        overflow: auto;
        /* pieno: sul telefono il pannello sotto si leggeva tra le righe */
        background: var(--sfondo);
        z-index: 30;
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
      /* telefono: due colonne (etichetta, valore); con quattro sbordava a 360 px */
      @media (max-width: 699px) {
        :host {
          padding: 16px;
        }
        dl {
          grid-template-columns: max-content minmax(0, 1fr);
        }
      }
      .nota {
        display: block;
        margin-top: 4px;
        font-size: 13px;
        color: var(--attenuato);
      }
      .nota.avviso {
        color: var(--avviso-testo);
      }
      .interruttore {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        cursor: pointer;
      }
      .interruttore input {
        flex: none;
        width: 24px;
        height: 24px;
        accent-color: var(--accento);
      }
      select {
        min-height: 48px;
        max-width: 100%;
        border-radius: 12px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 15px;
        padding: 0 12px;
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

  /**
   * Serve alla pausa della musica durante la voce e ai timer (v0.4.6): senza
   * stanza la musica non si tocca, e i timer chiesti da qui vanno a
   * "jarvis_pannello", che suona su tutti i pannelli senza stanza.
   */
  private sceltaStanza(): TemplateResult {
    const attuale = stanzaPannello();
    const aree = [...connessione.registri.aree.map((a) => a.name)].sort((a, b) => a.localeCompare(b, "it"));
    if (attuale && !aree.includes(attuale)) aree.unshift(attuale);
    return html`<select
        data-test="stanza-pannello"
        aria-label="Stanza di questo pannello"
        @change=${(e: Event) => {
          impostaStanzaPannello((e.target as HTMLSelectElement).value || null);
          this.requestUpdate();
        }}
      >
        <option value="" ?selected=${!attuale}>Nessuna</option>
        ${aree.map((a) => html`<option value=${a} ?selected=${a === attuale}>${a}</option>`)}
      </select>
      ${
        attuale
          ? html`<small class="nota" data-test="dispositivo-timer"
              >Timer e voce di questo pannello: ${dispositivoDi(attuale)}</small
            >`
          : html`<small class="nota avviso" data-test="avviso-stanza"
              >Scegli la stanza per i timer: senza, qui suonano solo i timer chiesti da pannelli senza stanza,
              mai quelli di una stanza. E la musica non si tocca.</small
            >`
      }`;
  }

  /** Rumore a -80 dB per l'Echo in Bluetooth: acceso di serie (v0.4.5). */
  private sceltaAudioSveglio(): TemplateResult {
    const testo: Record<StatoAudioSveglio, string> = {
      attivo: "attivo",
      "attesa-tocco": "parte al primo tocco",
      sospeso: "sospeso dal sistema, riprende al tocco",
      spento: "spento",
      "non-disponibile": "non disponibile su questo browser",
    };
    return html`<label class="interruttore">
      <input
        type="checkbox"
        data-test="audio-sveglio"
        .checked=${audioSveglio.attivo}
        @change=${(e: Event) => {
          audioSveglio.imposta((e.target as HTMLInputElement).checked);
          this.requestUpdate();
        }}
      />
      <span
        >Tiene sveglio l'altoparlante Bluetooth ·
        <span data-test="stato-audio-sveglio">${testo[audioSveglio.stato]}</span></span
      >
    </label>`;
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
        <dt>Sul server</dt>
        <dd data-test="versione-server">${versioneSulServer() ?? "—"}</dd>
        <dt>Indirizzo</dt>
        <dd data-test="origine">${origineHA()}</dd>
        <dt>Origine in uso</dt>
        <dd data-test="origine-in-uso">${testoOrigine()}</dd>
        <dt>Stanza</dt>
        <dd>${this.sceltaStanza()}</dd>
        <dt>Audio sveglio</dt>
        <dd>${this.sceltaAudioSveglio()}</dd>
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
