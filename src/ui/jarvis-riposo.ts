import { mdiMusic, mdiPause, mdiThermometer, mdiTimerOutline } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { condizione, gradiInteri, numero } from "../meteo/testi";
import { formattaRimasto, rimastoMs, type TimerAttivo } from "../timer/timer";
import { vista } from "../vista/istanza";
import type { Momento } from "../vista/vista";
import { icona, OsservaConnessione, OsservaEntita, RiquadroSicuro, stileBase } from "./base";
import type { Anello } from "./jarvis-sfera";
import "./jarvis-sfera";

/** Cosa suona si rilegge ogni tanto (ogni lettura è una richiesta a Spotify). */
const MUSICA_OGNI_MS = 60_000;
/** Anti burn-in: il contenuto si sposta di pochi pixel ogni minuto. */
const SPOSTAMENTO_PX = 6;

interface Musica {
  titolo: string;
  artisti: string;
  stanza: string;
}

/**
 * Schermo a riposo, variante C (scelta di Salvatore, 30/09): la sfera fioca che
 * respira, l'orologio accanto, i timer come anelli attorno alla sfera e come
 * pastiglie col conto alla rovescia. Solo dati veri: meteo e temperature dal
 * negozio di HA, timer da jarvis_voce, musica da jarvis_musica.stato.
 * Colori per momento del giorno; di notte solo ora e timer, in rosso scuro,
 * sfera ferma.
 *
 * Tocco sulla sfera → Hub, e Jarvis ascolta subito. Tocco altrove → pannello completo.
 */
