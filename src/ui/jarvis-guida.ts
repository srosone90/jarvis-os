import { mdiHome, mdiMicrophone, mdiMicrophoneOff, mdiWeatherNight } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { impostaStanzaPannello, stanzaPannello } from "../voce/stanza-pannello";
import { vista } from "../vista/istanza";
import { icona, RiquadroSicuro, stileBase } from "./base";

/**
 * Procedura guidata del primo avvio, variante S3 (scelta di Salvatore, 30/09),
 * pensata per le altre case: una domanda per schermata. Stanza, schermo a
 * riposo e «Jarvis» sempre in ascolto (v0.5.0); la pronuncia si insegna poi
 * da Impostazioni → Voce, perché richiede qualche minuto.
 * Un pannello che ha già una stanza (installato prima) la considera fatta.
 * Si rifà dalle impostazioni, sezione "Stanza e nome".
 */
const CHIAVE = "jarvis-guida";
const ascoltatori = new Set<() => void>();

/**
 * "Pannello di prima della fase G" si decide UNA volta, alla prima domanda:
 * se lo si rivalutasse a ogni ridisegno, la guida si chiuderebbe da sola
 * appena si sceglie la stanza al passo 1 (visto nella prova e2e).
 */
let primaStanza: boolean | null = null;

export function guidaDaFare(): boolean {
  try {
    if (localStorage.getItem(CHIAVE) === "fatta") return false;
    primaStanza ??= stanzaPannello() !== null;
    if (primaStanza) {
      // pannello di prima della fase G: la stanza l'aveva già scelta
      localStorage.setItem(CHIAVE, "fatta");
      return false;
    }
    return true;
  } catch (errore) {
    // senza localStorage la guida tornerebbe a ogni avvio: meglio saltarla
    log.avviso(`Procedura guidata saltata, localStorage non disponibile: ${descriviErrore(errore)}`);
    return false;
  }
}

function segna(fatta: boolean): void {
  try {
    if (fatta) localStorage.setItem(CHIAVE, "fatta");
    else localStorage.removeItem(CHIAVE);
  } catch (errore) {
    log.avviso(`Procedura guidata: stato non salvato: ${descriviErrore(errore)}`);
  }
  for (const f of ascoltatori) f();
}

export function rifaiGuida(): void {
  log.info("Procedura guidata: rifatta dalle impostazioni");
  segna(false);
  // con la stanza già scelta guidaDaFare() direbbe "fatta": la si riapre esplicitamente
  daRifare = true;
  for (const f of ascoltatori) f();
}
let daRifare = false;

/** La guida va mostrata adesso? */
export function mostraGuida(): boolean {
  return daRifare || guidaDaFare();
}

export function ascoltaGuida(f: () => void): () => void {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}

type Passo = "stanza" | "riposo" | "voce" | "fine";

