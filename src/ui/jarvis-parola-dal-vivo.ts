import { css, html, type TemplateResult } from "lit";
import { connessione } from "../connessione";
import { RiquadroSicuro, stileBase } from "../interfaccia";

const numero = (n: number): string => n.toFixed(2).replace(".", ",");

/**
 * Indicatore DAL VIVO di «Jarvis» (v0.5.1), per capire sul tablet vero se la
 * parola "arriva": il punteggio più alto degli ultimi 3 secondi, con la linea
 * della soglia, e il livello del microfono. Sta nelle impostazioni (Voce e
 * Diagnostica), mai nella home. Si aggiorna 4 volte al secondo solo finché è
 * a schermo.
 */
export class JarvisParolaDalVivo extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: grid;
        gap: 10px;
      }
      .riga {
        display: grid;
        grid-template-columns: 150px minmax(0, 1fr) 56px;
        align-items: center;
        gap: 10px;
        font-size: 15px;
      }
      .barra {
        position: relative;
        height: 14px;
        border-radius: 7px;
        background: #232834;
        overflow: hidden;
      }
      .pieno {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 7px;
        background: var(--accento);
        transition: width 0.2s linear;
      }
      .pieno.sopra {
        background: var(--ok);
      }
      .soglia {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--testo);
      }
      b {
        font-variant-numeric: tabular-nums;
        text-align: right;
        font-weight: 600;
      }
      small {
        color: var(--attenuato);
        font-size: 14px;
      }
      @media (max-width: 499px) {
        .riga {
          grid-template-columns: minmax(0, 1fr) 56px;
        }
        .riga span:first-child {
          grid-column: 1 / -1;
        }
      }
    `,
  ];

  private timer: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => this.requestUpdate(), 250);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }

  protected disegna(): TemplateResult {
    const p = connessione.parola;
    if (p.stato !== "ascolta")
      return html`<small data-test="dal-vivo-spento"
        >L'indicatore dal vivo funziona quando «Jarvis» ascolta.</small
      >`;
    const v = p.dalVivo;
    const percento = (x: number): string => `${Math.round(Math.min(1, Math.max(0, x)) * 100)}%`;
    return html`<div class="riga">
        <span>«Jarvis», ultimi 3 s</span>
        <div
          class="barra"
          role="meter"
          aria-label="Punteggio di «Jarvis» negli ultimi 3 secondi"
          aria-valuemin="0"
          aria-valuemax="1"
          aria-valuenow=${v.punteggio.toFixed(2)}
        >
          <div
            class="pieno ${v.punteggio >= v.soglia ? "sopra" : ""}"
            style="width: ${percento(v.punteggio)}"
          ></div>
          <div class="soglia" style="left: ${percento(v.soglia)}"></div>
        </div>
        <b data-test="dal-vivo-punteggio">${numero(v.punteggio)}</b>
      </div>
      ${
        v.base !== v.punteggio
          ? html`<div class="riga">
              <span>Modello di base</span>
              <div
                class="barra"
                role="meter"
                aria-label="Punteggio del modello di base"
                aria-valuemin="0"
                aria-valuemax="1"
                aria-valuenow=${v.base.toFixed(2)}
              >
                <div class="pieno" style="width: ${percento(v.base)}"></div>
              </div>
              <b>${numero(v.base)}</b>
            </div>`
          : html``
      }
      <div class="riga">
        <span>Microfono</span>
        <div
          class="barra"
          role="meter"
          aria-label="Livello del microfono"
          aria-valuemin="0"
          aria-valuemax="1"
          aria-valuenow=${v.livello.toFixed(2)}
        >
          <div class="pieno" style="width: ${percento(v.livello)}"></div>
        </div>
        <b data-test="dal-vivo-livello">${numero(v.livello)}</b>
      </div>
      <small
        >Di' «Jarvis»: la barra deve superare la linea bianca (soglia ${numero(v.soglia)}). Se il microfono si
        muove ma «Jarvis» resta vicino a zero, insegnagli la tua pronuncia.</small
      >`;
  }
}
customElements.define("jarvis-parola-dal-vivo", JarvisParolaDalVivo);
