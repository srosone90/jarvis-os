import { css, html, nothing, type TemplateResult } from "lit";
import type { Stanza } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { log } from "../diagnostica/log";
import { numero } from "../meteo/testi";
import { OsservaEntita, RiquadroSicuro, stileBase } from "./base";

/**
 * Riquadro di una stanza, come nel mockup approvato: intestazione con nome e
 * clima compatto (temperatura · umidità · percepita), sotto la zona dei
 * dispositivi. Nella v0.1.x la zona dispositivi è un segnaposto dichiarato
 * "in arrivo": i comandi veri arrivano con la F2, mai controlli finti prima.
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
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 0 4px;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
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
      .in-arrivo {
        flex: 1;
        min-height: 56px;
        border: 1px dashed #343a46;
        border-radius: var(--raggio);
        display: grid;
        place-items: center;
        text-align: center;
        padding: 8px;
        font-size: 14px;
        color: var(--attenuato);
      }
    `,
  ];

  static override properties = { stanza: { attribute: false }, nonAggiornato: { type: Boolean } };
  declare stanza: Stanza;
  declare nonAggiornato: boolean;
  private readonly segnalate = new Set<string>();

  constructor() {
    super();
    this.nonAggiornato = false;
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

  protected disegna(): TemplateResult {
    const s = this.stanza;
    const negozio = connessione.negozio;
    const mancanti = s.clima
      ? [s.clima.temperatura, s.clima.umidita, s.clima.percepita].filter(
          (id) => negozio.pronto && !negozio.entitaDi(id),
        )
      : [];
    return html`<div class="stanza" data-test="stanza">
      <header>
        <h2>${s.nome}</h2>
        ${this.disegnaClima()}
      </header>
      ${this.nonAggiornato && s.clima ? html`<div class="nota non-aggiornato">Valori non aggiornati</div>` : nothing}
      ${
        mancanti.length
          ? html`<div class="nota" role="status">Sensore non trovato: ${mancanti.join(", ")}</div>`
          : nothing
      }
      <div class="in-arrivo" data-test="in-arrivo">Comandi dei dispositivi: in arrivo (F2)</div>
    </div>`;
  }
}
customElements.define("jarvis-stanza", JarvisStanza);
