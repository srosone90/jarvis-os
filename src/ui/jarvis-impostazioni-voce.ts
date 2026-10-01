import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import type { RiepilogoEsempi } from "../parola/motore";
import { RiquadroSicuro, stileBase } from "./base";
import { OsservaParola } from "./jarvis-indicatore-parola";
import "./jarvis-parola-dal-vivo";
import type { Elaborazione } from "../voce/microfono";

const numero = (n: number, cifre = 0): string => n.toFixed(cifre).replace(".", ",");

/** Quante volte si dice «Jarvis» in una registrazione, e quanto parlato normale. */
const ESEMPI_PER_VOLTA = 20;
const SECONDI_NORMALE = 60;

/**
 * Impostazioni → Voce (v0.5.0): «Jarvis» sempre in ascolto (acceso di serie),
 * come sta andando, e "Insegna a Jarvis la tua pronuncia". Qui dentro il
 * pannello, non in una pagina a parte (decisione di Salvatore del 30/09).
 * Esempi e pronuncia restano su questo dispositivo: niente va a HA.
 */
export class JarvisImpostazioniVoce extends RiquadroSicuro {
  static override properties = {
    riepilogo: { state: true },
    esito: { state: true },
    addestra: { state: true },
  };
  declare riepilogo: RiepilogoEsempi | null;
  declare esito: string;
  /** Passo dell'addestramento in corso, o null. */
  declare addestra: number | null;

  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
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
      b {
        font-weight: 500;
        font-size: 18px;
      }
      small,
      p {
        display: block;
        color: var(--attenuato);
        font-size: 14px;
        margin: 3px 0 0;
        overflow-wrap: break-word;
      }
      .avviso {
        color: var(--avviso-testo);
      }
      .righe {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button,
      select,
      input[type="text"] {
        min-height: 48px;
        max-width: 100%;
        border-radius: 12px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 16px;
        padding: 0 14px;
      }
      button {
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      input[type="text"] {
        flex: 1 1 180px;
        min-width: 0;
      }
      .interruttore {
        display: flex;
        align-items: center;
        min-height: 48px;
        cursor: pointer;
      }
      .interruttore input {
        width: 26px;
        height: 26px;
        accent-color: var(--accento);
      }
      .invito {
        margin: 12px 0 0;
        padding: 20px 16px;
        border-radius: 16px;
        background: var(--superficie);
        font-size: 24px;
        text-align: center;
        color: var(--testo);
      }
      .invito.adesso {
        background: #18223a;
        outline: 3px solid var(--accento);
      }
      .persona {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        padding: 8px 0;
      }
      .persona span {
        flex: 1 1 200px;
        min-width: 0;
        overflow-wrap: break-word;
      }
    `,
  ];

  private persona = "";
  private registrava = false;
  private caricaRiepilogo: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.riepilogo = null;
    this.esito = "";
    this.addestra = null;
    new OsservaParola(this);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.aggiornaRiepilogo();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.caricaRiepilogo);
  }

  protected override updated(): void {
    // il motore arriva dopo (import pigro) e gli esempi cambiano durante la registrazione
    const m = connessione.parola.motore;
    if (m && this.riepilogo === null) this.aggiornaRiepilogo();
  }

  private aggiornaRiepilogo(): void {
    clearTimeout(this.caricaRiepilogo);
    this.caricaRiepilogo = setTimeout(() => {
      const m = connessione.parola.motore;
      if (!m) return;
      m.riepilogo().then(
        (r) => (this.riepilogo = r),
        (errore: unknown) => log.avviso(`Voce: esempi non letti: ${descriviErrore(errore)}`),
      );
    }, 100);
  }

  private stato(): TemplateResult {
    const p = connessione.parola;
    const testo: Record<typeof p.stato, string> = {
      spento: "Spento: parli con Jarvis solo toccando il microfono.",
      carica: "Mi preparo… La prima volta scarico il riconoscimento della parola (circa 17 MB).",
      ascolta: `In ascolto. Di' «${p.motore?.parola ?? "Jarvis"}» e poi la domanda, anche nella stessa frase.`,
      fermo: p.problema ? `${p.problema.titolo} ${p.problema.spiegazione}` : "Fermo.",
      nonDisponibile: p.problema ? `${p.problema.titolo} ${p.problema.spiegazione}` : "Non disponibile qui.",
    };
    return html`<div class="voce">
      <div>
        <b>«Jarvis» sempre in ascolto</b>
        <small
          >Il microfono resta aperto e riconosce la parola qui sul pannello: a Home Assistant va solo quello
          che dici dopo «Jarvis», più il secondo prima. Mentre suona un timer, «Jarvis, stop» lo ferma.</small
        >
        <small
          class=${p.stato === "fermo" || p.stato === "nonDisponibile" ? "avviso" : ""}
          data-test="stato-parola"
          data-stato=${p.stato}
          >${testo[p.stato]}</small
        >
      </div>
      ${
        p.stato === "fermo"
          ? html`<button data-test="parola-riprova" @click=${() => p.riprova()}>Riprova</button>`
          : nothing
      }
      <label class="interruttore">
        <input
          type="checkbox"
          data-test="parola-acceso"
          aria-label="«Jarvis» sempre in ascolto"
          .checked=${p.acceso}
          @change=${(e: Event) => p.imposta((e.target as HTMLInputElement).checked)}
        />
      </label>
    </div>`;
  }

