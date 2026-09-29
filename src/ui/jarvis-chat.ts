import { mdiClose, mdiPlus, mdiSend } from "@mdi/js";
import { css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import type { Azione, Turno } from "../assistente/eventi";
import { connessione } from "../connessione/connessione";
import { icona, OsservaConnessione, RiquadroSicuro, stileBase } from "./base";
import { statoInItaliano } from "./card-base";

/** Senza tocchi per tanto, la chat si chiude da sola (mai mentre Jarvis risponde). */
export const CHIUSURA_AUTOMATICA_MS = 60_000;

/**
 * Chat con l'assistente (F4). Solo una "faccia" del motore in
 * `connessione.assistente`: non parla con HA da sola.
 *
 *  - Mostra solo la conversazione in corso: dopo 5 minuti senza messaggi HA
 *    dimentica il contesto e la chat riparte vuota.
 *  - Le etichette delle azioni vengono dal risultato di HA e mostrano lo stato
 *    VERO dell'entità (dal negozio), non quello che scrive Gemini.
 *  - Offline il campo è spento e lo dice; una domanda caduta a metà resta lì,
 *    da rimandare con un tocco.
 *  - La tastiera virtuale non deve coprire il campo: con `visualViewport` si
 *    misura quanta parte dello schermo copre e la chat si accorcia di tanto.
 */
export class JarvisChat extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        min-height: 0;
        padding: 12px 12px calc(12px + var(--tastiera, 0px));
        background: color-mix(in srgb, var(--superficie) 96%, #000);
        border: 1px solid #2b303a;
        border-radius: 20px;
      }
      .icona {
        width: 24px;
        height: 24px;
      }
      .testa {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 4px;
        min-width: 0;
      }
      .testa b {
        font-size: 17px;
        font-weight: 600;
      }
      .testa small {
        flex: 1;
        min-width: 0;
        color: var(--attenuato);
        font-size: 13px;
      }
      .testa small.lenta {
        color: var(--avviso);
      }
      button {
        font: inherit;
        color: inherit;
        cursor: pointer;
        touch-action: manipulation;
        border: none;
      }
      button[disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .tondo {
        flex: none;
        width: 48px;
        height: 48px;
        border-radius: 999px;
        background: var(--superficie-2);
        display: grid;
        place-items: center;
      }
      .messaggi {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 4px;
      }
      .vuota {
        margin: auto;
        text-align: center;
        color: var(--attenuato);
        font-size: 15px;
        line-height: 1.45;
        max-width: 34ch;
      }
      .msg {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 18px;
        font-size: 17px;
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-wrap: break-word;
      }
      .io {
        align-self: flex-end;
        background: color-mix(in srgb, var(--accento) 30%, var(--superficie-2));
        border-bottom-right-radius: 6px;
      }
      .jarvis {
        align-self: flex-start;
        background: var(--superficie-2);
        border-bottom-left-radius: 6px;
      }
      .pensa {
        color: var(--attenuato);
      }
      .puntini span {
        display: inline-block;
        width: 7px;
        height: 7px;
        margin: 0 2px;
        border-radius: 50%;
        background: currentColor;
        animation: su 1.2s infinite ease-in-out;
      }
      .puntini span:nth-child(2) {
        animation-delay: 0.15s;
      }
      .puntini span:nth-child(3) {
        animation-delay: 0.3s;
      }
      @keyframes su {
        0%,
        60%,
        100% {
          opacity: 0.3;
          transform: none;
        }
        30% {
          opacity: 1;
          transform: translateY(-4px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .puntini span {
          animation: none;
        }
      }
      .azioni {
        align-self: flex-start;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        max-width: 100%;
      }
      .azione {
        display: inline-flex;
        align-items: center;
        font-size: 14px;
        color: var(--ok);
        border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent);
        border-radius: 999px;
        padding: 4px 12px;
        max-width: 100%;
        overflow-wrap: break-word;
      }
      .azione.fallita {
        color: var(--avviso);
        border-color: color-mix(in srgb, var(--avviso) 55%, transparent);
      }
      .errore {
        align-self: stretch;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        border: 1px solid color-mix(in srgb, var(--avviso) 60%, transparent);
        background: color-mix(in srgb, var(--avviso) 10%, var(--superficie));
        border-radius: 14px;
        padding: 10px 14px;
        font-size: 15px;
        line-height: 1.4;
      }
      .errore .t {
        flex: 1 1 200px;
        min-width: 0;
      }
      .errore b {
        color: var(--avviso);
      }
      .errore button {
        min-height: 48px;
        padding: 0 16px;
        border-radius: 12px;
        background: var(--avviso);
        color: #1a1205;
        font-weight: 600;
      }
      form {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }
      input {
        flex: 1;
        min-width: 0;
        min-height: 52px;
        padding: 0 18px;
        border-radius: 999px;
        background: var(--sfondo);
        color: var(--testo);
        border: 2px solid var(--accento);
        font: inherit;
        font-size: 17px;
        outline: none;
      }
      input:disabled {
        border-color: #2b303a;
        color: var(--attenuato);
      }
      input::placeholder {
        color: var(--attenuato);
      }
      .invia {
        flex: none;
        width: 52px;
        height: 52px;
        border-radius: 999px;
        background: var(--accento);
        color: var(--sfondo);
        display: grid;
        place-items: center;
      }
      /* telefono in orizzontale: poco spazio in altezza */
      @media (orientation: landscape) and (max-height: 559px) {
        :host {
          padding: 8px 8px calc(8px + var(--tastiera, 0px));
          gap: 6px;
        }
        .msg {
          font-size: 15px;
          padding: 8px 12px;
        }
        input {
          min-height: 48px;
        }
        .invia {
          width: 48px;
          height: 48px;
        }
      }
    `,
  ];

  static override properties = { bozza: { state: true } };
  declare bozza: string;
  private readonly connessione = new OsservaConnessione(this);
  private smettiAssistente: (() => void) | null = null;
  private smettiEntita: (() => void) | null = null;
  private entitaOsservate = "";
  private timerChiusura: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.bozza = "";
  }

  private get assistente() {
    return connessione.assistente;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.assistente.controllaScadenza();
    this.smettiAssistente = this.assistente.ascolta(() => this.requestUpdate());
    this.addEventListener("pointerdown", this.tocco);
    this.addEventListener("keydown", this.tocco);
    window.visualViewport?.addEventListener("resize", this.suTastiera);
    window.visualViewport?.addEventListener("scroll", this.suTastiera);
    this.suTastiera();
    this.armaChiusura();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiAssistente?.();
    this.smettiEntita?.();
    this.smettiAssistente = this.smettiEntita = null;
    this.entitaOsservate = "";
    this.removeEventListener("pointerdown", this.tocco);
    this.removeEventListener("keydown", this.tocco);
    window.visualViewport?.removeEventListener("resize", this.suTastiera);
    window.visualViewport?.removeEventListener("scroll", this.suTastiera);
    clearTimeout(this.timerChiusura);
  }

  protected override firstUpdated(): void {
    this.shadowRoot?.querySelector("input")?.focus();
  }

  protected override updated(_: PropertyValues): void {
    this.osservaEntitaDelleAzioni();
    // sempre in vista gli ultimi messaggi
    const elenco = this.shadowRoot?.querySelector(".messaggi");
    if (elenco) elenco.scrollTop = elenco.scrollHeight;
  }

  /** Le etichette mostrano lo stato vero: ci si iscrive alle entità toccate da Gemini. */
  private osservaEntitaDelleAzioni(): void {
    const ids = [
      ...new Set(this.assistente.turni.flatMap((t) => t.azioni.flatMap((a) => (a.entita ? [a.entita] : [])))),
    ];
    const chiave = ids.join(",");
    if (chiave === this.entitaOsservate) return;
    this.smettiEntita?.();
    this.entitaOsservate = chiave;
    this.smettiEntita = ids.length ? connessione.negozio.osserva(ids, () => this.requestUpdate()) : null;
  }

  private readonly tocco = (): void => this.armaChiusura();

  private armaChiusura(): void {
    clearTimeout(this.timerChiusura);
    this.timerChiusura = setTimeout(() => {
      if (this.assistente.occupato) this.armaChiusura();
      else this.chiudi();
    }, CHIUSURA_AUTOMATICA_MS);
  }

  /** Quanta parte dello schermo copre la tastiera virtuale (0 se chiusa). */
  private readonly suTastiera = (): void => {
    const vv = window.visualViewport;
    const coperta = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    this.style.setProperty("--tastiera", `${coperta}px`);
  };

  private chiudi(): void {
    this.dispatchEvent(new CustomEvent("chiudi-chat", { bubbles: true, composed: true }));
  }

  private get collegato(): boolean {
    return this.connessione.info.stato === "connesso";
  }

  private invia(e: Event): void {
    e.preventDefault();
    if (this.assistente.chiedi(this.bozza)) this.bozza = "";
  }

  private etichetta(a: Azione): TemplateResult {
    if (!a.riuscita)
      return html`<span class="azione fallita" data-test="azione">${a.nome} · non riuscito</span>`;
    const e = a.entita ? connessione.negozio.entitaDi(a.entita) : undefined;
    const femminile = a.entita?.startsWith("media_player.") ?? false;
    const stato = e ? statoInItaliano(e.state, femminile).toLowerCase() : "fatto";
    return html`<span class="azione" data-test="azione">${a.nome} · ${stato}</span>`;
  }

  private errore(t: Turno): TemplateResult {
    const err = t.errore;
    const titolo =
      err?.tipo === "connessione"
        ? "Connessione persa durante la risposta."
        : err?.tipo === "tempo"
          ? "Jarvis non ha risposto in tempo."
          : "Jarvis non è riuscito a rispondere.";
    const spiegazione =
      err?.tipo === "connessione"
        ? "Se avevi chiesto un comando, guarda le card prima di rimandare: potrebbe essere già stato eseguito."
        : err?.tipo === "tempo"
          ? "Gemini ci ha messo più di un minuto. La domanda è ancora qui."
          : "Gemini ha dato un errore. La domanda è ancora qui.";
    const pulsante = err?.tipo === "connessione" ? "Rimanda" : "Riprova";
    return html`<div class="errore" role="alert" data-test="errore-assistente">
      <div class="t"><b>${titolo}</b><br />${spiegazione}</div>
      <button
        ?disabled=${!this.collegato || this.assistente.occupato}
        @click=${() => this.assistente.rimanda(t.id)}
      >
        ${pulsante}
      </button>
    </div>`;
  }

  private turno(t: Turno): TemplateResult {
    const inArrivo = t.fase === "invio" || t.fase === "pensa";
    return html`
      <div class="msg io" data-test="domanda">${t.domanda}</div>
      ${t.azioni.length ? html`<div class="azioni">${t.azioni.map((a) => this.etichetta(a))}</div>` : nothing}
      ${
        inArrivo
          ? html`<div class="msg jarvis pensa" role="status">
              <span class="puntini" aria-hidden="true"><span></span><span></span><span></span></span>
              ${this.assistente.lenta ? "Ci sto mettendo più del solito…" : "Sto pensando…"}
            </div>`
          : nothing
      }
      ${t.risposta ? html`<div class="msg jarvis" data-test="risposta">${t.risposta}</div>` : nothing}
      ${t.fase === "errore" ? this.errore(t) : nothing}
    `;
  }

  protected disegna(): TemplateResult {
    const turni = this.assistente.turni;
    const occupato = this.assistente.occupato;
    const collegato = this.collegato;
    const stato = occupato
      ? this.assistente.lenta
        ? "ci sta mettendo più del solito…"
        : "sta rispondendo…"
      : collegato
        ? "Gemini"
        : "non disponibile senza Home Assistant";
    return html`
      <div class="testa">
        <b>Jarvis</b>
        <small class=${occupato && this.assistente.lenta ? "lenta" : ""} data-test="stato-assistente"
          >${stato}</small
        >
        <button
          class="tondo"
          aria-label="Nuova conversazione"
          ?disabled=${occupato || turni.length === 0}
          @click=${() => this.assistente.nuovaConversazione()}
        >
          ${icona(mdiPlus)}
        </button>
        <button class="tondo" aria-label="Chiudi" @click=${() => this.chiudi()}>${icona(mdiClose)}</button>
      </div>
      <div class="messaggi" role="log" aria-live="polite" data-test="messaggi">
        ${
          !collegato
            ? html`<div class="errore" role="status" data-test="assistente-offline">
                <div class="t">
                  <b>Home Assistant non raggiungibile.</b><br />Quando torna la connessione puoi scrivere di
                  nuovo.
                </div>
              </div>`
            : nothing
        }
        ${
          turni.length === 0 && collegato
            ? html`<p class="vuota">Chiedimi qualcosa sulla casa, per esempio «spegni la TV del salotto».</p>`
            : nothing
        }
        ${turni.map((t) => this.turno(t))}
      </div>
      <form @submit=${(e: Event) => this.invia(e)}>
        <input
          type="text"
          aria-label="Domanda per Jarvis"
          enterkeyhint="send"
          autocomplete="off"
          .value=${this.bozza}
          ?disabled=${!collegato}
          placeholder=${collegato ? "Scrivi…" : "Non disponibile senza Home Assistant"}
          @input=${(e: InputEvent) => (this.bozza = (e.target as HTMLInputElement).value)}
        />
        <button
          class="invia"
          type="submit"
          aria-label="Invia"
          ?disabled=${!collegato || occupato || this.bozza.trim() === ""}
        >
          ${icona(mdiSend)}
        </button>
      </form>
    `;
  }
}
customElements.define("jarvis-chat", JarvisChat);
