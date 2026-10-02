import { mdiPauseCircleOutline, mdiTimerOutline } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { avvisi } from "../comune";
import { connessione } from "../connessione";
import { schermate } from "../pagine/preferenze";
import { durataParlata, etichettaDurata } from "./frasi";
import { slugStanza } from "./pannello";
import { formattaRimasto, rimastoMs, type AzioneTimer, type TimerAttivo } from "./timer";
import { ascoltaStanzaPannello, stanzaPannello } from "../voce";
import { RiquadroSicuro, icona, stileBase, stilePagina } from "../interfaccia";

/**
 * Schermata Timer (v0.5.7, mockup N2 "6 · Timer e sveglie"): i timer di
 * questo pannello con il conto alla rovescia, e i pulsanti per uno nuovo.
 * Dalla v0.5.8 i pulsanti usano i servizi di jarvis_voce 0.3.0
 * (`timer_stanza` con la stanza del pannello, `timer_comando` per pausa,
 * ripresa e annullamento): niente più frasi mandate a Jarvis. Il timer
 * compare con l'evento `started`, come a voce. Sveglie e promemoria
 * arriveranno quando il server li avrà (STATO.md).
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
      /* il conto e i comandi: se non stanno in riga (320 px) i comandi scendono sotto, a destra */
      .fine {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 8px 12px;
        margin-left: auto;
      }
      .comandi {
        display: flex;
        gap: 8px;
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
      connessione.ascolta(ridisegna),
      schermate.ascolta(ridisegna),
      ascoltaStanzaPannello(ridisegna),
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

  /** Un servizio alla volta: `cosa` è quello che dice la nota mentre aspetta. */
  private async chiedi(cosa: string, fai: () => Promise<string | null>): Promise<void> {
    this.inviata = cosa;
    const errore = await fai();
    this.inviata = null;
    if (errore) avvisi.mostra(`Timer: ${errore}`, "errore");
  }

  private nuovo(stanza: string, minuti: number): void {
    void this.chiedi(`timer di ${durataParlata(minuti * 60)}`, () =>
      connessione.timer.avvia(slugStanza(stanza), { minuti }),
    );
  }

  private comando(t: TimerAttivo, azione: AzioneTimer, nome: string): void {
    const parole = { annulla: "annullo", pausa: "metto in pausa", riprendi: "riprendo" }[azione];
    void this.chiedi(`${parole} ${nome}`, () => connessione.timer.comando(t.id, azione));
  }

  private timer(t: TimerAttivo, adesso: number, occupato: boolean): TemplateResult {
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
        <span class="comandi">
          <button
            data-test=${t.inPausa ? "timer-riprendi" : "timer-pausa"}
            aria-label="${t.inPausa ? "Riprendi" : "Pausa"} ${nome}"
            ?disabled=${occupato}
            @click=${() => this.comando(t, t.inPausa ? "riprendi" : "pausa", nome)}
          >
            ${t.inPausa ? "Riprendi" : "Pausa"}
          </button>
          <button
            data-test="timer-annulla"
            aria-label="Annulla ${nome}"
            ?disabled=${occupato}
            @click=${() => this.comando(t, "annulla", nome)}
          >
            Annulla
          </button>
        </span>
      </span>
    </div>`;
  }

  protected disegna(): TemplateResult {
    const adesso = Date.now();
    const attivi = connessione.timer.attivi;
    const durate = schermate.valori.timerDurate;
    const scollegato = connessione.stato.stato !== "connesso";
    const occupato = scollegato || this.inviata !== null;
    const stanza = stanzaPannello();
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
                      ?disabled=${occupato || !stanza}
                      @click=${() => stanza && this.nuovo(stanza, m)}
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
            ? html`Un momento: ${this.inviata}…`
            : scollegato
              ? "Senza Home Assistant i timer non si creano."
              : !stanza
                ? "Per creare un timer da qui scegli la stanza di questo pannello in Impostazioni: è lì che suona. A voce funziona anche senza."
                : html`Il timer suona su questo pannello (${stanza}). Con un nome si chiede a voce: «Jarvis,
                  timer di 10 minuti per la pasta».`
        }
      </div>`;
  }
}
customElements.define("jarvis-pagina-timer", JarvisPaginaTimer);
