import { mdiPause, mdiTimerOutline } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione";
import { RiquadroSicuro, icona, stileBase } from "../interfaccia";
import { schermate } from "../pagine/preferenze";
import { vista } from "../vista/istanza";
import { formattaRimasto, rimastoMs, type TimerAttivo } from "./timer";

/**
 * Timer a tutto schermo (v0.6.2, richiesta di Salvatore del 02/10: «se c'è un
 * timer attivo lo mostra sempre a schermo pieno»).
 *
 * Con almeno un timer attivo, dopo `timerPienoSecondi` senza tocchi il timer
 * copre tutto: pannello completo, riposo e Hub. Un tocco ovunque riporta a
 * quello che c'era sotto, e dopo altri `timerPienoSecondi` senza tocchi il
 * timer torna. Non compare mentre Jarvis ascolta o parla (la voce resta in
 * vista), né sopra impostazioni, guida e login (li esclude jarvis-app); quando
 * un timer suona vince «Timer finito», che sta sopra.
 */

/** Il timer in grande: quello che finisce prima tra quelli che scorrono; tutti in pausa → il primo. */
export function timerPrincipale(attivi: readonly TimerAttivo[]): TimerAttivo | null {
  return attivi.find((t) => !t.inPausa) ?? attivi[0] ?? null;
}

/**
 * Grandezza delle cifre in larghezza di schermo, stimata con margine (in
 * grassetto una cifra arriva a ~0,72 em, «:» a ~0,4 em; a 320 px restano i 24
 * px di bordo per lato): al massimo l'80% della larghezza. «3:06» viene
 * grande, «1:58:56» sta comunque dentro (prova di layout a 320 px).
 */
export function grandezzaCifre(testo: string): string {
  const em = [...testo].reduce((s, c) => s + (c === ":" ? 0.4 : 0.72), 0);
  return `${Math.min(32, 80 / Math.max(em, 1)).toFixed(1)}vw`;
}

interface CondizioniTimerPieno {
  acceso: boolean;
  timerAttivi: number;
  timerCheSuonano: number;
  voceAttiva: boolean;
  /** Millisecondi dall'ultimo tocco (o dalla fine dell'ultima attività della voce). */
  fermoDaMs: number;
  secondi: number;
}

/** Può aprirsi adesso? (chiuso → aperto) */
export function timerPienoSiApre(c: CondizioniTimerPieno): boolean {
  return timerPienoPuoRestare(c) && c.fermoDaMs >= c.secondi * 1000;
}

/** Aperto: può restare? Si chiude anche da solo col tocco (vedi il componente). */
export function timerPienoPuoRestare(c: CondizioniTimerPieno): boolean {
  return c.acceso && c.timerAttivi > 0 && c.timerCheSuonano === 0 && !c.voceAttiva;
}

/** Notte (sopra il riposo): rosso scuro come «Timer finito», niente colori accesi. */
export class JarvisTimerPieno extends RiquadroSicuro {
  static override properties = { notte: { type: Boolean, reflect: true }, aperto: { state: true } };
  declare notte: boolean;
  declare aperto: boolean;

  constructor() {
    super();
    this.notte = false;
    this.aperto = false;
  }

