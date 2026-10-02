import { mdiDownload, mdiUpload } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { avvisi } from "../comune";
import { log } from "../diagnostica";
import {
  CHIAVI_COPIABILI,
  cosaCambia,
  descriviScartate,
  esporta,
  importa,
  leggiFile,
  nomeFile,
  type FileImpostazioni,
} from "./copia";
import { stanzaPannello } from "../voce";
import { RiquadroSicuro, icona, stileBase, stileCampi } from "../interfaccia";

/**
 * Impostazioni → Copia (v0.5.10): esporta le impostazioni di questo pannello
 * in un file, o importa quelle di un altro. Mai il token di Home Assistant,
 * il registro, le interruzioni o la stanza: vedi `src/impostazioni/copia.ts`.
 * Prima di importare si vede cosa cambia; dopo, il pannello si ricarica
 * (ogni parte rilegge e ripulisce i suoi valori all'avvio).
 */
export class JarvisImpostazioniCopia extends RiquadroSicuro {
  static override properties = { daImportare: { state: true }, errore: { state: true } };
  declare daImportare: { file: FileImpostazioni; cambia: { titolo: string }[]; scartate: string[] } | null;
  declare errore: string | null;

  constructor() {
    super();
    this.daImportare = null;
    this.errore = null;
  }

  static override styles = [
    stileBase,
    stileCampi,
    css`
      :host {
        display: block;
      }
      .blocco {
        padding: 12px 0;
        border-bottom: 1px solid #1c2029;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .blocco b {
        font-weight: 500;
        font-size: 17px;
      }
      button,
      label.file {
        min-height: 48px;
        padding: 0 16px;
        border-radius: 24px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 16px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        align-self: flex-start;
        max-width: 100%;
      }
      label.file input {
        display: none;
      }
      ul {
        margin: 0;
        padding-left: 22px;
        overflow-wrap: break-word;
      }
      .comandi {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .errore {
        color: #ff9a8a;
        overflow-wrap: break-word;
      }
    `,
  ];

  private scarica(): void {
    const f = esporta(localStorage, __VERSIONE__);
    const nome = nomeFile(stanzaPannello());
    const url = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const n = Object.keys(f.impostazioni).length;
    log.info(`Impostazioni esportate in ${nome} (${n} gruppi cambiati)`);
    avvisi.mostra(n ? `Impostazioni esportate: ${nome}` : `Esportato ${nome}: è tutto di serie`);
  }

  private async scelto(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.errore = null;
    const r = leggiFile(await file.text());
    if (!r.ok) {
      this.errore = r.errore;
      this.daImportare = null;
      log.avviso(`Impostazioni non importate da ${file.name}: ${r.errore}`);
      return;
    }
    this.daImportare = { file: r.file, cambia: cosaCambia(r.file, localStorage), scartate: r.scartate };
  }

  private applica(): void {
    const d = this.daImportare;
    if (!d) return;
    const n = importa(d.file, localStorage);
    log.info(`Impostazioni importate (${n} gruppi, file della versione ${d.file.versione}): ricarico`);
    location.reload();
  }

  private conferma(): TemplateResult | typeof nothing {
    const d = this.daImportare;
    if (!d) return nothing;
    const data = d.file.data ? new Date(d.file.data).toLocaleString("it-IT") : "data sconosciuta";
    return html`<div class="blocco" data-test="copia-conferma">
      <b>Importare queste impostazioni?</b>
      <small class="nota">File della versione ${d.file.versione}, del ${data}.</small>
      ${
        d.cambia.length
          ? html`<span>Cambiano:</span>
              <ul data-test="copia-cambia">
                ${d.cambia.map((c) => html`<li>${c.titolo}</li>`)}
              </ul>`
          : html`<span data-test="copia-uguali">Sono già uguali a quelle di questo pannello.</span>`
      }
      ${
        d.scartate.length
          ? html`<small class="nota" data-test="copia-scartate"
              >Nel file c'era anche ${descriviScartate(d.scartate)}: non si importa.</small
            >`
          : nothing
      }
      <small class="nota">Il resto resta com'è. Dopo l'importazione il pannello si ricarica.</small>
      <div class="comandi">
        <button data-test="copia-importa" ?disabled=${!d.cambia.length} @click=${() => this.applica()}>
          Importa e ricarica
        </button>
        <button data-test="copia-annulla" @click=${() => (this.daImportare = null)}>Annulla</button>
      </div>
    </div>`;
  }

  protected disegna(): TemplateResult {
    return html`<div class="blocco">
        <b>Esporta</b>
        <small class="nota"
          >Un file con le impostazioni di questo pannello, da importare su un altro tablet o telefono.
          Contiene: ${CHIAVI_COPIABILI.map(([, t]) => t).join(", ")}. Mai il collegamento a Home Assistant, la
          stanza del pannello, il registro o la pronuncia di «Jarvis».</small
        >
        <button data-test="copia-esporta" @click=${() => this.scarica()}>${icona(mdiDownload)}Esporta</button>
      </div>
      <div class="blocco">
        <b>Importa</b>
        <small class="nota">Scegli un file esportato da un altro pannello: prima vedi cosa cambia.</small>
        <label class="file"
          >${icona(mdiUpload)}Scegli il file
          <input
            type="file"
            accept="application/json,.json"
            data-test="copia-file"
            @change=${(e: Event) => void this.scelto(e)}
        /></label>
        ${this.errore ? html`<div class="errore" role="alert" data-test="copia-errore">${this.errore}</div>` : nothing}
      </div>
      ${this.conferma()}`;
  }
}
customElements.define("jarvis-impostazioni-copia", JarvisImpostazioniCopia);