  private misure(): TemplateResult {
    const p = connessione.parola;
    const m = p.motore;
    if (!m || p.stato !== "ascolta") return html``;
    const s = p.statistiche;
    const elab: [Elaborazione, string][] = [
      ["solo-eco", "Solo contro l'eco (consigliato)"],
      ["nessuna", "Nessuna: microfono grezzo"],
      ["tutta", "Tutta: eco, rumore e volume automatico"],
    ];
    return html`<div class="voce">
        <div>
          <b>Prova dal vivo</b>
          <small>Di' «Jarvis» e guarda la barra: è il punteggio più alto degli ultimi 3 secondi.</small>
          <jarvis-parola-dal-vivo style="margin-top: 10px"></jarvis-parola-dal-vivo>
        </div>
      </div>
      <div class="voce">
        <div>
          <b>Elaborazione del microfono</b>
          <small
            >Su Android la riduzione del rumore e il volume automatico possono schiacciare la voce. Se
            «Jarvis» non sale, prova un'altra scelta e guarda la barra qui sopra.</small
          >
        </div>
        <select
          data-test="elaborazione-microfono"
          aria-label="Elaborazione del microfono"
          @change=${(e: Event) =>
            void connessione.microfono.impostaElaborazione(
              (e.target as HTMLSelectElement).value as Elaborazione,
            )}
        >
          ${elab.map(
            ([v, t]) =>
              html`<option value=${v} ?selected=${connessione.microfono.elaborazione === v}>${t}</option>`,
          )}
        </select>
      </div>
      <div class="voce">
        <div>
          <b>Come sta andando</b>
          <small data-test="misure-parola"
            >${numero(s.frame)} pezzi da 80 ms ascoltati, ${numero(s.msMedio, 1)} ms di calcolo ciascuno
            (carico
            ${numero((s.msMedio / 80) * 100)}%)${s.scartati ? `, ${numero(s.scartati)} saltati perché in ritardo` : ""}.
            «${m.parola}» sentito ${s.scatti}
            volte${
              s.ultimoScatto
                ? `, l'ultima alle ${new Date(s.ultimoScatto).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                : ""
            }.</small
          >
          <small
            >Modello ${m.modello.id}
            (${m.modello.licenza}${m.modello.commerciale ? "" : ", solo uso non commerciale"}), soglia
            ${numero(m.soglia, 2)}, ${m.fonteImpostazioni}. Pronuncia di casa:
            <span data-test="stato-verificatore">${m.descriviVerificatore()}</span>.</small
          >
          <small data-test="pronuncia-indirizzo"
            >Esempi e pronuncia imparata restano nella memoria del browser di questo indirizzo
            (${location.host}): se il pannello passa all'altro indirizzo (veloce o di riserva), lì vanno
            insegnati di nuovo.</small
          >
        </div>
      </div>`;
  }

  private pronuncia(): TemplateResult {
    const p = connessione.parola;
    const m = p.motore;
    const intro = html`<b>Insegna a Jarvis la tua pronuncia</b>
      <small
        >Il riconoscimento di serie è addestrato su voci inglesi («Giarvìs»). Registra ${ESEMPI_PER_VOLTA}
        volte «Jarvis» come lo dici tu, poi ${SECONDI_NORMALE} secondi di parlato normale o di TV, e tocca
        «Impara la pronuncia». Ogni persona di casa può registrare i suoi esempi. Tutto resta su questo
        pannello.</small
      >`;
    if (!m || p.stato !== "ascolta")
      return html`<div class="voce">
        <div>
          ${intro}
          <small class="avviso" data-test="pronuncia-non-pronta"
            >Accendi «Jarvis» qui sopra per registrare.</small
          >
        </div>
      </div>`;
    if (!m.archivioDisponibile)
      return html`<div class="voce">
        <div>
          ${intro}
          <small class="avviso">Questo browser non lascia salvare gli esempi.</small>
        </div>
      </div>`;
    const r = m.inRegistrazione;
    if (r)
      return html`<div class="voce">
        <div>
          ${intro}
          <p class="invito ${r.adesso ? "adesso" : ""}" data-test="invito" aria-live="assertive">
            ${r.invito}
          </p>
          <small
            >${r.tipo === "parola" ? `Esempi di ${r.persona}: ${r.fatti} su ${r.quanti}` : "Parlato normale"}</small
          >
        </div>
        <button
          data-test="annulla-registrazione"
          @click=${() => m.annullaRegistrazione("annullata col tasto")}
        >
          Annulla
        </button>
      </div>`;
    const rie = this.riepilogo;
    const haParola = !!rie?.persone.length;
    const haNormale = (rie?.secondiNormale ?? 0) > 0;
    return html`<div class="voce">
        <div>${intro}</div>
      </div>
      <div class="voce">
        <div>
          <b>1. «Jarvis» come lo dici tu</b>
          <small>Scrivi chi parla, poi di' «Jarvis» ogni volta che compare «adesso», ogni 3 secondi.</small>
          <div class="righe" style="margin-top: 8px">
            <input
              type="text"
              data-test="pronuncia-persona"
              placeholder="Chi parla (es. Salvatore)"
              aria-label="Chi parla"
              .value=${this.persona}
              @input=${(e: Event) => {
                this.persona = (e.target as HTMLInputElement).value;
                this.requestUpdate();
              }}
            />
            <button
              data-test="registra-parola"
              ?disabled=${!this.persona.trim()}
              @click=${() => m.iniziaRegistrazione("parola", this.persona.trim(), ESEMPI_PER_VOLTA)}
            >
              Registra «${m.parola}»
            </button>
          </div>
          ${rie?.persone.map(
            (x) =>
              html`<div class="persona" data-test="esempi-persona">
                <span><b>${x.nome}</b> · ${x.esempi} esempi</span>
                <button @click=${() => void this.ascoltaUltimo(x.nome)}>Ascolta l'ultimo</button>
                <button @click=${() => void this.cancella(x.nome)}>Cancella</button>
              </div>`,
          )}
        </div>
      </div>
      <div class="voce">
        <div>
          <b>2. Parlato normale</b>
          <small
            >${SECONDI_NORMALE} secondi di voci senza la parola (anche la TV): servono a non scattare per
            sbaglio. Si tengono solo numeri, niente
            audio.${
              haNormale ? ` Già registrati: ${numero((rie?.secondiNormale ?? 0) / 60, 1)} min.` : ""
            }</small
          >
        </div>
        <button
          data-test="registra-normale"
          @click=${() => m.iniziaRegistrazione("normale", "", 0, SECONDI_NORMALE)}
        >
          Registra ${SECONDI_NORMALE} s
        </button>
        ${haNormale ? html`<button @click=${() => void this.cancella(null)}>Cancella</button>` : nothing}
      </div>
      <div class="voce">
        <div>
          <b>3. Impara la pronuncia</b>
          <small data-test="esito-addestramento"
            >${
              this.addestra !== null
                ? `Sto imparando… (passo ${this.addestra})`
                : this.esito ||
                  (haParola && haNormale
                    ? "Pronto: tocca «Impara la pronuncia»."
                    : "Servono sia gli esempi di «Jarvis» sia il parlato normale.")
            }</small
          >
        </div>
        <button
          data-test="addestra"
          ?disabled=${!haParola || !haNormale || this.addestra !== null}
          @click=${() => void this.impara()}
        >
          Impara la pronuncia
        </button>
      </div>
      <div class="voce">
        <div>
          <b>Cancella tutto</b>
          <small
            >Toglie da questo pannello gli esempi registrati e la pronuncia imparata. Non si
            recuperano.</small
          >
        </div>
        <button data-test="cancella-pronuncia" @click=${() => void this.cancellaTutto()}>
          Cancella tutto
        </button>
      </div>`;
  }

  private async impara(): Promise<void> {
    const m = connessione.parola.motore;
    if (!m) return;
    this.addestra = 0;
    try {
      this.esito = await m.addestra((passo) => (this.addestra = passo));
    } catch (errore) {
      this.esito = `Non ci sono riuscito: ${descriviErrore(errore)}`;
      log.errore(`Voce: addestramento non riuscito: ${descriviErrore(errore)}`);
    } finally {
      this.addestra = null;
    }
  }

  private async cancella(persona: string | null): Promise<void> {
    const m = connessione.parola.motore;
    const chi = persona === null ? "il parlato normale registrato" : `gli esempi di ${persona}`;
    if (
      !m ||
      !confirm(
        `Cancello ${chi} da questo pannello? Non si recuperano. La pronuncia già imparata resta finché non la rifai o la cancelli.`,
      )
    )
      return;
    await m.cancella(persona);
    this.aggiornaRiepilogo();
  }

  private async cancellaTutto(): Promise<void> {
    const m = connessione.parola.motore;
    if (
      !m ||
      !confirm("Cancello da questo pannello tutti gli esempi e la pronuncia imparata? Non si recuperano.")
    )
      return;
    await m.svuota();
    this.esito = "";
    this.aggiornaRiepilogo();
  }

  private async ascoltaUltimo(persona: string): Promise<void> {
    const pcm = await connessione.parola.motore?.ultimoEsempio(persona);
    if (!pcm?.length) return;
    try {
      const contesto = new AudioContext();
      const buffer = contesto.createBuffer(1, pcm.length, 16000);
      const canale = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) canale[i] = (pcm[i] ?? 0) / 32768;
      const sorgente = contesto.createBufferSource();
      sorgente.buffer = buffer;
      sorgente.connect(contesto.destination);
      sorgente.onended = () => void contesto.close();
      sorgente.start();
    } catch (errore) {
      log.avviso(`Voce: esempio non riascoltato: ${descriviErrore(errore)}`);
    }
  }

  protected disegna(): TemplateResult {
    // a registrazione appena finita gli esempi sono cambiati
    const m = connessione.parola.motore;
    if (m && !m.inRegistrazione && this.registrava) this.aggiornaRiepilogo();
    this.registrava = !!m?.inRegistrazione;
    return html`${this.stato()} ${this.misure()} ${this.pronuncia()}`;
  }
}
customElements.define("jarvis-impostazioni-voce", JarvisImpostazioniVoce);