  static override styles = [
    stileBase,
    css`
      :host {
        display: none;
      }
      :host([aperto]) {
        position: fixed;
        inset: 0;
        z-index: 35;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--sfondo);
        cursor: pointer;
        touch-action: manipulation;
      }
      .pieno {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        text-align: center;
      }
      .nome {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: clamp(22px, 4.5vmin, 40px);
        color: var(--attenuato);
        overflow-wrap: anywhere;
      }
      .nome .icona {
        width: 1.2em;
        height: 1.2em;
        flex: none;
        color: var(--accento);
      }
      .rimasto {
        /* la larghezza la decide il numero di caratteri (vedi grandezzaCifre), l'altezza resta sotto il 42% */
        font-size: min(var(--cifre, 24vw), 42vh);
        font-weight: 600;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .pausa .rimasto,
      .pausa .nome .icona {
        color: var(--attenuato);
      }
      .zero .rimasto {
        color: var(--avviso);
      }
      .in-pausa {
        font-size: clamp(18px, 3.5vmin, 28px);
        color: var(--attenuato);
      }
      .altri {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        margin-top: 8px;
      }
      .altro {
        display: inline-flex;
        align-items: center;
        gap: 4px 8px;
        padding: 8px 14px 8px 10px;
        border-radius: 20px;
        background: var(--superficie);
        border: 1px solid #2b303a;
        font-size: 18px;
        font-variant-numeric: tabular-nums;
      }
      .altro .icona {
        width: 22px;
        height: 22px;
        color: var(--accento);
      }
      .suggerimento {
        margin-top: 8px;
        font-size: 14px;
        color: var(--attenuato);
      }
      :host([notte][aperto]) {
        background: #000;
      }
      :host([notte]) .rimasto,
      :host([notte]) .nome,
      :host([notte]) .altro {
        color: #d9a397;
      }
      :host([notte]) .icona {
        color: #b8452f;
      }
      :host([notte]) .suggerimento {
        color: #8a5a50;
      }
      :host([notte]) .altro {
        background: #140806;
        border-color: #3a1a14;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        :host([aperto]) {
          padding: 12px;
        }
        .pieno {
          gap: 4px;
        }
        .altro {
          padding: 4px 10px 4px 8px;
          font-size: 15px;
        }
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private battito: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    const aggiorna = (): void => this.controlla();
    this.smetti = [
      connessione.timer.ascolta(aggiorna),
      connessione.voce.ascolta(aggiorna),
      schermate.ascolta(aggiorna),
    ];
    // il secondo che scorre (e il conto dei secondi senza tocchi) solo mentre c'è un timer
    this.battito = setInterval(aggiorna, 1000);
    this.addEventListener("click", this.tocco);
    this.controlla();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    clearInterval(this.battito);
    this.battito = undefined;
    this.removeEventListener("click", this.tocco);
  }

  /** Un tocco riporta al pannello; il tocco si ferma qui (non arriva a ciò che c'è sotto). */
  private readonly tocco = (e: Event): void => {
    if (!this.aperto) return;
    e.stopPropagation();
    vista.attivita();
    this.aperto = false;
    this.toggleAttribute("aperto", false);
  };

  private condizioni(): CondizioniTimerPieno {
    const v = schermate.valori;
    return {
      acceso: v.timerPieno,
      timerAttivi: connessione.timer.attivi.length,
      timerCheSuonano: connessione.timer.suonano.length,
      voceAttiva: connessione.voce.attiva,
      fermoDaMs: Date.now() - vista.ultimaAttivita,
      secondi: v.timerPienoSecondi,
    };
  }

  private controlla(): void {
    const c = this.condizioni();
    const aperto = this.aperto ? timerPienoPuoRestare(c) : timerPienoSiApre(c);
    if (aperto !== this.aperto) this.aperto = aperto;
    this.toggleAttribute("aperto", aperto);
    if (aperto) this.requestUpdate();
  }

  protected disegna(): TemplateResult {
    if (!this.aperto) return html`${nothing}`;
    const ora = Date.now();
    const tutti = connessione.timer.attivi;
    const primo = timerPrincipale(tutti);
    if (!primo) return html`${nothing}`;
    const altri = tutti.filter((t) => t !== primo);
    const inVista = altri.slice(0, 3);
    const rimasto = rimastoMs(primo, ora);
    const testo = formattaRimasto(rimasto);
    return html`<div
      class="pieno ${primo.inPausa ? "pausa" : ""} ${rimasto <= 0 && !primo.inPausa ? "zero" : ""}"
      role="timer"
      aria-label="Timer a tutto schermo: tocca per tornare al pannello"
      data-test="timer-pieno"
    >
      <span class="nome">${icona(primo.inPausa ? mdiPause : mdiTimerOutline)}${primo.nome ?? "Timer"}</span>
      <span class="rimasto" data-test="timer-pieno-rimasto" style="--cifre: ${grandezzaCifre(testo)}"
        >${testo}</span
      >
      ${primo.inPausa ? html`<span class="in-pausa">in pausa</span>` : nothing}
      ${
        inVista.length
          ? html`<div class="altri" data-test="timer-pieno-altri">
              ${inVista.map(
                (t) =>
                  html`<span class="altro"
                    >${icona(t.inPausa ? mdiPause : mdiTimerOutline)}${t.nome ? `${t.nome} ` : ""}${formattaRimasto(rimastoMs(t, ora))}</span
                  >`,
              )}
              ${altri.length > inVista.length ? html`<span class="altro">+${altri.length - inVista.length}</span>` : nothing}
            </div>`
          : nothing
      }
      <span class="suggerimento">Tocca per tornare al pannello</span>
    </div>`;
  }
}
customElements.define("jarvis-timer-pieno", JarvisTimerPieno);
