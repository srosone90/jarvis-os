import { mdiPower, mdiToggleSwitchOutline, mdiWaterBoiler } from "@mdi/js";
import { html, nothing, type TemplateResult } from "lit";
import { PREFERENZE, type Programma } from "../comune";
import { connessione } from "../connessione";
import { log } from "../diagnostica";
import { icona } from "../interfaccia";
import { CardBase, stileCard, statoInItaliano } from "./card-base";

/**
 * Interruttore. Due casi:
 *  - a infrarossi (TV della camera): HA non conosce lo stato. Un solo "Tasto
 *    accensione" che manda switch.turn_on: sul televisore è lo stesso tasto per
 *    accendere e spegnere (provato da Salvatore il 29/09).
 *  - normale (Bot dello scaldabagno): tocco = acceso/spento con conferma. Se ha
 *    un programma nel pacchetto HA, la card lo racconta con i testi del server.
 */
export class JarvisCardInterruttore extends CardBase {
  static override styles = stileCard;
  private programmaSegnalato = false;

  private get programma(): Programma | undefined {
    return PREFERENZE.programmi[this.card.entita];
  }

  protected override altreEntita(): string[] {
    const p = this.programma;
    return p ? [p.modalita, p.giorniNuvolosi, p.prossimoCambio] : [];
  }

  private get infrarossi(): boolean {
    const e = this.entita;
    return (
      PREFERENZE.infrarossi.includes(this.card.entita) ||
      e?.attributes["assumed_state"] === true ||
      e?.state === "unknown"
    );
  }

  private disegnaProgramma(): TemplateResult | typeof nothing {
    const p = this.programma;
    if (!p) return nothing;
    const negozio = connessione.negozio;
    const modalita = negozio.entitaDi(p.modalita);
    const giorni = negozio.entitaDi(p.giorniNuvolosi);
    const prossimo = negozio.entitaDi(p.prossimoCambio);
    if (!modalita || !prossimo) {
      if (negozio.pronto && !this.programmaSegnalato) {
        this.programmaSegnalato = true;
        log.errore(
          `Programma di ${this.card.entita} non leggibile: manca ${!modalita ? p.modalita : p.prossimoCambio}`,
        );
      }
      return html`<small class="secondario" data-test="programma">Programma non disponibile</small>`;
    }
    const attivo = modalita.state === "on";
    const nGiorni = giorni ? Number(giorni.state) : NaN;
    return html`<small class="secondario" data-test="programma">
      ${attivo ? html`Inverno attivo${Number.isFinite(nGiorni) ? ` · ${nGiorni} gg nuvolosi` : ""}<br />` : nothing}${prossimo.state}
    </small>`;
  }

  protected disegna(): TemplateResult {
    if (this.infrarossi) {
      return html`<div class="card in-riga ${this.nonAggiornato ? "vecchio" : ""}" data-test="card-tasto">
        <div class="testo">
          <div class="riga">${icona(mdiPower)}<span class="nome">${this.card.nome}</span></div>
          <span class="etichetta">Infrarossi · stato non verificabile</span>
          <small class="spiegazione">Come il tasto del telecomando: accende o spegne.</small>
        </div>
        <div class="comandi">
          <button
            ?disabled=${this.disabilitata || this.inAttesa}
            @click=${() => this.esegui({ dominio: "switch", servizio: "turn_on" })}
          >
            Tasto accensione
          </button>
        </div>
      </div>`;
    }
    const acceso = this.statoMostrato === "on";
    return html`<div
      class="card in-riga ${acceso ? "acceso" : ""} ${this.nonAggiornato ? "vecchio" : ""}"
      data-test="card-interruttore"
    >
      <button
        class="principale"
        aria-pressed=${acceso ? "true" : "false"}
        ?disabled=${this.disabilitata || this.inAttesa}
        @click=${() =>
          this.esegui({
            dominio: "switch",
            servizio: acceso ? "turn_off" : "turn_on",
            attesoStato: acceso ? "off" : "on",
            // il Bot SwitchBot passa dal cloud: può metterci qualche secondo
            attesaMs: 30_000,
          })}
      >
        <span class="riga"
          >${icona(this.programma ? mdiWaterBoiler : mdiToggleSwitchOutline)}<span class="nome"
            >${this.card.nome}</span
          ></span
        >
        <span class="stato ${this.inAttesa ? "in-attesa" : ""}" data-test="card-stato"
          >${statoInItaliano(this.statoMostrato)}</span
        >
      </button>
      ${this.disegnaProgramma()}
    </div>`;
  }
}
customElements.define("jarvis-card-interruttore", JarvisCardInterruttore);