export class JarvisRiposo extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
        position: relative;
        height: 100dvh;
        overflow: hidden;
        cursor: default;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        --tinta: #8fb4ff;
        background: radial-gradient(1000px 520px at 85% 0%, #14203a 0%, #07090d 60%);
      }
      :host([momento="mattina"]) {
        --tinta: #f3c77a;
        background: radial-gradient(1000px 520px at 85% 0%, #3a2c14 0%, #0b0a08 60%);
      }
      :host([momento="sera"]) {
        --tinta: #ff9e6b;
        background: radial-gradient(1000px 520px at 15% 100%, #2a1510 0%, #060404 60%);
      }
      :host([momento="notte"]) {
        --tinta: #b8452f;
        background: #000;
        color: #b8452f;
      }
      /* 8 px di margine: lo spostamento anti burn-in (±6 px) resta dentro lo schermo */
      .contenuto {
        position: absolute;
        inset: 8px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 48px;
        padding: 24px 48px;
        transition: transform 2s ease;
      }
      jarvis-sfera {
        --lato: min(62vh, 36vw);
        cursor: pointer;
      }
      .testo {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .ora {
        font-size: min(150px, 25vh, 15vw);
        font-weight: 200;
        letter-spacing: -0.03em;
        line-height: 0.9;
        font-variant-numeric: tabular-nums;
      }
      .data {
        font-size: 24px;
        color: var(--attenuato);
      }
      .righe {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 20px;
        color: #c9d0dc;
      }
      .riga {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .riga .icona,
      .chip .icona {
        width: 22px;
        height: 22px;
        color: var(--tinta);
      }
      .riga span {
        min-width: 0;
        overflow-wrap: break-word;
      }
      .attenuato {
        color: var(--attenuato);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 4px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid #2b303a;
        background: #0f1116cc;
        font-size: 20px;
      }
      /* nomi lunghi: vanno a capo tra le parole, mai dentro una parola (CLAUDE.md, lezioni) */
      .chip .nome {
        overflow-wrap: break-word;
      }
      .chip b {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .chip.pausa b {
        color: var(--attenuato);
      }
      .avviso {
        color: var(--avviso);
        font-size: 17px;
      }
      :host([momento="notte"]) .ora,
      :host([momento="notte"]) .chip {
        color: #b8452f;
      }
      :host([momento="notte"]) .chip {
        border-color: #3a130b;
        background: transparent;
      }
      /* telefono in verticale: sfera sopra, testo sotto */
      @media (max-width: 699px) {
        .contenuto {
          grid-template-columns: minmax(0, 1fr);
          justify-items: center;
          align-content: center;
          gap: 16px;
          padding: 12px 8px;
          text-align: center;
        }
        jarvis-sfera {
          --lato: min(56vw, 28vh);
        }
        .righe,
        .chip {
          font-size: 17px;
        }
        .data {
          font-size: 19px;
        }
        .testo {
          align-items: center;
        }
        .riga {
          justify-content: center;
        }
        .chips {
          justify-content: center;
        }
        .ora {
          font-size: min(88px, 22vw);
        }
      }
      /* orizzontale basso (telefono): tutto più piccolo */
      @media (orientation: landscape) and (max-height: 559px) {
        .contenuto {
          gap: 28px;
          padding: 4px 20px;
        }
        .testo {
          gap: 4px;
        }
        .ora {
          font-size: min(96px, 22vh);
        }
        .data {
          font-size: 16px;
        }
        .righe {
          gap: 2px;
        }
        .righe,
        .chip {
          font-size: 15px;
        }
        .chip {
          padding: 3px 10px;
        }
        .chips {
          gap: 6px;
          margin-top: 2px;
        }
      }
    `,
  ];

  private readonly stato = new OsservaConnessione(this);
  private smettiTimer: (() => void) | null = null;
  private smettiVista: (() => void) | null = null;
  private battito: ReturnType<typeof setInterval> | undefined;
  private timerMusica: ReturnType<typeof setInterval> | undefined;
  private musica: Musica | null = null;
  private avvisatoMusica = false;
  private spostamento = { x: 0, y: 0 };
  private minuto = -1;

  constructor() {
    super();
    // meteo e temperature delle stanze: si ridisegna quando cambiano
    new OsservaEntita(this, () => [
      PREFERENZE.meteo,
      ...PREFERENZE.stanze.flatMap((s) => (s.clima ? [s.clima.temperatura] : [])),
    ]);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.smettiTimer = connessione.timer.ascolta(() => this.requestUpdate());
    this.smettiVista = vista.ascolta(() => this.requestUpdate());
    // un secondo alla volta: orologio e conto alla rovescia (la pagina è leggera, a riposo non c'è altro)
    this.battito = setInterval(() => this.requestUpdate(), 1000);
    this.addEventListener("click", this.suTocco);
    void this.leggiMusica();
    this.timerMusica = setInterval(() => void this.leggiMusica(), MUSICA_OGNI_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiTimer?.();
    this.smettiVista?.();
    this.smettiTimer = this.smettiVista = null;
    clearInterval(this.battito);
    clearInterval(this.timerMusica);
    this.removeEventListener("click", this.suTocco);
  }

  private readonly suTocco = (e: Event): void => {
    const sullaSfera = e
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.localName === "jarvis-sfera");
    if (sullaSfera && this.stato.info.stato === "connesso") {
      vista.vai("hub", "tocco sulla sfera");
      void connessione.voce.parla("hub");
      return;
    }
    vista.vai("completo", "tocco sul riposo");
  };

  private async leggiMusica(): Promise<void> {
    if (this.stato.info.stato !== "connesso") return;
    try {
      const r = await connessione.statoMusica();
      this.musica =
        r["stato"] === "in_riproduzione" && typeof r["titolo"] === "string"
          ? {
              titolo: r["titolo"],
              artisti: typeof r["artisti"] === "string" ? r["artisti"] : "",
              stanza: typeof r["stanza"] === "string" ? r["stanza"] : "",
            }
          : null;
    } catch (errore) {
      // componente non installato o Spotify giù: sul riposo semplicemente non c'è la riga
      this.musica = null;
      if (!this.avvisatoMusica) log.avviso(`Riposo: cosa suona non leggibile: ${descriviErrore(errore)}`);
      this.avvisatoMusica = true;
    }
    this.requestUpdate();
  }

  protected override updated(): void {
    // anti burn-in: ogni minuto qualche pixel più in là
    const m = new Date().getMinutes();
    if (m === this.minuto) return;
    this.minuto = m;
    const caso = (): number => Math.round((Math.random() * 2 - 1) * SPOSTAMENTO_PX);
    this.spostamento = { x: caso(), y: caso() };
    const c = this.renderRoot.querySelector<HTMLElement>(".contenuto");
    if (c) c.style.transform = `translate(${this.spostamento.x}px, ${this.spostamento.y}px)`;
  }

  private righe(): TemplateResult {
    const n = connessione.negozio;
    const meteo = n.entitaDi(PREFERENZE.meteo);
    const c = meteo ? condizione(meteo.state) : null;
    const t = meteo ? gradiInteri(meteo.attributes["temperature"]) : null;
    const stanze = PREFERENZE.stanze.flatMap((s) => {
      const v = s.clima ? numero(n.entitaDi(s.clima.temperatura)?.state) : null;
      return v ? [`${s.area} ${v}°`] : [];
    });
    return html`<div class="righe" data-test="riposo-righe">
      ${
        c && t
          ? html`<div class="riga">
              ${icona(c.icona)}<span>${t} <span class="attenuato">${c.testo.toLowerCase()}</span></span>
            </div>`
          : nothing
      }
      ${stanze.length ? html`<div class="riga">${icona(mdiThermometer)}<span>${stanze.join(" · ")}</span></div>` : nothing}
      ${
        this.musica
          ? html`<div class="riga" data-test="riposo-musica">
              ${icona(mdiMusic)}<span
                >${this.musica.titolo}${this.musica.artisti ? ` · ${this.musica.artisti}` : ""}${
                  this.musica.stanza ? html` <span class="attenuato">· ${this.musica.stanza}</span>` : ""
                }</span
              >
            </div>`
          : nothing
      }
    </div>`;
  }

  private chips(timer: readonly TimerAttivo[], ora: number, notte: boolean): TemplateResult {
    const inVista = timer.slice(0, notte ? 1 : 3);
    return html`<div class="chips">
      ${inVista.map(
        (t) =>
          html`<span class="chip ${t.inPausa ? "pausa" : ""}" data-test="riposo-timer">
            ${icona(t.inPausa ? mdiPause : mdiTimerOutline)}${t.nome ? html`<span class="nome">${t.nome}</span>` : ""}
            <b>${formattaRimasto(rimastoMs(t, ora))}</b>
          </span>`,
      )}
      ${timer.length > inVista.length ? html`<span class="chip">+${timer.length - inVista.length}</span>` : nothing}
    </div>`;
  }

  protected disegna(): TemplateResult {
    const adesso = new Date();
    const ora = adesso.getTime();
    const momento: Momento = vista.momento(adesso);
    if (this.getAttribute("momento") !== momento) this.setAttribute("momento", momento);
    const notte = momento === "notte";
    const timer = connessione.timer.attivi;
    const anelli: Anello[] = timer.slice(0, notte ? 1 : 2).map((t) => ({
      frazione: t.secondiTotali ? rimastoMs(t, ora) / (t.secondiTotali * 1000) : 1,
      pausa: t.inPausa,
    }));
    const offline = this.stato.offline;
    return html`<div class="contenuto" data-test="riposo" data-momento=${momento}>
      <jarvis-sfera
        stato=${notte ? "notturna" : "fioca"}
        .anelli=${anelli}
        role="button"
        aria-label="Parla con Jarvis"
        data-test="riposo-sfera"
      ></jarvis-sfera>
      <div class="testo">
        <div class="ora" data-test="riposo-ora">
          ${adesso.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </div>
        ${
          notte
            ? nothing
            : html`<div class="data">
                ${adesso.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </div>`
        }
        ${notte ? nothing : this.righe()} ${timer.length ? this.chips(timer, ora, notte) : nothing}
        ${
          offline
            ? html`<div class="avviso" role="status">
                Home Assistant non raggiungibile: dati non aggiornati
              </div>`
            : nothing
        }
      </div>
    </div>`;
  }
}
customElements.define("jarvis-riposo", JarvisRiposo);
