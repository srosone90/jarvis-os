import { css, html, nothing, type TemplateResult } from "lit";
import type { ClimaStanza } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { log } from "../diagnostica/log";
import { numero } from "../meteo/testi";
import { OsservaEntita, RiquadroSicuro, stileBase } from "./base";

/**
 * Clima interno di una stanza (sola lettura nella F1): temperatura, umidità e
 * temperatura percepita calcolata dal pacchetto Home Assistant.
 * I comandi dei dispositivi arrivano con la F2.
 */
export class JarvisClimaStanza extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
      }
      .riquadro {
        padding: 16px;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      .valori {
        display: flex;
        align-items: baseline;
        gap: 16px;
        flex-wrap: wrap;
        font-variant-numeric: tabular-nums;
      }
      .temp {
        font-size: 40px;
        font-weight: 300;
      }
      .secondari {
        font-size: 17px;
        color: var(--attenuato);
      }
      .secondari b {
        color: var(--testo);
        font-weight: 500;
      }
      .non-aggiornato b {
        color: var(--avviso);
      }
      .nota {
        font-size: 14px;
        color: var(--attenuato);
      }
    `,
  ];

  static override properties = { stanza: { attribute: false }, nonAggiornato: { type: Boolean } };
  declare stanza: ClimaStanza;
  declare nonAggiornato: boolean;
  private readonly segnalate = new Set<string>();

  constructor() {
    super();
    this.nonAggiornato = false;
    new OsservaEntita(this, () =>
      this.stanza ? [this.stanza.temperatura, this.stanza.umidita, this.stanza.percepita] : [],
    );
  }

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

  protected disegna(): TemplateResult {
    const s = this.stanza;
    const pronto = connessione.negozio.pronto;
    const t = this.valore(s.temperatura, 1);
    const u = this.valore(s.umidita, 0);
    const p = this.valore(s.percepita, 1);
    const classe = this.nonAggiornato ? "non-aggiornato" : "";
    const mancanti = [
      [s.temperatura, t],
      [s.umidita, u],
      [s.percepita, p],
    ].filter(([id, v]) => v === null && pronto && !connessione.negozio.entitaDi(id as string));
    return html`<div class="riquadro" data-test="stanza">
      <h2>${s.nome}</h2>
      <div class="valori ${classe}">
        <span class="temp" data-test="stanza-temp">${t !== null ? `${t}°` : "—"}</span>
        <span class="secondari">umidità <b>${u !== null ? `${u}%` : "—"}</b></span>
        <span class="secondari"
          >percepita <b data-test="stanza-percepita">${p !== null ? `${p}°` : "—"}</b></span
        >
      </div>
      ${this.nonAggiornato ? html`<div class="nota non-aggiornato">Valori non aggiornati</div>` : nothing}
      ${
        mancanti.length
          ? html`<div class="nota" role="status">
              Sensore non trovato: ${mancanti.map(([id]) => id).join(", ")}
            </div>`
          : nothing
      }
    </div>`;
  }
}
customElements.define("jarvis-clima-stanza", JarvisClimaStanza);
