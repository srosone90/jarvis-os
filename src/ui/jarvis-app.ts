import { mdiExitRun, mdiHomeImportOutline, mdiMicrophone, mdiWeatherNight } from "@mdi/js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { costruisciStanze } from "../registri/modello";
import { icona, OsservaConnessione } from "./base";
import "./jarvis-avvisi";
import "./jarvis-orologio";
import "./jarvis-meteo";
import "./jarvis-stanza";
import "./jarvis-connessione";
import "./jarvis-accesso";
import "./jarvis-diagnostica";

/** Ridisegna quando i registri di HA cambiano (stanze o dispositivi aggiunti/tolti). */
class OsservaRegistri implements ReactiveController {
  private smetti: (() => void) | null = null;
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    this.smetti = connessione.registri.ascolta(() => this.host.requestUpdate());
  }
  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
  }
}

/** Scene decise il 26/09 (CLAUDE.md): arrivano con la F3, qui solo il posto. */
const SCENE = [
  { nome: "Buonanotte", icona: mdiWeatherNight },
  { nome: "Esco", icona: mdiExitRun },
  { nome: "Rientro", icona: mdiHomeImportOutline },
];

/**
 * Schermata principale, con la struttura del mockup approvato (docs/mockup.html):
 *  - sinistra: orologio, meteo con previsione, sotto le scene;
 *  - destra: le stanze tutte insieme (Soggiorno e Veranda sopra, Camera sotto),
 *    pallino di connessione in alto a destra;
 *  - in basso a tutta larghezza: la barra dell'assistente.
 * Le stanze e le loro card arrivano dai registri di Home Assistant (F2). Le
 * zone delle fasi future (scene, assistente) ci sono già, ma dichiarate "in
 * arrivo" e non toccabili: mai controlli che sembrano funzionare e non fanno niente.
 */
export class JarvisApp extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-columns: 330px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) 60px;
      grid-template-areas:
        "sinistra destra"
        "barra barra";
      gap: 16px;
      padding: 16px;
      overflow: hidden;
      color: var(--testo);
      background:
        radial-gradient(
          900px 500px at 0% 0%,
          color-mix(in srgb, var(--accento) 22%, transparent),
          transparent 70%
        ),
        var(--sfondo);
    }
    .icona {
      width: 28px;
      height: 28px;
      fill: currentColor;
      flex: none;
    }
    .sinistra {
      grid-area: sinistra;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
    }
    .scene {
      margin-top: auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .scena {
      height: 88px;
      border-radius: var(--raggio);
      border: 1px dashed #343a46;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 16px;
      font-weight: 500;
      color: var(--attenuato);
    }
    .scena small {
      font-size: 12px;
      font-weight: 400;
    }
    .destra {
      grid-area: destra;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-areas:
        "soggiorno veranda"
        "camera camera";
      gap: 12px;
      padding-top: 22px; /* spazio per il pallino di connessione */
      min-height: 0;
    }
    .barra {
      grid-area: barra;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .chiedi {
      flex: 1;
      height: 60px;
      border-radius: 30px;
      border: 1px dashed #343a46;
      display: flex;
      align-items: center;
      padding: 0 24px;
      font-size: 18px;
      color: var(--attenuato);
    }
    .chiedi small {
      margin-left: auto;
      font-size: 13px;
    }
    .mic {
      width: 76px;
      height: 60px;
      border-radius: 30px;
      border: 1px dashed #343a46;
      display: grid;
      place-items: center;
      color: var(--attenuato);
    }
  `;

  static override properties = { diagnostica: { state: true } };
  declare diagnostica: boolean;
  private readonly connessione = new OsservaConnessione(this);

  constructor() {
    super();
    this.diagnostica = false;
    new OsservaRegistri(this);
    this.addEventListener("apri-diagnostica", () => {
      this.diagnostica = true;
    });
    this.addEventListener("chiudi-diagnostica", () => {
      this.diagnostica = false;
    });
  }

  protected override render(): TemplateResult {
    const offline = this.connessione.offline;
    // i comandi si disattivano appena HA manca (non partirebbero), i valori diventano "non aggiornati" dopo 10 s
    const scollegato = this.connessione.info.stato !== "connesso";
    const r = connessione.registri;
    const stanze = costruisciStanze(r.aree, r.dispositivi, r.entita, connessione.negozio.tutte, PREFERENZE);
    const loginRichiesto = this.connessione.info.stato === "login-richiesto";
    return html`
      <jarvis-connessione></jarvis-connessione>
      <jarvis-avvisi></jarvis-avvisi>
      <section class="sinistra">
        <jarvis-orologio></jarvis-orologio>
        <jarvis-meteo .nonAggiornato=${offline}></jarvis-meteo>
        <div class="scene" role="group" aria-label="Scene, in arrivo" data-test="zona-scene">
          ${SCENE.map(
            (s) =>
              html`<div class="scena" aria-disabled="true">
                ${icona(s.icona)}${s.nome}<small>in arrivo (F3)</small>
              </div>`,
          )}
        </div>
      </section>
      <section class="destra" aria-label="Stanze">
        ${stanze.map(
          (s) =>
            html`<jarvis-stanza
              style=${s.zona ? `grid-area: ${s.zona}` : "grid-column: 1 / -1"}
              .stanza=${s}
              .nonAggiornato=${offline}
              .offline=${scollegato}
              .caricati=${r.caricati}
            ></jarvis-stanza>`,
        )}
      </section>
      <div class="barra" data-test="zona-assistente" aria-label="Assistente, in arrivo">
        <div class="chiedi" aria-disabled="true">
          Chiedi a Jarvis… <small>assistente in arrivo (F4)</small>
        </div>
        <div class="mic" aria-disabled="true" aria-label="Microfono, in arrivo (F5)">
          ${icona(mdiMicrophone)}
        </div>
      </div>
      ${loginRichiesto ? html`<jarvis-accesso></jarvis-accesso>` : nothing}
      ${this.diagnostica ? html`<jarvis-diagnostica tabindex="-1"></jarvis-diagnostica>` : nothing}
    `;
  }
}
customElements.define("jarvis-app", JarvisApp);
