import { mdiTelevision, mdiVolumeHigh, mdiVolumeMinus, mdiVolumeOff, mdiVolumePlus } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { icona } from "./base";
import { CardBase, stileCard, statoInItaliano } from "./card-base";

/**
 * TV (media_player con stato affidabile). Tocco sulla card = accendi/spegni,
 * con conferma dallo stato vero; con la TV accesa: volume −/+ e muto.
 */
export class JarvisCardMedia extends CardBase {
  static override styles = [
    ...stileCard,
    css`
      .comandi .icona {
        width: 24px;
        height: 24px;
      }
    `,
  ];

  private get accesa(): boolean {
    const s = this.statoMostrato;
    return s !== undefined && !["off", "standby", "unavailable", "unknown"].includes(s);
  }

  private alterna(): void {
    const accendi = !this.accesa;
    this.esegui({
      dominio: "media_player",
      servizio: accendi ? "turn_on" : "turn_off",
      attesoStato: accendi ? "on" : "off",
      // Una TV Samsung ci mette parecchi secondi ad accendersi e farsi sentire in rete
      attesaMs: accendi ? 40_000 : 20_000,
    });
  }

  private volume(servizio: string, dati?: Record<string, unknown>): void {
    this.esegui({ dominio: "media_player", servizio, ...(dati ? { dati } : {}), silenzioso: true });
  }

  protected disegna(): TemplateResult {
    const e = this.entita;
    const accesa = this.accesa;
    const muto = e?.attributes["is_volume_muted"] === true;
    const sorgente = e?.attributes["app_name"] ?? e?.attributes["source"];
    return html`<div
      class="card ${accesa ? "acceso" : ""} ${this.nonAggiornato ? "vecchio" : ""}"
      data-test="card-media"
    >
      <button
        class="principale"
        aria-pressed=${accesa ? "true" : "false"}
        ?disabled=${this.disabilitata || this.inAttesa}
        @click=${() => this.alterna()}
      >
        <span class="riga">${icona(mdiTelevision)}<span class="nome">${this.card.nome}</span></span>
        <span class="stato ${this.inAttesa ? "in-attesa" : ""}" data-test="card-stato">
          ${statoInItaliano(this.statoMostrato, true)}${accesa && typeof sorgente === "string" ? ` · ${sorgente}` : ""}
        </span>
        <small>${this.disabilitata ? "" : accesa ? "Tocca per spegnere" : "Tocca per accendere"}</small>
      </button>
      ${
        accesa && !this.inAttesa
          ? html`<div class="comandi" role="group" aria-label="Volume">
              <button
                aria-label="Volume giù"
                ?disabled=${this.disabilitata}
                @click=${() => this.volume("volume_down")}
              >
                ${icona(mdiVolumeMinus)}
              </button>
              <button
                aria-label=${muto ? "Togli muto" : "Muto"}
                aria-pressed=${muto ? "true" : "false"}
                ?disabled=${this.disabilitata}
                @click=${() => this.volume("volume_mute", { is_volume_muted: !muto })}
              >
                ${icona(muto ? mdiVolumeOff : mdiVolumeHigh)}
              </button>
              <button
                aria-label="Volume su"
                ?disabled=${this.disabilitata}
                @click=${() => this.volume("volume_up")}
              >
                ${icona(mdiVolumePlus)}
              </button>
            </div>`
          : nothing
      }
    </div>`;
  }
}
customElements.define("jarvis-card-media", JarvisCardMedia);
