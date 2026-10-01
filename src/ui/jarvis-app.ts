import { mdiExitRun, mdiHomeImportOutline, mdiMicrophone, mdiWeatherNight } from "@mdi/js";
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { costruisciStanze } from "../registri/modello";
import { icona, OsservaConnessione, SCHERMATA_UNICA } from "./base";
import "./jarvis-avvisi";
import "./jarvis-orologio";
import "./jarvis-meteo";
import "./jarvis-stanza";
import "./jarvis-connessione";
import "./jarvis-accesso";
import "./jarvis-impostazioni";
import "./jarvis-riposo";
import "./jarvis-hub";
import { ascoltaGuida, mostraGuida } from "./jarvis-guida";
import { quandoPuoRiposare, vista } from "../vista/istanza";
import "./jarvis-chat";
import "./jarvis-voce-riquadro";
import "./jarvis-timer";

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

/*
 * Schermata unica (SCHERMATA_UNICA, in base.ts): il banner offline va al posto
 * della barra dell'assistente; altrimenti (pagina che scorre) va in cima.
 */

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

/**
 * Ridisegna quando un timer finisce o la suoneria si ferma (overlay "Timer …
 * finito"), e quando compare il primo timer o sparisce l'ultimo (sul tablet
 * prendono il posto dei prossimi giorni del meteo).
 */
class OsservaTimer implements ReactiveController {
  private smetti: (() => void) | null = null;
  private prima = "";
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    this.smetti = connessione.timer.ascolta(() => {
      // il conto alla rovescia lo ridisegna jarvis-timer: qui solo l'overlay e il posto dei timer
      const t = connessione.timer;
      const ora = `${t.suonano.length}/${t.attivi.length > 0}`;
      if (ora !== this.prima) this.host.requestUpdate();
      this.prima = ora;
    });
  }
  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
  }
}

/** Sul tablet la colonna a sinistra non scorre: al massimo tanti timer in vista, poi "+N". */
const TIMER_SUL_TABLET = 3;

/**
 * Ridisegna quando cambia la vista (completo, riposo, Hub), le sue impostazioni
 * o la procedura guidata. Ogni cambio della voce conta come attività: dall'Hub
 * si torna al riposo 30 s dopo che la voce ha finito, non 30 s dopo il tocco.
 */
