import {
  mdiBullhorn,
  mdiClose,
  mdiViewDashboardOutline,
  mdiHome,
  mdiInformationOutline,
  mdiMicrophone,
  mdiVolumeHigh,
  mdiWeatherNight,
} from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { log } from "../diagnostica/log";
import { dispositivoDi } from "../timer/pannello";
import { audioSveglio, type StatoAudioSveglio } from "../voce/audio-sveglio";
import { impostaStanzaPannello, stanzaPannello } from "../voce/stanza-pannello";
import { vista } from "../vista/istanza";
import { ATTESE_POSSIBILI } from "../vista/vista";
import { icona, RiquadroSicuro, stileBase } from "./base";
import { rifaiGuida } from "./jarvis-guida";
import "./jarvis-diagnostica";
import "./jarvis-impostazioni-voce";
import "./jarvis-impostazioni-annunci";
import "./jarvis-impostazioni-schermate";

export type Sezione = "stanza" | "schermate" | "voce" | "annunci" | "riposo" | "audio" | "diagnostica";

const SEZIONI: { id: Sezione; titolo: string; icona: string }[] = [
  { id: "stanza", titolo: "Stanza e nome", icona: mdiHome },
  { id: "schermate", titolo: "Schermate", icona: mdiViewDashboardOutline },
  { id: "voce", titolo: "Voce", icona: mdiMicrophone },
  { id: "annunci", titolo: "Jarvis parla per primo", icona: mdiBullhorn },
  { id: "riposo", titolo: "Schermo a riposo", icona: mdiWeatherNight },
  { id: "audio", titolo: "Audio", icona: mdiVolumeHigh },
  { id: "diagnostica", titolo: "Diagnostica", icona: mdiInformationOutline },
];

/**
 * Impostazioni del pannello, variante S1 (scelta di Salvatore, 30/09): elenco
 * delle sezioni a sinistra, contenuto a destra, come le impostazioni di
 * Android. Si aprono tenendo premuto l'orologio 3 s, senza PIN: valgono solo
 * per questo dispositivo. Solo impostazioni che funzionano davvero oggi. La
 * sezione Voce («Jarvis» sempre in ascolto, pronuncia) è della v0.5.0. La
 * diagnostica di prima è l'ultima sezione.
 */
