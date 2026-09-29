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
import "./jarvis-chat";
import "./jarvis-voce-riquadro";

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

/**
 * Schermata unica (solo il tablet): il banner offline va al posto della barra
 * dell'assistente; altrimenti (pagina che scorre) va in cima.
 * Deve restare uguale alla media query "TABLET" qui sotto.
 */
const SCHERMATA_UNICA = "(min-width: 900px) and (min-height: 560px)";

/** Ridisegna quando la finestra passa da schermata unica a pagina che scorre (e viceversa). */
class OsservaSchermata implements ReactiveController {
  private readonly query = window.matchMedia(SCHERMATA_UNICA);
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  get unica(): boolean {
    return this.query.matches;
  }
  private readonly cambia = (): void => this.host.requestUpdate();
  hostConnected(): void {
    this.query.addEventListener("change", this.cambia);
  }
  hostDisconnected(): void {
    this.query.removeEventListener("change", this.cambia);
  }
}

/** Ridisegna quando la voce cambia fase o il riquadro piccolo compare/sparisce. */
class OsservaVoce implements ReactiveController {
  private smetti: (() => void) | null = null;
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    this.smetti = connessione.voce.ascolta(() => this.host.requestUpdate());
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
 * Schermata principale, con la struttura del mockup approvato (docs/mockup.html).
 * Regola: MAI sovrapposizioni, a nessuna dimensione da 320 px di larghezza in su.
 * Il tablet a muro è montato in ORIZZONTALE e ha il pannello completo. I telefoni
 * possono aprirlo anch'essi (anche fuori casa): lì la pagina scorre. Tre modi:
 *  - TABLET (≥ 900×560): il mockup, schermata unica senza scorrere. A sinistra
 *    orologio e meteo, sotto le scene; a destra le stanze; in basso la barra
 *    dell'assistente. Il banner offline prende il posto della barra (senza HA è
 *    inattiva comunque).
 *  - ORIZZONTALE (telefono, anche dentro Chrome): stesse due colonne, compatte
 *    in altezza; la pagina scorre; barra in fondo; banner e pallino in cima.
 *  - VERTICALE (< 700 px di larghezza): una colonna sola che scorre.
 * Le card e il meteo hanno lo stesso "compatto" nelle loro media query.
 * (I telefoni-pannello fissi avranno una "Modalità Hub" a parte, dopo la F5.)
 * Le zone delle fasi future (scene, microfono) ci sono già, ma dichiarate "in
 * arrivo" e non toccabili: mai controlli che sembrano funzionare e non fanno niente.
 *
 * Chat dell'assistente (F4, mockup docs/mockup-f4.html, variante A): sul tablet
 * prende il posto delle stanze e della barra, orologio meteo e scene restano in
 * vista; altrove è a tutto schermo e il resto non si disegna (niente da far
 * scorrere sotto, niente sovrapposizioni).
 */