export class JarvisGuida extends RiquadroSicuro {
  static override properties = { passo: { state: true } };
  declare passo: Passo;

  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 35;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 40px 24px;
        background: var(--sfondo);
      }
      .passi {
        display: flex;
        gap: 8px;
      }
      .passi i {
        flex: 1;
        height: 6px;
        border-radius: 3px;
        background: #2b303a;
      }
      .passi i.fatto {
        background: var(--accento);
      }
      h1 {
        margin: 8px 0 0;
        font-size: 30px;
        font-weight: 500;
      }
      p {
        margin: 0;
        color: var(--attenuato);
        font-size: 18px;
        line-height: 1.4;
      }
      .scelte {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
      }
      .scelta {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 64px;
        padding: 12px 18px;
        border-radius: 16px;
        border: 2px solid #232834;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 20px;
        text-align: left;
        cursor: pointer;
      }
      .scelta[aria-pressed="true"] {
        border-color: var(--accento);
        background: #18223a;
      }
      .scelta .icona {
        color: var(--accento);
      }
      .fondo {
        margin-top: auto;
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .fondo button {
        min-height: 52px;
        padding: 0 22px;
        border-radius: 14px;
        border: none;
        font: inherit;
        font-size: 18px;
        cursor: pointer;
        background: var(--superficie-2);
        color: var(--testo);
      }
      .fondo button.avanti {
        background: var(--accento);
        color: #0d0f13;
        font-weight: 600;
      }
      @media (max-width: 699px) {
        :host {
          padding: 16px;
        }
        h1 {
          font-size: 24px;
        }
      }
      @media (orientation: landscape) and (max-height: 559px) {
        :host {
          padding: 12px 24px 16px;
          gap: 10px;
        }
        h1 {
          font-size: 24px;
          margin: 0;
        }
        p {
          font-size: 16px;
        }
        .scelta {
          min-height: 52px;
          font-size: 17px;
        }
      }
    `,
  ];

  private smettiRegistri: (() => void) | null = null;

  constructor() {
    super();
    this.passo = "stanza";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // le stanze arrivano da HA: si ridisegna quando i registri sono letti
    this.smettiRegistri = connessione.registri.ascolta(() => this.requestUpdate());
    log.info("Procedura guidata del primo avvio");
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiRegistri?.();
    this.smettiRegistri = null;
  }

  private fine(): void {
    daRifare = false;
    log.info("Procedura guidata finita");
    segna(true);
  }

  private stanza(): TemplateResult {
    const attuale = stanzaPannello();
    const aree = [...connessione.registri.aree.map((a) => a.name)].sort((a, b) => a.localeCompare(b, "it"));
    return html`<h1>In che stanza sta questo pannello?</h1>
      <p>
        Le stanze arrivano da Home Assistant. Servono ai timer (suonano solo qui) e alla musica, che si ferma
        mentre parli con Jarvis.
      </p>
      <div class="scelte" role="group" aria-label="Stanza">
        ${
          aree.length
            ? aree.map(
                (a) =>
                  html`<button
                    class="scelta"
                    aria-pressed=${a === attuale ? "true" : "false"}
                    data-test="guida-stanza"
                    @click=${() => {
                      impostaStanzaPannello(a);
                      this.requestUpdate();
                    }}
                  >
                    ${icona(mdiHome)}${a}
                  </button>`,
              )
            : html`<p>Aspetto le stanze da Home Assistant…</p>`
        }
      </div>
      <div class="fondo">
        <button data-test="guida-salta" @click=${() => (this.passo = "riposo")}>Salta</button>
        <button
          class="avanti"
          data-test="guida-avanti"
          ?disabled=${!attuale}
          @click=${() => (this.passo = "riposo")}
        >
          Avanti
        </button>
      </div>`;
  }

  private riposo(): TemplateResult {
    const attesa = vista.impostazioni.attesaMin;
    const scelte: [number | null, string][] = [
      [2, "Dopo 2 minuti (consigliato)"],
      [5, "Dopo 5 minuti"],
      [null, "Mai da solo"],
    ];
    return html`<h1>Quando va a riposo lo schermo?</h1>
      <p>
        A riposo compare la sfera con l'orologio e i timer. Timer, voce e musica restano accesi. Toccando la
        sfera parli con Jarvis.
      </p>
      <div class="scelte" role="group" aria-label="Schermo a riposo">
        ${scelte.map(
          ([m, t]) =>
            html`<button
              class="scelta"
              aria-pressed=${attesa === m ? "true" : "false"}
              data-test="guida-riposo"
              @click=${() => {
                vista.imposta({ attesaMin: m });
                this.requestUpdate();
              }}
            >
              ${icona(mdiWeatherNight)}${t}
            </button>`,
        )}
      </div>
      <div class="fondo">
        <button @click=${() => (this.passo = "stanza")}>Indietro</button>
        <button class="avanti" data-test="guida-avanti" @click=${() => (this.passo = "voce")}>Avanti</button>
      </div>`;
  }

  private voce(): TemplateResult {
    const acceso = connessione.parola.acceso;
    const scelte: [boolean, string, string][] = [
      [true, mdiMicrophone, "Sì, sempre in ascolto (consigliato)"],
      [false, mdiMicrophoneOff, "No, solo quando tocco il microfono"],
    ];
    return html`<h1>Jarvis ti ascolta quando dici «Jarvis»?</h1>
      <p>
        Il microfono resta aperto e riconosce la parola qui sul pannello: a Home Assistant va solo quello che
        dici dopo «Jarvis». In alto compare sempre il simbolo del microfono. Per insegnargli la tua pronuncia:
        Impostazioni → Voce.
      </p>
      <div class="scelte" role="group" aria-label="«Jarvis» sempre in ascolto">
        ${scelte.map(
          ([v, ic, t]) =>
            html`<button
              class="scelta"
              aria-pressed=${acceso === v ? "true" : "false"}
              data-test="guida-parola"
              @click=${() => {
                if (connessione.parola.acceso !== v) connessione.parola.imposta(v);
                this.requestUpdate();
              }}
            >
              ${icona(ic)}${t}
            </button>`,
        )}
      </div>
      <div class="fondo">
        <button @click=${() => (this.passo = "riposo")}>Indietro</button>
        <button class="avanti" data-test="guida-avanti" @click=${() => (this.passo = "fine")}>Avanti</button>
      </div>`;
  }

  private riepilogo(): TemplateResult {
    const stanza = stanzaPannello();
    const attesa = vista.impostazioni.attesaMin;
    return html`<h1>Fatto</h1>
      <p data-test="guida-riepilogo">
        Stanza: <b>${stanza ?? "nessuna"}</b>. Schermo a riposo:
        <b>${attesa === null ? "mai da solo" : `dopo ${attesa} minuti`}</b>. «Jarvis» sempre in ascolto:
        <b>${connessione.parola.acceso ? "sì" : "no"}</b>.
      </p>
      <p>Per cambiare queste scelte tieni premuto l'orologio per 3 secondi: si aprono le impostazioni.</p>
      <div class="fondo">
        <button @click=${() => (this.passo = "voce")}>Indietro</button>
        <button class="avanti" data-test="guida-fine" @click=${() => this.fine()}>Inizia</button>
      </div>`;
  }

  protected disegna(): TemplateResult {
    const n = { stanza: 1, riposo: 2, voce: 3, fine: 4 }[this.passo];
    return html`<div class="passi" aria-label="Passo ${n} di 4">
        ${[1, 2, 3, 4].map((i) => html`<i class=${i <= n ? "fatto" : ""}></i>`)}
      </div>
      ${
        this.passo === "stanza"
          ? this.stanza()
          : this.passo === "riposo"
            ? this.riposo()
            : this.passo === "voce"
              ? this.voce()
              : this.passo === "fine"
                ? this.riepilogo()
                : nothing
      }`;
  }
}
customElements.define("jarvis-guida", JarvisGuida);
