import { mdiAirConditioner } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../configurazione";
import { scrittoDaUnAzione } from "../stato/entita";
import { icona } from "./base";
import { CardBase, stileCard, statoInItaliano } from "./card-base";

const NOMI_MODI: Record<string, string> = {
  off: "Spento",
  cool: "Freddo",
  heat: "Caldo",
  fan_only: "Ventola",
  dry: "Deumidifica",
  heat_cool: "Auto",
  auto: "Auto",
};
/** Decisione del 29/09: 4 modalità sempre visibili, le altre sotto "Altro". */
const PRINCIPALI = ["off", "cool", "heat", "fan_only"];
const ATTESA_TEMPERATURA_MS = 1200;

/**
 * Condizionatore. Con gli infrarossi Home Assistant non sa cosa sta facendo
 * davvero: la card mostra l'ULTIMO COMANDO inviato, mai "acceso" come fatto certo.
 * E finché nessun comando è andato a buon fine mostra "Nessun comando inviato":
 * lo stato iniziale che HA assume all'avvio (es. Ventola · 21°) non è mai stato
 * mandato. Lo si riconosce dal context dello stato (`scrittoDaUnAzione`), che è
 * in HA e vale per tutti i pannelli. Dopo un riavvio di HA si torna a "Nessun
 * comando inviato": HA non sa più cosa è stato mandato prima.
 * La temperatura si regola con −/+ e parte un solo comando 1,2 s dopo l'ultimo
 * tocco (ogni comando infrarossi rimanda tutto lo stato al condizionatore).
 */
export class JarvisCardClima extends CardBase {
  static override styles = [
    ...stileCard,
    css`
      .temperatura {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .temperatura output {
        font-size: 32px;
        font-weight: 300;
        min-width: 70px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .tondo {
        border-radius: 24px;
        font-size: 26px;
        line-height: 1;
      }
      .intestazione,
      .controlli {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .controlli {
        margin-top: auto;
      }
      /* compatto: nome e ultimo comando su una riga, temperatura e modalità affiancate se c'è posto */
      @media (orientation: landscape) and (max-height: 559px) {
        .intestazione {
          flex-direction: row;
          flex-wrap: wrap;
          align-items: baseline;
          column-gap: 8px;
          row-gap: 0;
        }
        .controlli {
          flex-direction: row;
          flex-wrap: wrap;
          gap: 6px;
        }
        .controlli .comandi {
          flex: 1 1 250px;
        }
        .temperatura {
          gap: 4px;
        }
        .temperatura output {
          font-size: 24px;
          min-width: 52px;
        }
      }
    `,
  ];

  static override properties = {
    ...CardBase.properties,
    altro: { state: true },
    temperaturaLocale: { state: true },
  };
  declare altro: boolean;
  declare temperaturaLocale: number | null;
  private timerTemperatura: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.altro = false;
    this.temperaturaLocale = null;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timerTemperatura);
  }

  private get infrarossi(): boolean {
    return (
      PREFERENZE.infrarossi.includes(this.card.entita) || this.entita?.attributes["assumed_state"] === true
    );
  }

  private numero(chiave: string, predefinito: number): number {
    const v = Number(this.entita?.attributes[chiave]);
    return Number.isFinite(v) ? v : predefinito;
  }

  private cambiaTemperatura(passo: number): void {
    if (this.disabilitata) return;
    const min = this.numero("min_temp", 16);
    const max = this.numero("max_temp", 30);
    const scatto = this.numero("target_temp_step", 1);
    const base = this.temperaturaLocale ?? this.numero("temperature", 24);
    this.temperaturaLocale = Math.min(max, Math.max(min, Math.round((base + passo * scatto) * 10) / 10));
    clearTimeout(this.timerTemperatura);
    this.timerTemperatura = setTimeout(() => {
      const t = this.temperaturaLocale;
      this.temperaturaLocale = null;
      if (t !== null)
        this.esegui({ dominio: "climate", servizio: "set_temperature", dati: { temperature: t } });
    }, ATTESA_TEMPERATURA_MS);
  }

  private modo(m: string): void {
    this.altro = false;
    this.esegui({
      dominio: "climate",
      servizio: "set_hvac_mode",
      dati: { hvac_mode: m },
      ...(this.infrarossi ? {} : { attesoStato: m }),
    });
  }

  protected disegna(): TemplateResult {
    const e = this.entita;
    const stato = this.statoMostrato;
    const modi = Array.isArray(e?.attributes["hvac_modes"]) ? (e.attributes["hvac_modes"] as string[]) : [];
    const principali = PRINCIPALI.filter((m) => modi.includes(m));
    const altri = modi.filter((m) => !PRINCIPALI.includes(m));
    const visibili = this.altro ? altri : principali;
    // a infrarossi, senza un comando andato a buon fine lo stato è solo quello assunto da HA
    const ignoto = this.infrarossi && !this.nonDisponibile && !scrittoDaUnAzione(e);
    const temperatura = this.temperaturaLocale ?? (e && !ignoto ? Number(e.attributes["temperature"]) : NaN);
    const acceso = stato !== undefined && stato !== "off" && !this.nonDisponibile && !ignoto;
    const descrizione = this.nonDisponibile
      ? statoInItaliano(e?.state)
      : ignoto
        ? "Nessun comando inviato"
        : (NOMI_MODI[stato ?? ""] ?? stato ?? "—");
    return html`<div
      class="card ${acceso ? "acceso" : ""} ${this.nonAggiornato ? "vecchio" : ""}"
      data-test="card-clima"
    >
      <div class="intestazione">
        <div class="riga">${icona(mdiAirConditioner)}<span class="nome">${this.card.nome}</span></div>
        <span class="stato ${this.inAttesa ? "in-attesa" : ""}" data-test="card-stato">
          ${this.infrarossi && !this.nonDisponibile && !ignoto ? "Ultimo comando: " : ""}${descrizione}${Number.isFinite(temperatura) && acceso ? ` · ${String(temperatura).replace(".", ",")}°` : ""}
        </span>
      </div>
      <div class="controlli">
        <div class="temperatura">
          <button
            class="tondo"
            aria-label="Abbassa temperatura"
            ?disabled=${this.disabilitata}
            @click=${() => this.cambiaTemperatura(-1)}
          >
            −
          </button>
          <output data-test="clima-temperatura"
            >${Number.isFinite(temperatura) ? `${String(temperatura).replace(".", ",")}°` : "—"}</output
          >
          <button
            class="tondo"
            aria-label="Alza temperatura"
            ?disabled=${this.disabilitata}
            @click=${() => this.cambiaTemperatura(1)}
          >
            +
          </button>
        </div>
        <div class="comandi" role="group" aria-label="Modalità">
          ${visibili.map(
            (m) =>
              html`<button
                aria-pressed=${stato === m && !ignoto ? "true" : "false"}
                ?disabled=${this.disabilitata}
                @click=${() => this.modo(m)}
              >
                ${NOMI_MODI[m] ?? m}
              </button>`,
          )}
          ${
            altri.length
              ? html`<button
                  aria-expanded=${this.altro ? "true" : "false"}
                  @click=${() => (this.altro = !this.altro)}
                  ?disabled=${this.disabilitata}
                >
                  ${this.altro ? "Indietro" : "Altro"}
                </button>`
              : nothing
          }
        </div>
      </div>
    </div>`;
  }
}
customElements.define("jarvis-card-clima", JarvisCardClima);
