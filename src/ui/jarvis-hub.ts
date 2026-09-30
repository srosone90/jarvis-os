import { mdiViewGrid } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { messaggioErrore } from "../assistente/messaggi";
import { connessione } from "../connessione/connessione";
import { stanzaPannello } from "../voce/stanza-pannello";
import { vista } from "../vista/istanza";
import { icona, OsservaConnessione, RiquadroSicuro, stileBase } from "./base";
import type { JarvisSfera, StatoSfera } from "./jarvis-sfera";
import "./jarvis-sfera";
import "./jarvis-connessione";
import "./jarvis-timer";

/**
 * Hub, variante H1 (scelta di Salvatore, 30/09): la sfera al centro, domanda e
 * risposta sotto come sottotitoli. È una faccia della stessa voce di sempre
 * (`connessione.voce`, dove = "hub"): cambia solo il disegno.
 *
 * Tocco sulla sfera: parla (o ferma, come il pulsante del microfono). In alto
 * ora, stanza, pallino, timer e il tasto "griglia" per il pannello completo:
 * una riga sua, così sui telefoni bassi i timer non finiscono sulla sfera.
 * Dopo 30 s senza attività si torna al riposo (vista.ts).
 */
export class JarvisHub extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      /* due righe che non si toccano mai: in alto ora, stanza, timer e "griglia"; sotto sfera e sottotitoli */
      :host {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100dvh;
        overflow: hidden;
        background: radial-gradient(900px 520px at 50% 55%, #0f1a36 0%, #05070b 65%);
        user-select: none;
        -webkit-user-select: none;
      }
      .testa {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px 0 20px;
        min-width: 0;
      }
      .angolo {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 14px;
        min-height: 48px;
        font-size: 20px;
        color: var(--attenuato);
      }
      .angolo .ora {
        color: var(--testo);
        font-variant-numeric: tabular-nums;
        font-size: 24px;
      }
      jarvis-timer {
        flex: 1;
        min-width: 0;
        display: flex;
        justify-content: flex-end;
      }
      .centro {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
        padding: 8px 16px 20px;
        min-height: 0;
        text-align: center;
      }
      jarvis-sfera {
        --lato: min(40vh, 60vw);
        flex: none;
        cursor: pointer;
        touch-action: manipulation;
      }
      .sott {
        max-width: 820px;
        min-height: 3em;
        line-height: 1.35;
      }
      .io {
        color: var(--attenuato);
        font-size: 22px;
        font-style: italic;
      }
      .jv {
        font-size: 30px;
        margin-top: 8px;
      }
      .aiuto {
        color: var(--attenuato);
        font-size: 20px;
      }
      .errore .jv {
        color: var(--avviso-testo);
      }
      button.griglia {
        flex: none;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: 1px solid #ffffff1a;
        background: #ffffff0d;
        color: #c9d0dc;
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .testa {
          padding-top: 6px;
        }
        .centro {
          gap: 10px;
          padding: 4px 16px 8px;
        }
        jarvis-sfera {
          --lato: min(30vh, 40vw);
        }
        .io {
          font-size: 16px;
        }
        .jv {
          font-size: 20px;
          margin-top: 4px;
        }
        .sott {
          min-height: 0;
        }
      }
      @media (max-width: 699px) {
        .testa {
          flex-wrap: wrap;
        }
        jarvis-timer {
          order: 3;
          flex-basis: 100%;
          justify-content: flex-start;
        }
        .angolo {
          flex: 1;
        }
        .jv {
          font-size: 24px;
        }
        .io {
          font-size: 18px;
        }
      }
    `,
  ];

  private readonly stato = new OsservaConnessione(this);
  private smetti: (() => void) | null = null;
  private smettiLivello: (() => void) | null = null;
  private battito: ReturnType<typeof setInterval> | undefined;
  private livello = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.voce.ascolta(() => this.requestUpdate());
    this.smettiLivello = connessione.voce.ascoltaLivello((l) => {
      this.livello = l;
      const s = this.renderRoot.querySelector<JarvisSfera>("jarvis-sfera");
      if (s) s.livello = l;
    });
    // l'ora nell'angolo
    this.battito = setInterval(() => this.requestUpdate(), 15_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smettiLivello?.();
    this.smetti = this.smettiLivello = null;
    clearInterval(this.battito);
  }

  private tocco(): void {
    const v = connessione.voce;
    vista.attivita();
    if (v.attiva && v.fase !== "errore") v.ferma();
    else void v.parla("hub");
  }

  private statoSfera(): StatoSfera {
    const v = connessione.voce;
    if (this.stato.info.stato !== "connesso") return "errore";
    if (v.dove !== "hub") return "fioca";
    switch (v.fase) {
      case "apertura":
      case "ascolto":
        return "ascolto";
      case "pensa":
        return "pensa";
      case "risponde":
        return "risponde";
      case "errore":
        return "errore";
      default:
        return v.turno?.errore ? "errore" : "fioca";
    }
  }

  private sottotitoli(): TemplateResult {
    const v = connessione.voce;
    if (this.stato.info.stato !== "connesso")
      return html`<div class="sott errore" role="status">
        <div class="jv">Home Assistant non raggiungibile.</div>
      </div>`;
    const mic = v.dove === "hub" ? v.erroreMicrofono : null;
    if (mic)
      return html`<div class="sott errore" role="alert" data-test="hub-errore">
        <div class="jv">${mic.titolo}</div>
        <div class="io">${mic.spiegazione}</div>
      </div>`;
    const t = v.dove === "hub" ? v.turno : undefined;
    if (!t)
      return html`<div class="sott">
        <div class="aiuto" data-test="hub-aiuto">Tocca la sfera per parlare</div>
      </div>`;
    const errore = t.errore ? messaggioErrore(t.errore, t.voce && !t.domanda).titolo : null;
    const ascolto = v.fase === "ascolto" || v.fase === "apertura";
    return html`<div class="sott ${errore ? "errore" : ""}" role="status" aria-live="polite">
      ${t.domanda ? html`<div class="io" data-test="hub-domanda">«${t.domanda}»</div>` : nothing}
      ${
        errore
          ? html`<div class="jv" data-test="hub-errore">${errore}</div>`
          : t.risposta
            ? html`<div class="jv" data-test="hub-risposta">${t.risposta}</div>`
            : html`<div class="aiuto">${ascolto ? "Ti ascolto…" : "Sto pensando…"}</div>`
      }
    </div>`;
  }

  protected disegna(): TemplateResult {
    const stanza = stanzaPannello();
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return html`<div class="testa">
        <div class="angolo">
          <span class="ora">${ora}</span>${stanza ? html`<span>${stanza}</span>` : nothing}
          <jarvis-connessione parte="pallino"></jarvis-connessione>
        </div>
        <jarvis-timer .massimo=${2}></jarvis-timer>
        <button
          class="griglia"
          aria-label="Pannello completo"
          data-test="hub-completo"
          @click=${() => vista.vai("completo", "tasto griglia")}
        >
          ${icona(mdiViewGrid)}
        </button>
      </div>
      <div class="centro" data-test="hub">
        <jarvis-sfera
          stato=${this.statoSfera()}
          .livello=${this.livello}
          role="button"
          aria-label=${connessione.voce.attiva ? "Ferma" : "Parla con Jarvis"}
          data-test="hub-sfera"
          @click=${() => this.tocco()}
        ></jarvis-sfera>
        ${this.sottotitoli()}
      </div>`;
  }
}
customElements.define("jarvis-hub", JarvisHub);
