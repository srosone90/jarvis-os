import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiClose, mdiPlus } from "@mdi/js";
import { callService } from "home-assistant-js-websocket";
import { css, html, nothing, type TemplateResult } from "lit";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { schermate } from "../pagine/preferenze";
import { ListaSpesa, ordinaSpesa, type VoceSpesa } from "../spesa/spesa";
import { icona, RiquadroSicuro, stileBase } from "./base";
import { stilePagina } from "./stile-pagina";

/**
 * Schermata Lista della spesa (v0.5.7, mockup N2 "7"): l'entità todo di Home
 * Assistant, la stessa che si riempie a voce. Si aggiunge scrivendo, un tocco
 * su una voce la segna come presa (o la rimette), la × la toglie. Tutto passa
 * da Home Assistant: la lista sul pannello è sempre quella vera.
 */
export class JarvisPaginaSpesa extends RiquadroSicuro {
  static override styles = [
    stileBase,
    stilePagina,
    css`
      form {
        display: flex;
        gap: 8px;
        min-width: 0;
      }
      input {
        flex: 1;
        min-width: 0;
        min-height: 52px;
        padding: 0 16px;
        border-radius: 26px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 18px;
      }
      form button {
        min-height: 52px;
        min-width: 52px;
        padding: 0 16px;
        border-radius: 26px;
        border: none;
        background: var(--accento);
        color: #0b0e14;
        font: inherit;
        font-size: 17px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
      form button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      form .icona {
        width: 22px;
        height: 22px;
      }
      /* telefono stretto: solo il «+», il campo prende la riga */
      @media (max-width: 379px) {
        form .etichetta {
          display: none;
        }
      }
      .voce {
        display: flex;
        align-items: center;
        gap: 4px;
        border-bottom: 1px solid #1c2029;
        min-width: 0;
      }
      .voce button {
        all: unset;
        box-sizing: border-box;
        cursor: pointer;
        touch-action: manipulation;
      }
      .voce .segna {
        flex: 1;
        min-width: 0;
        min-height: 52px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 4px;
        font-size: 18px;
        overflow-wrap: break-word;
      }
      .voce .segna[aria-pressed="true"] {
        color: var(--attenuato);
        text-decoration: line-through;
      }
      .voce .segna .icona {
        width: 26px;
        height: 26px;
        flex: none;
        color: var(--accento);
      }
      .voce .togli {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        color: var(--attenuato);
        border-radius: 24px;
      }
      .voce .togli .icona {
        width: 22px;
        height: 22px;
      }
      .voce button:disabled {
        opacity: 0.4;
        cursor: default;
      }
    `,
  ];

