import { mdiChevronRight } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import type { StanzaVista } from "./modello";
import { connessione } from "../connessione";
import { log } from "../diagnostica";
import { numero } from "../meteo/testi";
import { OsservaEntita, RiquadroSicuro, icona, stileBase } from "../interfaccia";
import "./jarvis-card-clima";
import "./jarvis-card-generica";
import "./jarvis-card-interruttore";
import "./jarvis-card-media";

/**
 * Riquadro di una stanza, come nel mockup approvato: intestazione con nome e
 * clima compatto (temperatura · umidità · percepita), sotto le card dei
 * dispositivi, ricavate dai registri di Home Assistant (una per dispositivo).
 */
export class JarvisStanza extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
        min-width: 0;
        min-height: 0;
      }
      .stanza {
        height: 100%;
        background: color-mix(in srgb, var(--superficie) 55%, transparent);
        border-radius: 20px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 2px 8px;
        padding: 0 4px;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
      }
      /* il nome apre la schermata della stanza (v0.5.5) */
      .apri {
        all: unset;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        /* area da toccare più grande del testo, senza alzare la riga */
        padding: 8px 6px;
        margin: -8px -6px;
        cursor: pointer;
        border-radius: 10px;
      }
      .apri:focus-visible {
        outline: 2px solid var(--accento);
      }
      .apri .icona {
        width: 18px;
        height: 18px;
        color: var(--attenuato);
      }
      .clima {
        font-size: 15px;
        color: var(--attenuato);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .clima b {
        color: var(--testo);
        font-weight: 500;
      }
      .non-aggiornato,
      .non-aggiornato b {
        color: var(--avviso);
      }
      .nota {
        font-size: 13px;
        padding: 0 4px;
        color: var(--attenuato);
      }
      .carte {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 10px;
      }
      .carte > * {
        flex: 1 1 200px;
        min-width: 0;
      }
      /* il condizionatore ha 5 pulsanti in riga: gli serve più spazio */
      .carte > jarvis-card-clima {
        flex: 1.6 1 300px;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .stanza {
          padding: 6px;
          gap: 4px;
          border-radius: 14px;
        }
        h2 {
          font-size: 15px;
        }
        .clima {
          font-size: 13px;
        }
        .carte {
          gap: 6px;
        }
        .carte > jarvis-card-clima {
          flex: 1.6 1 280px;
        }
        .carte > * {
          flex-basis: 170px;
        }
      }
      .vuota {
        font-size: 14px;
        color: var(--attenuato);
        padding: 8px 4px;
      }
    `,
  ];

  static override properties = {
    stanza: { attribute: false },
    nonAggiornato: { type: Boolean },
    offline: { type: Boolean },
    caricati: { type: Boolean },
    senzaTitolo: { type: Boolean },
  };
  declare stanza: StanzaVista;
  declare nonAggiornato: boolean;
  declare offline: boolean;
  declare caricati: boolean;
  /** Dentro la schermata della stanza: il titolo c'è già sopra. */
  declare senzaTitolo: boolean;
  private readonly segnalate = new Set<string>();

  constructor() {
    super();
    this.nonAggiornato = false;
    this.offline = false;
    this.caricati = false;
    this.senzaTitolo = false;
    new OsservaEntita(this, () => {
      const c = this.stanza?.clima;
      return c ? [c.temperatura, c.umidita, c.percepita] : [];
    });
  }

  /** Valore formattato, oppure null (e una riga nel log, una volta) se l'entità manca. */
  private valore(id: string, decimali: number): string | null {
    const negozio = connessione.negozio;
    const e = negozio.entitaDi(id);
    if (!e) {
      if (negozio.pronto && !this.segnalate.has(id)) {
        this.segnalate.add(id);
        log.errore(`Sensore non trovato: ${id} (stanza ${this.stanza.nome})`);
      }
      return null;
    }
    this.segnalate.delete(id);
    return numero(e.state, decimali);
  }

  private disegnaClima(): TemplateResult | typeof nothing {
    const c = this.stanza.clima;
    if (!c) return nothing;
    const t = this.valore(c.temperatura, 1);
    const u = this.valore(c.umidita, 0);
    const p = this.valore(c.percepita, 1);
    return html`<span class="clima ${this.nonAggiornato ? "non-aggiornato" : ""}">
      <b data-test="stanza-temp">${t !== null ? `${t}°` : "—"}</b> · ${u !== null ? `${u}%` : "—"} · perc.
      <span data-test="stanza-percepita">${p !== null ? `${p}°` : "—"}</span>
    </span>`;
  }

  private disegnaCard(c: StanzaVista["card"][number]): TemplateResult {
    const na = this.nonAggiornato;
    const off = this.offline;
    switch (c.tipo) {
      case "clima":
        return html`<jarvis-card-clima .card=${c} .offline=${off} .nonAggiornato=${na}></jarvis-card-clima>`;
      case "media":
        return html`<jarvis-card-media .card=${c} .offline=${off} .nonAggiornato=${na}></jarvis-card-media>`;
      case "interruttore":
        return html`<jarvis-card-interruttore
          .card=${c}
          .offline=${off}
          .nonAggiornato=${na}
        ></jarvis-card-interruttore>`;
      default:
        return html`<jarvis-card-generica
          .card=${c}
          .offline=${off}
          .nonAggiornato=${na}
        ></jarvis-card-generica>`;
    }
  }

  protected disegna(): TemplateResult {
    const s = this.stanza;
    const negozio = connessione.negozio;
    const mancanti = s.clima
      ? [s.clima.temperatura, s.clima.umidita, s.clima.percepita].filter(
          (id) => negozio.pronto && !negozio.entitaDi(id),
        )
      : [];
    return html`<div class="stanza" data-test="stanza">
      ${
        this.senzaTitolo
          ? nothing
          : html`<header>
              <button
                class="apri"
                data-test="apri-stanza"
                aria-label="Apri ${s.nome}"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent("apri-stanza", { detail: s.areaId, bubbles: true, composed: true }),
                  )}
              >
                <h2>${s.nome}</h2>
                ${icona(mdiChevronRight)}
              </button>
              ${this.disegnaClima()}
            </header>`
      }
      ${
        mancanti.length
          ? html`<div class="nota" role="status">Sensore non trovato: ${mancanti.join(", ")}</div>`
          : nothing
      }
      ${
        !this.caricati
          ? html`<div class="vuota">Caricamento dei dispositivi…</div>`
          : s.card.length === 0
            ? html`<div class="vuota">Nessun dispositivo comandabile</div>`
            : html`<div class="carte">${s.card.map((c) => this.disegnaCard(c))}</div>`
      }
    </div>`;
  }
}
customElements.define("jarvis-stanza", JarvisStanza);
