import { mdiCellphoneLink, mdiCheck } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { icona, RiquadroSicuro, stileBase } from "./base";

/**
 * Il tasto «Collega questo dispositivo» (v0.5.9), in Impostazioni → Musica e
 * nel riquadro «Dove la suono?». Apre l'app Spotify (Android) o il sito (un
 * computer), e al ritorno riconosce il dispositivo nuovo nell'elenco di
 * Spotify: è questo pannello (`CollegaDispositivo`). Se il dispositivo salvato
 * è sparito (Android ha chiuso Spotify) il tasto diventa «Ricollega» e lo
 * riconosce di nuovo per nome. Il login lo fa la persona nell'app o sul sito:
 * qui non passano né password né token.
 *
 * Evento `collegato` (detail: il nome) quando il dispositivo è salvato.
 */
export class JarvisCollegaSpotify extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
      }
      button {
        min-height: 48px;
        padding: 0 16px;
        border-radius: 24px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 16px;
        cursor: pointer;
        touch-action: manipulation;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        text-align: left;
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .esito {
        margin-top: 8px;
        font-size: 15px;
        color: var(--attenuato);
        overflow-wrap: break-word;
      }
      .esito.ok {
        color: var(--testo);
      }
      .esito.ok .icona {
        color: var(--accento);
      }
      .scegli {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private annunciato: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [
      connessione.collegaSpotify.ascolta(() => {
        const s = connessione.collegaSpotify.stato;
        if (s.fase === "collegato" && this.annunciato !== s.nome) {
          this.annunciato = s.nome;
          this.dispatchEvent(new CustomEvent("collegato", { detail: s.nome, bubbles: true, composed: true }));
        }
        ridisegna();
      }),
      connessione.musica.ascolta(ridisegna),
      connessione.ascolta(ridisegna),
    ];
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
  }

  /** Il dispositivo salvato che Spotify non vede più: si ricollega quello. */
  private sparito(): string | null {
    const d = connessione.musica.dispositivi;
    return d?.scelto && !d.sceltoVisibile ? d.scelto : null;
  }

  private stato(): TemplateResult | typeof nothing {
    const s = connessione.collegaSpotify.stato;
    switch (s.fase) {
      case "apro":
        return html`<div class="esito" data-test="collega-esito">
          Apro Spotify: se serve fai il login, poi torna qui.
        </div>`;
      case "cerco":
        return html`<div class="esito" data-test="collega-esito">Cerco questo dispositivo su Spotify…</div>`;
      case "scegli":
        return html`<div class="esito" data-test="collega-esito">
            Su Spotify sono comparsi più dispositivi: qual è questo?
          </div>
          <div class="scegli">
            ${s.nuovi.map(
              (d) =>
                html`<button
                  data-test="collega-scegli"
                  @click=${() => void connessione.collegaSpotify.scegli(d.nome)}
                >
                  ${d.nome}${d.tipo ? html` <small>(${d.tipo})</small>` : nothing}
                </button>`,
            )}
          </div>`;
      case "collegato":
        return html`<div class="esito ok" data-test="collega-esito">
          ${icona(mdiCheck)} Collegato: <b>${s.nome}</b>
        </div>`;
      case "nonVisto":
        return html`<div class="esito" role="alert" data-test="collega-esito">
          Non vedo ancora questo dispositivo su Spotify: controlla di aver fatto il login con lo stesso
          account e riprova.
        </div>`;
      case "errore":
        return html`<div class="esito" role="alert" data-test="collega-esito">${s.messaggio}</div>`;
      default:
        return nothing;
    }
  }

  protected disegna(): TemplateResult {
    const c = connessione.collegaSpotify;
    const sparito = this.sparito();
    const inCorso = c.stato.fase === "apro" || c.stato.fase === "cerco";
    return html`<button
        data-test="collega-spotify"
        ?disabled=${inCorso || connessione.stato.stato !== "connesso"}
        @click=${() => void c.avvia(sparito)}
      >
        ${icona(mdiCellphoneLink)}${sparito ? `Ricollega ${sparito}` : "Collega questo dispositivo"}
      </button>
      ${this.stato()}`;
  }
}
customElements.define("jarvis-collega-spotify", JarvisCollegaSpotify);