export class JarvisApp extends LitElement {
  static override styles = css`
    /* ---- base = modo ORIZZONTALE BASSO: la pagina scorre ---- */
    :host {
      display: grid;
      min-height: 100dvh;
      box-sizing: border-box;
      grid-template-columns: 300px minmax(0, 1fr);
      grid-template-rows: auto;
      grid-template-areas:
        "stato stato"
        "info destra"
        "scene destra"
        "barra barra";
      align-content: start;
      gap: 16px;
      padding: 16px;
      color: var(--testo);
      background:
        radial-gradient(
          900px 500px at 0% 0%,
          color-mix(in srgb, var(--accento) 22%, transparent),
          transparent 70%
        ),
        var(--sfondo);
      --dimensione-ora: 76px;
    }
    .icona {
      width: 28px;
      height: 28px;
      fill: currentColor;
      flex: none;
    }
    .stato {
      grid-area: stato;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px 16px;
      min-width: 0;
    }
    .info {
      grid-area: info;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .scene {
      grid-area: scene;
      align-self: end;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .scena {
      min-height: 72px;
      padding: 6px 4px;
      border-radius: var(--raggio);
      border: 1px dashed #343a46;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 16px;
      font-weight: 500;
      text-align: center;
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
      grid-template-rows: auto auto;
      grid-template-areas:
        "soggiorno veranda"
        "camera camera";
      align-content: start;
      gap: 12px;
      min-width: 0;
    }
    .barra {
      grid-area: barra;
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;
    }
    .chiedi {
      flex: 1;
      min-width: 0;
      min-height: 60px;
      border-radius: 30px;
      border: 1px solid #2b303a;
      background: var(--superficie);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: 12px;
      padding: 6px 24px;
      font: inherit;
      font-size: 18px;
      text-align: left;
      color: var(--attenuato);
      cursor: pointer;
      touch-action: manipulation;
    }
    .chiedi[disabled] {
      cursor: not-allowed;
      border-style: dashed;
      background: transparent;
    }
    .chiedi small {
      margin-left: auto;
      font-size: 13px;
    }
    .mic {
      flex: none;
      width: 76px;
      height: 60px;
      border-radius: 30px;
      border: 1px solid #2b303a;
      background: var(--superficie);
      display: grid;
      place-items: center;
      color: var(--testo);
      cursor: pointer;
      touch-action: manipulation;
    }
    .mic[disabled] {
      cursor: not-allowed;
      border-style: dashed;
      background: transparent;
      color: var(--attenuato);
    }
    .posto-banner {
      min-width: 0;
    }
    /* chat a tutto schermo (telefono): il resto della pagina non viene disegnato */
    jarvis-chat.intera {
      position: fixed;
      inset: 0;
      z-index: 20;
      border-radius: 0;
      border: none;
    }

    /* ---- modo VERTICALE: una colonna sola ---- */
    @media (max-width: 699px) {
      :host {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          "stato"
          "info"
          "destra"
          "scene"
          "barra";
        padding: 12px;
        --dimensione-ora: 64px;
      }
      .destra {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          "soggiorno"
          "veranda"
          "camera";
      }
      .mic {
        width: 60px;
      }
      .chiedi {
        padding: 6px 16px;
      }
    }

    /* ---- compatto: schermi orizzontali bassi (telefono), la pagina scorre ---- */
    @media (orientation: landscape) and (max-height: 559px) {
      :host {
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 8px;
        padding: 8px;
        --dimensione-ora: 72px;
      }
      .info {
        gap: 6px;
      }
      .scene {
        gap: 6px;
      }
      .scena {
        min-height: 48px;
        font-size: 13px;
        gap: 0;
      }
      .scena .icona {
        width: 20px;
        height: 20px;
      }
      .scena small {
        font-size: 11px;
        white-space: nowrap;
      }
      .scena .fase {
        display: none;
      }
      .destra {
        gap: 8px;
      }
      .chiedi {
        min-height: 48px;
        font-size: 15px;
        padding: 4px 16px;
      }
      .mic {
        height: 48px;
        width: 64px;
      }
    }

    /* ---- modo TABLET: il mockup, schermata unica senza scorrere ---- */
    @media (min-width: 900px) and (min-height: 560px) {
      :host {
        height: 100dvh;
        overflow: hidden;
        position: relative;
        grid-template-columns: 330px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) auto 60px;
        grid-template-areas:
          "info destra"
          "scene destra"
          "barra barra";
        --dimensione-ora: 108px;
      }
      .stato {
        position: absolute;
        top: 14px;
        right: 22px;
        z-index: 3;
      }
      .scena {
        height: 88px;
      }
      .destra {
        grid-template-rows: auto minmax(0, 1fr);
        padding-top: 22px; /* spazio per il pallino di connessione */
        min-height: 0;
      }
      .barra .posto-banner {
        display: flex;
        flex: 1;
        justify-content: center;
      }
      .barra.offline .chiedi,
      .barra.offline .mic {
        display: none;
      }
      /* chat al posto delle stanze (e della barra, se non c'è il banner) */
      jarvis-chat {
        grid-column: 2;
        grid-row: 1 / -1;
        margin-top: 22px; /* sotto il pallino di connessione */
      }
      jarvis-chat.sopra-banner {
        grid-row: 1 / 3;
      }
    }
  `;

  static override properties = { diagnostica: { state: true }, chat: { state: true } };
  declare diagnostica: boolean;
  declare chat: boolean;
  private readonly connessione = new OsservaConnessione(this);
  private readonly schermata = new OsservaSchermata(this);

