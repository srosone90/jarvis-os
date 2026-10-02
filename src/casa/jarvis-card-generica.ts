import { mdiHelpCircleOutline } from "@mdi/js";
import { html, type TemplateResult } from "lit";
import { icona } from "../interfaccia";
import { CardBase, stileCard, statoInItaliano } from "./card-base";

/**
 * Dispositivo di un tipo che il pannello non sa ancora comandare (luci,
 * tapparelle… quando arriveranno). Mostra nome e stato, nessun controllo:
 * mai pulsanti che non fanno niente.
 */
export class JarvisCardGenerica extends CardBase {
  static override styles = stileCard;

  protected disegna(): TemplateResult {
    return html`<div class="card" data-test="card-generica">
      <div class="riga">${icona(mdiHelpCircleOutline)}<span class="nome">${this.card.nome}</span></div>
      <span class="stato">${statoInItaliano(this.entita?.state)}</span>
      <small>Non ancora comandabile dal pannello</small>
    </div>`;
  }
}
customElements.define("jarvis-card-generica", JarvisCardGenerica);