export class JarvisImpostazioni extends RiquadroSicuro {
  static override properties = { sezione: { state: true } };
  declare sezione: Sezione;

  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        background: var(--sfondo);
      }
      header {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px 10px 20px;
        border-bottom: 1px solid #20242d;
      }
      h1 {
        flex: 1;
        margin: 0;
        font-size: 22px;
        font-weight: 600;
      }
      .tondo {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        background: var(--superficie-2);
        color: var(--testo);
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      nav {
        display: flex;
        flex-direction: column;
        padding: 8px 0;
        border-right: 1px solid #20242d;
        background: #10131a;
        overflow: auto;
      }
      nav button {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 52px;
        padding: 0 20px;
        border: none;
        border-left: 4px solid transparent;
        background: none;
        color: #c9d0dc;
        font: inherit;
        font-size: 17px;
        text-align: left;
        cursor: pointer;
      }
      nav button .icona {
        width: 24px;
        height: 24px;
        color: var(--attenuato);
      }
      nav button[aria-current="true"] {
        background: #1c2640;
        color: #fff;
        border-left-color: var(--accento);
      }
      nav button[aria-current="true"] .icona {
        color: var(--accento);
      }
      main {
        overflow: auto;
        padding: 8px 24px 24px;
        min-width: 0;
      }
      main.diagnostica {
        padding: 0;
        display: flex;
      }
      jarvis-diagnostica {
        flex: 1;
        min-width: 0;
      }
      .voce {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 16px;
        padding: 14px 0;
        border-bottom: 1px solid #1c2029;
      }
      .voce > div {
        flex: 1 1 260px;
        min-width: 0;
      }
      .voce b {
        font-weight: 500;
        font-size: 18px;
      }
      .voce small {
        display: block;
        color: var(--attenuato);
        font-size: 14px;
        margin-top: 3px;
        overflow-wrap: break-word;
      }
      .avviso {
        color: var(--avviso-testo);
      }
      select,
      button.azione {
        min-height: 48px;
        max-width: 100%;
        border-radius: 12px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 16px;
        padding: 0 14px;
        cursor: pointer;
      }
      .interruttore {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        cursor: pointer;
      }
      .interruttore input {
        flex: none;
        width: 26px;
        height: 26px;
        accent-color: var(--accento);
      }
      .notte {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      /* telefono in verticale: le sezioni diventano una riga di linguette in alto */
      @media (max-width: 699px) {
        :host {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto auto minmax(0, 1fr);
        }
        nav {
          flex-direction: row;
          flex-wrap: wrap;
          border-right: none;
          border-bottom: 1px solid #20242d;
          padding: 4px;
        }
        nav button {
          flex: 1 1 45%;
          min-height: 44px;
          padding: 0 10px;
          font-size: 15px;
          border-left: none;
          border-radius: 10px;
        }
        main {
          padding: 4px 16px 16px;
        }
      }
      @media (orientation: landscape) and (max-height: 559px) {
        :host {
          grid-template-columns: 210px minmax(0, 1fr);
        }
        header {
          padding: 4px 12px 4px 16px;
        }
        nav button {
          min-height: 44px;
          font-size: 15px;
          padding: 0 12px;
        }
      }
    `,
  ];

  private smettiVista: (() => void) | null = null;

  constructor() {
    super();
    this.sezione = "stanza";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("keydown", this.suTasto);
    this.smettiVista = vista.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.suTasto);
    this.smettiVista?.();
    this.smettiVista = null;
  }

  private readonly suTasto = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.chiudi();
  };

  private chiudi(): void {
    this.dispatchEvent(new CustomEvent("chiudi-impostazioni", { bubbles: true, composed: true }));
  }

  private stanza(): TemplateResult {
    const attuale = stanzaPannello();
    const aree = [...connessione.registri.aree.map((a) => a.name)].sort((a, b) => a.localeCompare(b, "it"));
    if (attuale && !aree.includes(attuale)) aree.unshift(attuale);
    return html`<div class="voce">
        <div>
          <b>Stanza di questo pannello</b>
          <small>Serve ai timer (suonano solo qui) e alla musica che si ferma mentre parli con Jarvis.</small>
          ${
            attuale
              ? html`<small data-test="dispositivo-timer"
                  >Timer e voce di questo pannello: ${dispositivoDi(attuale)}</small
                >`
              : html`<small class="avviso" data-test="avviso-stanza"
                  >Scegli la stanza per i timer: senza, qui suonano solo i timer chiesti da pannelli senza
                  stanza, mai quelli di una stanza. E la musica non si tocca.</small
                >`
          }
        </div>
        <select
          data-test="stanza-pannello"
          aria-label="Stanza di questo pannello"
          @change=${(e: Event) => {
            impostaStanzaPannello((e.target as HTMLSelectElement).value || null);
            this.requestUpdate();
          }}
        >
          <option value="" ?selected=${!attuale}>Nessuna</option>
          ${aree.map((a) => html`<option value=${a} ?selected=${a === attuale}>${a}</option>`)}
        </select>
      </div>
      <div class="voce">
        <div>
          <b>Procedura guidata</b>
          <small>Le domande del primo avvio: stanza, schermo a riposo e «Jarvis» sempre in ascolto.</small>
        </div>
        <button class="azione" data-test="rifai-guida" @click=${() => this.rifai()}>Rifalla</button>
      </div>`;
  }

  private rifai(): void {
    rifaiGuida();
    this.chiudi();
  }

  private riposo(): TemplateResult {
    const imp = vista.impostazioni;
    const ore = Array.from({ length: 24 }, (_, h) => h);
    const ora = (h: number): string => `${String(h).padStart(2, "0")}:00`;
    return html`<div class="voce">
        <div>
          <b>Va a riposo da solo</b>
          <small
            >Dopo quanto tempo senza tocchi compare la sfera. Timer, voce e musica restano accesi: cambia solo
            lo schermo.</small
          >
        </div>
        <select
          data-test="riposo-attesa"
          aria-label="Attesa prima del riposo"
          @change=${(e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            vista.imposta({ attesaMin: v === "mai" ? null : Number(v) });
          }}
        >
          ${ATTESE_POSSIBILI.map(
            (m) => html`<option value=${m} ?selected=${imp.attesaMin === m}>dopo ${m} min</option>`,
          )}
          <option value="mai" ?selected=${imp.attesaMin === null}>mai da solo</option>
        </select>
      </div>
      <div class="voce">
        <div>
          <b>Notte</b>
          <small>Di notte il riposo mostra solo ora e timer, in rosso scuro, e la sfera sta ferma.</small>
        </div>
        <span class="notte">
          dalle
          <select
            data-test="notte-da"
            aria-label="Inizio della notte"
            @change=${(e: Event) => vista.imposta({ notteDa: Number((e.target as HTMLSelectElement).value) })}
          >
            ${ore.map((h) => html`<option value=${h} ?selected=${imp.notteDa === h}>${ora(h)}</option>`)}
          </select>
          alle
          <select
            data-test="notte-a"
            aria-label="Fine della notte"
            @change=${(e: Event) => vista.imposta({ notteA: Number((e.target as HTMLSelectElement).value) })}
          >
            ${ore.map((h) => html`<option value=${h} ?selected=${imp.notteA === h}>${ora(h)}</option>`)}
          </select>
        </span>
      </div>
      <div class="voce">
        <div>
          <b>Provalo adesso</b>
          <small>Chiude le impostazioni e mette subito il pannello a riposo.</small>
        </div>
        <button
          class="azione"
          data-test="prova-riposo"
          @click=${() => {
            this.chiudi();
            vista.vai("riposo", "prova dalle impostazioni");
          }}
        >
          Metti a riposo
        </button>
      </div>`;
  }

  /** Rumore a -80 dB per l'Echo in Bluetooth: acceso di serie (v0.4.5). */
  private audio(): TemplateResult {
    const testo: Record<StatoAudioSveglio, string> = {
      attivo: "attivo",
      "attesa-tocco": "parte al primo tocco",
      sospeso: "sospeso dal sistema, riprende al tocco",
      spento: "spento",
      "non-disponibile": "non disponibile su questo browser",
    };
    return html`<div class="voce">
      <div>
        <b>Audio sveglio</b>
        <small
          >Un rumore che non si sente tiene sveglio l'altoparlante Bluetooth, così l'Echo non annuncia «In
          riproduzione da…» prima di ogni risposta. Stato:
          <span data-test="stato-audio-sveglio">${testo[audioSveglio.stato]}</span></small
        >
      </div>
      <label class="interruttore">
        <input
          type="checkbox"
          data-test="audio-sveglio"
          aria-label="Audio sveglio"
          .checked=${audioSveglio.attivo}
          @change=${(e: Event) => {
            audioSveglio.imposta((e.target as HTMLInputElement).checked);
            this.requestUpdate();
          }}
        />
      </label>
    </div>`;
  }

  protected override firstUpdated(): void {
    log.info("Impostazioni aperte");
    // lo stato dell'audio sveglio cambia da solo (primo tocco, sistema)
    this.addEventListener("pointerdown", () => setTimeout(() => this.requestUpdate(), 200));
  }

  protected disegna(): TemplateResult {
    const s = this.sezione;
    const corpo =
      s === "stanza"
        ? this.stanza()
        : s === "voce"
          ? html`<jarvis-impostazioni-voce></jarvis-impostazioni-voce>`
          : s === "schermate"
            ? html`<jarvis-impostazioni-schermate></jarvis-impostazioni-schermate>`
            : s === "annunci"
              ? html`<jarvis-impostazioni-annunci></jarvis-impostazioni-annunci>`
              : s === "riposo"
                ? this.riposo()
                : s === "audio"
                  ? this.audio()
                  : html`<jarvis-diagnostica></jarvis-diagnostica>`;
    return html`<header>
        <h1>Impostazioni</h1>
        <button
          class="tondo"
          aria-label="Chiudi le impostazioni"
          data-test="chiudi-impostazioni"
          @click=${() => this.chiudi()}
        >
          ${icona(mdiClose)}
        </button>
      </header>
      <nav aria-label="Sezioni">
        ${SEZIONI.map(
          (x) =>
            html`<button
              aria-current=${x.id === s ? "true" : "false"}
              data-test="sezione-${x.id}"
              @click=${() => (this.sezione = x.id)}
            >
              ${icona(x.icona)}${x.titolo}
            </button>`,
        )}
      </nav>
      <main class=${s === "diagnostica" ? "diagnostica" : ""} data-test="impostazioni">${corpo}</main>
      ${nothing}`;
  }
}
customElements.define("jarvis-impostazioni", JarvisImpostazioni);