  private lista: ListaSpesa | null = null;
  private connIscritta: unknown = null;
  private entitaIscritta = "";
  private smetti: (() => void)[] = [];
  private testo = "";

  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [
      connessione.ascolta(() => {
        void this.iscrivi();
        ridisegna();
      }),
      schermate.ascolta(() => {
        void this.iscrivi();
        ridisegna();
      }),
    ];
    void this.iscrivi();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    void this.lista?.chiudi();
    this.lista = null;
    this.connIscritta = null;
    this.entitaIscritta = "";
  }

  /** Una lista per connessione e per entità scelta (come il Meteo con la previsione). */
  private async iscrivi(): Promise<void> {
    const conn = connessione.conn;
    const entita = schermate.valori.spesaLista;
    if (!conn || connessione.stato.stato !== "connesso") return;
    if (conn === this.connIscritta && entita === this.entitaIscritta) return;
    this.connIscritta = conn;
    this.entitaIscritta = entita;
    await this.lista?.chiudi();
    const lista = new ListaSpesa({
      iscrivi: (e, f) => conn.subscribeMessage(f, { type: "todo/item/subscribe", entity_id: e }),
      servizio: async (s, dati, e) => {
        await callService(conn, "todo", s, dati, { entity_id: e });
      },
    });
    lista.ascolta(() => this.requestUpdate());
    this.lista = lista;
    await lista.apri(entita);
  }

  private async esegui(azione: Promise<string | null>): Promise<void> {
    const errore = await azione;
    if (errore) avvisi.mostra(`Spesa: ${errore}`, "errore");
  }

  private async aggiungi(e: Event): Promise<void> {
    e.preventDefault();
    const lista = this.lista;
    const testo = this.testo.trim();
    if (!lista || !testo) return;
    const errore = await lista.aggiungi(testo);
    if (errore) avvisi.mostra(`Spesa: ${errore}`, "errore");
    else {
      this.testo = "";
      const campo = this.renderRoot.querySelector("input");
      if (campo) campo.value = "";
    }
  }

  private voce(v: VoceSpesa, occupata: boolean): TemplateResult {
    const lista = this.lista;
    return html`<div class="voce" data-test="spesa-voce">
      <button
        class="segna"
        data-test="spesa-segna"
        aria-pressed=${v.preso ? "true" : "false"}
        ?disabled=${occupata}
        @click=${() => lista && void this.esegui(lista.segna(v.uid, !v.preso))}
      >
        ${icona(v.preso ? mdiCheckboxMarked : mdiCheckboxBlankOutline)}<span data-test="spesa-testo"
          >${v.testo}</span
        >
      </button>
      <button
        class="togli"
        data-test="spesa-togli"
        aria-label="Togli ${v.testo}"
        ?disabled=${occupata}
        @click=${() => lista && void this.esegui(lista.togli(v.uid))}
      >
        ${icona(mdiClose)}
      </button>
    </div>`;
  }

  protected disegna(): TemplateResult {
    const lista = this.lista;
    const entita = schermate.valori.spesaLista;
    const scollegato = connessione.stato.stato !== "connesso";
    const voci = lista?.voci ?? null;
    const occupata = scollegato || !lista || lista.occupata;
    const tutte = voci ? ordinaSpesa(voci) : [];
    const mostrate = schermate.valori.spesaPresi ? tutte : tutte.filter((v) => !v.preso);
    const prese = tutte.filter((v) => v.preso).length;
    const daPrendere = tutte.length - prese;
    return html`<h1>Lista della spesa</h1>
      <form @submit=${(e: Event) => void this.aggiungi(e)}>
        <input
          type="text"
          data-test="spesa-nuova"
          aria-label="Cosa aggiungere alla lista"
          placeholder="Latte, pane…"
          enterkeyhint="done"
          autocomplete="off"
          ?disabled=${scollegato || !lista || lista.errore !== null}
          @input=${(e: Event) => (this.testo = (e.target as HTMLInputElement).value)}
        />
        <button
          type="submit"
          data-test="spesa-aggiungi"
          aria-label="Aggiungi"
          ?disabled=${occupata || lista?.errore !== null}
        >
          ${icona(mdiPlus)}<span class="etichetta">Aggiungi</span>
        </button>
      </form>
      ${
        scollegato && !voci
          ? html`<div class="nota">Senza Home Assistant la lista non si legge.</div>`
          : lista?.errore
            ? html`<div class="nota" data-test="spesa-errore">
                La lista ${entita} non risponde (${lista.errore}). In Home Assistant serve l'integrazione
                «Lista della spesa», o un'altra lista scelta in Impostazioni → Schermate.
              </div>`
            : voci === null
              ? html`<div class="nota">Leggo la lista…</div>`
              : html`<div class="nota" data-test="spesa-conta">
                    ${daPrendere === 0 ? "Niente da prendere." : daPrendere === 1 ? "1 cosa da prendere." : `${daPrendere} cose da prendere.`}
                  </div>
                  <div data-test="spesa-elenco">${mostrate.map((v) => this.voce(v, occupata))}</div>
                  ${
                    prese
                      ? html`<button
                          class="pulsante"
                          data-test="spesa-togli-presi"
                          ?disabled=${occupata}
                          @click=${() => lista && void this.esegui(lista.togliPresi())}
                        >
                          Togli le cose prese (${prese})
                        </button>`
                      : nothing
                  }`
      }`;
  }
}
customElements.define("jarvis-pagina-spesa", JarvisPaginaSpesa);