class OsservaVista implements ReactiveController {
  private smetti: (() => void)[] = [];
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    this.smetti = [
      vista.ascolta(() => this.host.requestUpdate()),
      ascoltaGuida(() => this.host.requestUpdate()),
      connessione.voce.ascolta(() => vista.attivita()),
      connessione.assistente.ascolta(() => vista.attivita()),
    ];
  }
  hostDisconnected(): void {
    for (const f of this.smetti) f();
    this.smetti = [];
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
    /* riposo e Hub (fase G): a tutto schermo, niente griglia del pannello */
    :host([vista="riposo"]),
    :host([vista="hub"]) {
      display: block;
      padding: 0;
      min-height: 0;
      height: 100dvh;
      overflow: hidden;
    }
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

  static override properties = { impostazioni: { state: true }, chat: { state: true } };
  /**
   * Tasto "Indietro" di Android (v0.4.5): la chat aperta (e dalla fase G le
   * impostazioni) ha la sua voce nella cronologia, così Indietro la chiude
   * invece di uscire dall'app. La tastiera, se aperta, la chiude Android da
   * solo col primo Indietro.
   */
  private voceCronologia = false;
  private ignoraIndietro = false;
  /** Impostazioni del pannello (S1): si aprono tenendo premuto l'orologio 3 s. */
  declare impostazioni: boolean;
  declare chat: boolean;
  private readonly connessione = new OsservaConnessione(this);
  private readonly schermata = new OsservaSchermata(this);

  constructor() {
    super();
    this.impostazioni = false;
    this.chat = false;
    new OsservaVista(this);
    // il riposo non nasconde mai qualcosa in corso: voce, risposta, chat, impostazioni, login, guida
    quandoPuoRiposare(() => {
      const v = connessione.voce;
      return (
        !this.chat &&
        !this.impostazioni &&
        !mostraGuida() &&
        this.connessione.info.stato !== "login-richiesto" &&
        !(v.attiva && v.fase !== "errore") &&
        !connessione.assistente.occupato
      );
    });
    // «Jarvis» sentito (v0.5.0): dal riposo o dall'Hub si parla nell'Hub, con la chat aperta nella chat
    connessione.parola.doveParlare = () => {
      if (this.chat && this.connessione.info.stato !== "login-richiesto") return "chat";
      if (vista.vista === "riposo" || vista.vista === "hub") {
        vista.vai("hub", "«Jarvis» sentito");
        return "hub";
      }
      return "riquadro";
    };
    new OsservaRegistri(this);
    // la voce decide se mostrare il riquadro piccolo
    new OsservaVoce(this);
    new OsservaTimer(this);
    this.addEventListener("chiudi-chat", () => {
      this.chat = false;
    });
    this.addEventListener("apri-chat", () => {
      this.chat = true;
    });
    window.addEventListener("popstate", () => {
      if (this.ignoraIndietro) {
        this.ignoraIndietro = false;
        return;
      }
      if (!this.voceCronologia) return;
      this.voceCronologia = false;
      // prima ciò che sta sopra: le impostazioni coprono anche la chat
      if (this.impostazioni) this.impostazioni = false;
      else this.chat = false;
    });
    // l'orologio tenuto premuto 3 s manda ancora "apri-diagnostica" (nome storico)
    this.addEventListener("apri-diagnostica", () => {
      this.impostazioni = true;
    });
    this.addEventListener("chiudi-impostazioni", () => {
      this.impostazioni = false;
    });
  }

  protected override updated(cambiati: PropertyValues<this>): void {
    if (this.getAttribute("vista") !== vista.vista) this.setAttribute("vista", vista.vista);
    if (!cambiati.has("chat") && !cambiati.has("impostazioni")) return;
    const aperto = this.chat || this.impostazioni;
    if (aperto && !this.voceCronologia) {
      history.pushState({ jarvis: this.impostazioni ? "impostazioni" : "chat" }, "");
      this.voceCronologia = true;
    } else if (!aperto && this.voceCronologia) {
      // chiusa col tasto o da sola: si toglie la sua voce, senza richiuderla col popstate
      this.voceCronologia = false;
      this.ignoraIndietro = true;
      history.back();
    }
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
    const aRiposo = vista.vista === "riposo";
    const guida = !loginRichiesto && this.connessione.info.stato === "connesso" && mostraGuida();
    const sovrapposti = html`
      ${loginRichiesto ? html`<jarvis-accesso></jarvis-accesso>` : nothing}
      ${this.impostazioni ? html`<jarvis-impostazioni tabindex="-1"></jarvis-impostazioni>` : nothing}
      ${guida ? html`<jarvis-guida data-test="guida"></jarvis-guida>` : nothing}
      ${
        connessione.timer.suonano.length > 0
          ? html`<jarvis-timer-finito
              data-test="overlay-timer"
              ?notte=${aRiposo && vista.momento() === "notte"}
            ></jarvis-timer-finito>`
          : nothing
      }
    `;
    // fase G: riposo e Hub al posto del pannello (connessione, timer, voce restano accesi)
    if (vista.vista === "riposo" && !loginRichiesto)
      return html`<jarvis-riposo data-test="vista-riposo"></jarvis-riposo>${sovrapposti}`;
    if (vista.vista === "hub" && !loginRichiesto)
      return html`<jarvis-hub data-test="vista-hub"></jarvis-hub>${sovrapposti}`;
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
        <jarvis-timer .massimo=${this.schermata.unica ? TIMER_SUL_TABLET : Infinity}></jarvis-timer>
        <jarvis-meteo
          .nonAggiornato=${offline}
          .senzaGiorni=${this.schermata.unica && connessione.timer.attivi.length > 0}
        ></jarvis-meteo>
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
