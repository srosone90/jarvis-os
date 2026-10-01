import { mdiPauseCircleOutline, mdiTimerOutline } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { chiediEAspetta } from "../assistente/chiedi";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { schermate } from "../pagine/preferenze";
import { durataParlata, etichettaDurata, fraseAnnullaTimer, fraseNuovoTimer } from "../timer/frasi";
import { formattaRimasto, rimastoMs, type TimerAttivo } from "../timer/timer";
import { icona, RiquadroSicuro, stileBase } from "./base";
import { stilePagina } from "./stile-pagina";

/**
 * Schermata Timer (v0.5.7, mockup N2 "6 · Timer e sveglie"): i timer di
 * questo pannello con il conto alla rovescia, e i pulsanti per uno nuovo.
 * Il server non ha un servizio per crearli: i pulsanti chiedono a Jarvis la
 * frase che si direbbe a voce (src/timer/frasi.ts), con il device_id del
 * pannello, così il timer suona qui. Sveglie e promemoria arriveranno quando
 * il server li avrà (STATO.md).
 */
export class JarvisPaginaTimer extends RiquadroSicuro {
  static override properties = { inviata: { state: true } };
  declare inviata: string | null;

  static override styles = [
    stileBase,
    stilePagina,
    css`
      .resto {
        font-size: 30px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .rapidi {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        gap: 8px;
      }
      .rapidi button {
        min-height: 56px;
        border-radius: 14px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 18px;
        cursor: pointer;
        touch-action: manipulation;
      }
      .rapidi button:disabled,
      .riga button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .riga button {
        min-height: 44px;
        padding: 0 12px;
        border-radius: 22px;
        border: 1px solid #343a46;
        background: none;
        color: var(--attenuato);
        font: inherit;
        font-size: 15px;
        cursor: pointer;
        flex: none;
      }
      .pausa {
        color: #ffd27a;
      }
      /* sul telefono stretto il conto e «Annulla» vanno sotto il nome, mai il nome spezzato */
      .riga.timer {
        flex-wrap: wrap;
      }
      .riga.timer .testo {
        flex: 1 1 160px;
      }
      .fine {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: auto;
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private battito: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this.inviata = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [
      connessione.timer.ascolta(ridisegna),
      connessione.assistente.ascolta(ridisegna),
      connessione.ascolta(ridisegna),
      schermate.ascolta(ridisegna),
    ];
    // il conto alla rovescia, un secondo alla volta
    this.battito = setInterval(ridisegna, 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    clearInterval(this.battito);
  }

  private async chiedi(frase: string): Promise<void> {
    this.inviata = frase;
    const errore = await chiediEAspetta(connessione.assistente, frase);
    this.inviata = null;
    if (errore) avvisi.mostra(`Timer: ${errore}`, "errore");
  }

  private timer(t: TimerAttivo, adesso: number, occupato: boolean): TemplateResult {
    const annulla = fraseAnnullaTimer(t);
    const nome = t.nome?.trim() || "Timer";
    return html`<div class="riga timer" data-test="timer-attivo">
      ${icona(t.inPausa ? mdiPauseCircleOutline : mdiTimerOutline)}
      <span class="testo"
        ><span data-test="timer-nome">${nome}</span
        ><small
          >${t.secondiTotali ? durataParlata(t.secondiTotali) : "durata non detta"}${
            t.inPausa ? html` · <span class="pausa">in pausa</span>` : nothing
          }</small
        ></span
      >
      <span class="fine">
        <b class="resto" data-test="timer-resto">${formattaRimasto(rimastoMs(t, adesso))}</b>
        ${
          annulla
            ? html`<button
                data-test="timer-annulla"
                aria-label="Annulla ${nome}"
                ?disabled=${occupato}
                @click=${() => void this.chiedi(annulla)}
              >
                Annulla
              </button>`
            : nothing
        }
      </span>
    </div>`;
  }

  protected disegna(): TemplateResult {
    const adesso = Date.now();
    const attivi = connessione.timer.attivi;
    const durate = schermate.valori.timerDurate;
    const scollegato = connessione.stato.stato !== "connesso";
    const occupato = scollegato || connessione.assistente.occupato || this.inviata !== null;
    return html`<h1>Timer</h1>
      <section>
        ${
          attivi.length
            ? html`<div data-test="timer-elenco">${attivi.map((t) => this.timer(t, adesso, occupato))}</div>`
            : html`<div class="nota" data-test="timer-nessuno">Nessun timer su questo pannello.</div>`
        }
      </section>
      ${
        durate.length
          ? html`<section>
              <h2>Nuovo timer</h2>
              <div class="rapidi">
                ${durate.map(
                  (m) =>
                    html`<button
                      data-test="timer-nuovo"
                      aria-label="Timer di ${durataParlata(m * 60)}"
                      ?disabled=${occupato}
                      @click=${() => void this.chiedi(fraseNuovoTimer(m))}
                    >
                      ${etichettaDurata(m)}
                    </button>`,
                )}
              </div>
            </section>`
          : nothing
      }
      <div class="nota" data-test="timer-nota">
        ${
          this.inviata
            ? html`Chiedo a Jarvis: «${this.inviata}»…`
            : scollegato
              ? "Senza Home Assistant i timer non si creano."
              : "I pulsanti chiedono a Jarvis, come se lo dicessi: il timer suona su questo pannello. Con un nome si chiede a voce: «Jarvis, timer di 10 minuti per la pasta»."
        }
      </div>`;
  }
}
customElements.define("jarvis-pagina-timer", JarvisPaginaTimer);