  constructor() {
    super();
    this.diagnostica = false;
    this.chat = false;
    new OsservaRegistri(this);
    // la voce decide se mostrare il riquadro piccolo
    new OsservaVoce(this);
    this.addEventListener("chiudi-chat", () => {
      this.chat = false;
    });
    this.addEventListener("apri-chat", () => {
      this.chat = true;
    });
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
    // il banner esiste in UN posto solo: al posto della barra (schermata unica) o in cima
    const banner = offline && !loginRichiesto;
    const bannerNellaBarra = banner && this.schermata.unica;
    const bannerInCima = banner && !this.schermata.unica;
    const sovrapposti = html`
      ${loginRichiesto ? html`<jarvis-accesso></jarvis-accesso>` : nothing}
      ${this.diagnostica ? html`<jarvis-diagnostica tabindex="-1"></jarvis-diagnostica>` : nothing}
    `;
    const chatAperta = this.chat && !loginRichiesto;
    // riquadro piccolo della voce: solo a chat chiusa (a chat aperta la voce sta nella chat)
    const riquadro =
      !chatAperta && connessione.voce.riquadroVisibile
        ? html`<jarvis-voce-riquadro data-test="riquadro-voce"></jarvis-voce-riquadro>`
        : nothing;
    if (chatAperta && !this.schermata.unica)
      return html`<jarvis-avvisi></jarvis-avvisi><jarvis-chat class="intera"></jarvis-chat>${sovrapposti}`;
    return html`
      <jarvis-avvisi></jarvis-avvisi>
      <div class="stato">
        ${
          bannerInCima
            ? html`<div class="posto-banner"><jarvis-connessione parte="banner"></jarvis-connessione></div>`
            : nothing
        }
        <jarvis-connessione parte="pallino"></jarvis-connessione>
      </div>
      <section class="info">
        <jarvis-orologio></jarvis-orologio>
        <jarvis-meteo .nonAggiornato=${offline}></jarvis-meteo>
      </section>
      <div class="scene" role="group" aria-label="Scene, in arrivo" data-test="zona-scene">
        ${SCENE.map(
          (s) =>
            html`<div class="scena" aria-disabled="true">
              ${icona(s.icona)}${s.nome}<small>in arrivo<span class="fase"> (F3)</span></small>
            </div>`,
        )}
      </div>
      ${
        chatAperta
          ? html`<jarvis-chat class=${bannerNellaBarra ? "sopra-banner" : ""}></jarvis-chat>`
          : this.stanzeEBarra(stanze, offline, scollegato, bannerNellaBarra)
      }
      ${chatAperta && bannerNellaBarra ? this.barra(true, scollegato) : nothing} ${riquadro} ${sovrapposti}
    `;
  }

  private stanzeEBarra(
    stanze: ReturnType<typeof costruisciStanze>,
    offline: boolean,
    scollegato: boolean,
    bannerNellaBarra: boolean,
  ): TemplateResult {
    const r = connessione.registri;
    return html`
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
      ${this.barra(bannerNellaBarra, scollegato)}
    `;
  }

  private barra(bannerNellaBarra: boolean, scollegato: boolean): TemplateResult {
    return html`<div class="barra ${bannerNellaBarra ? "offline" : ""}" data-test="zona-assistente">
      ${
        bannerNellaBarra
          ? html`<div class="posto-banner"><jarvis-connessione parte="banner"></jarvis-connessione></div>`
          : nothing
      }
      <button
        class="chiedi"
        ?disabled=${scollegato}
        @click=${() => {
          // se la voce sta lavorando nel riquadro, la conversazione passa nella chat
          if (connessione.voce.riquadroVisibile) connessione.voce.spostaInChat();
          this.chat = true;
        }}
      >
        Chiedi a Jarvis… ${scollegato ? html`<small>non disponibile senza Home Assistant</small>` : nothing}
      </button>
      <button
        class="mic"
        aria-label="Parla con Jarvis"
        ?disabled=${scollegato || connessione.voce.attiva}
        @click=${() => void connessione.voce.parla("riquadro")}
      >
        ${icona(mdiMicrophone)}
      </button>
    </div>`;
  }
}
customElements.define("jarvis-app", JarvisApp);
