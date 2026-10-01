import { mdiWeatherSunset, mdiWeatherSunsetUp } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import {
  caricaPreferenzeMeteo,
  direzione,
  oraDi,
  pioggiaDi,
  prossimeOre,
  vento,
  type PreferenzeMeteo,
} from "../meteo/dettagli";
import { osservaPrevisione } from "../meteo/previsione";
import { condizione, gradiInteri, numero, type PrevisioneGiorno } from "../meteo/testi";
import { icona, OsservaEntita, RiquadroSicuro, stileBase } from "./base";

/** Alba e tramonto: l'entità di serie di Home Assistant (integrazione Sole). */
export const SOLE = "sun.sun";

/**
 * Schermata Meteo (v0.5.5, mockup N2 "3 · Meteo"): adesso, prossime ore,
 * prossimi giorni, alba e tramonto. Solo dati veri di `weather.forecast_casa`
 * (e `sun.sun` se c'è): quello che non arriva non si inventa e non si mostra.
 * Cosa mostrare si sceglie in Impostazioni → Schermate.
 */
export class JarvisPaginaMeteo extends RiquadroSicuro {
  static override properties = {
    giornaliera: { state: true },
    oraria: { state: true },
  };
  declare giornaliera: PrevisioneGiorno[] | null;
  declare oraria: PrevisioneGiorno[] | null;

  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
        min-height: 0;
        overflow: auto;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 600;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--attenuato);
      }
      .adesso {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 24px;
        padding: 16px;
        border-radius: var(--raggio);
        background: var(--superficie);
      }
      .adesso .grande {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .adesso .grande .icona {
        width: 56px;
        height: 56px;
        color: var(--accento);
      }
      .temp {
        font-size: 56px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }
      .cond {
        font-size: 18px;
      }
      .dettagli {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 20px;
        color: var(--attenuato);
        font-size: 16px;
      }
      .dettagli b {
        color: var(--testo);
        font-weight: 500;
      }
      .sole {
        display: flex;
        gap: 16px;
      }
      .sole span {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .sole .icona {
        width: 22px;
        height: 22px;
        color: var(--attenuato);
      }
      /* ore: su più righe se non stanno in una (mai scorrimento di lato) */
      .ore {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 6px;
      }
      .ora {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 8px 4px;
        border-radius: 12px;
        background: var(--superficie);
        font-size: 15px;
      }
      .ora b {
        font-size: 18px;
        font-weight: 500;
      }
      .ora .icona {
        width: 24px;
        height: 24px;
      }
      .ora small,
      .giorno small {
        color: #8fb4ff;
        font-size: 13px;
      }
      .giorni {
        display: flex;
        flex-direction: column;
      }
      .giorno {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 4px;
        border-bottom: 1px solid #1c2029;
        font-size: 17px;
      }
      .giorno .icona {
        width: 26px;
        height: 26px;
        color: var(--accento);
      }
      .giorno .nome {
        flex: 1;
        min-width: 0;
      }
      .giorno .nome small {
        display: block;
        color: var(--attenuato);
      }
      .giorno .t {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .nota {
        color: var(--attenuato);
        font-size: 15px;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        :host {
          gap: 10px;
        }
        .temp {
          font-size: 44px;
        }
        .adesso {
          padding: 10px 14px;
        }
      }
    `,
  ];

  private pref: PreferenzeMeteo = caricaPreferenzeMeteo();
  private smetti: (() => Promise<void>)[] = [];
  private smettiConnessione: (() => void) | null = null;
  private connIscritta: unknown = null;

  constructor() {
    super();
    this.giornaliera = null;
    this.oraria = null;
    new OsservaEntita(this, () => [PREFERENZE.meteo, SOLE]);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.pref = caricaPreferenzeMeteo();
    this.smettiConnessione = connessione.ascolta(() => void this.sottoscrivi());
    void this.sottoscrivi();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smettiConnessione?.();
    for (const s of this.smetti) void s();
    this.smetti = [];
    this.connIscritta = null;
  }

  private async sottoscrivi(): Promise<void> {
    const conn = connessione.conn;
    if (!conn || conn === this.connIscritta || connessione.stato.stato !== "connesso") return;
    this.connIscritta = conn;
    for (const s of this.smetti) void s();
    this.smetti = [];
    const g = await osservaPrevisione(conn, PREFERENZE.meteo, (p) => (this.giornaliera = p), "daily");
    if (g) this.smetti.push(g);
    if (this.pref.ore > 0) {
      const o = await osservaPrevisione(conn, PREFERENZE.meteo, (p) => (this.oraria = p), "hourly");
      if (o) this.smetti.push(o);
      else this.oraria = [];
    }
  }

  private adesso(): TemplateResult {
    const m = connessione.negozio.entitaDi(PREFERENZE.meteo);
    if (!m)
      return html`<div class="nota" role="status">
        ${connessione.negozio.pronto ? `Meteo non disponibile (${PREFERENZE.meteo} non trovato)` : "In attesa di Home Assistant…"}
      </div>`;
    const a = m.attributes;
    const c = condizione(m.state);
    const p = this.pref;
    const umidita = p.umidita ? numero(a["humidity"], 0) : null;
    const v = p.vento ? vento(a["wind_speed"], a["wind_speed_unit"], p.unitaVento) : null;
    const dir = p.vento ? direzione(a["wind_bearing"]) : null;
    // "1015 hPa", non "1.015": le pressioni si scrivono senza separatore delle migliaia
    const pr = Number(a["pressure"]);
    const pressione = p.pressione && Number.isFinite(pr) ? String(Math.round(pr)) : null;
    const sole = p.alba ? connessione.negozio.entitaDi(SOLE) : undefined;
    const alba = oraDi(sole?.attributes["next_rising"]);
    const tramonto = oraDi(sole?.attributes["next_setting"]);
    return html`<div class="adesso" data-test="meteo-adesso">
      <div class="grande">
        ${icona(c.icona)}
        <span class="temp" data-test="pagina-meteo-temp">${gradiInteri(a["temperature"]) ?? "—"}</span>
        <span class="cond">${c.testo}</span>
      </div>
      <div class="dettagli">
        ${umidita !== null ? html`<span data-test="meteo-umidita">umidità <b>${umidita}%</b></span>` : nothing}
        ${v !== null ? html`<span data-test="meteo-vento">vento <b>${v}${dir ? ` da ${dir}` : ""}</b></span>` : nothing}
        ${
          pressione !== null
            ? html`<span data-test="meteo-pressione"
                >pressione <b>${pressione} ${String(a["pressure_unit"] ?? "hPa")}</b></span
              >`
            : nothing
        }
        ${
          alba || tramonto
            ? html`<span class="sole" data-test="meteo-sole">
                ${alba ? html`<span>${icona(mdiWeatherSunsetUp)}${alba}</span>` : nothing}
                ${tramonto ? html`<span>${icona(mdiWeatherSunset)}${tramonto}</span>` : nothing}
              </span>`
            : nothing
        }
      </div>
    </div>`;
  }

  private ore(): TemplateResult | typeof nothing {
    const quante = this.pref.ore;
    if (quante <= 0 || this.oraria === null) return nothing;
    const ore = prossimeOre(this.oraria, new Date(), quante);
    if (!ore.length)
      return html`<section>
        <h2>Prossime ore</h2>
        <div class="nota" data-test="meteo-ore-mancanti">
          Home Assistant non manda la previsione ora per ora.
        </div>
      </section>`;
    return html`<section>
      <h2>Prossime ${ore.length} ore</h2>
      <div class="ore" data-test="meteo-ore">
        ${ore.map(
          (o) =>
            html`<div class="ora" data-test="meteo-ora">
              <span>${o.ora}</span>${icona(o.condizione.icona, o.condizione.testo)}<b
                >${o.temperatura ?? "—"}</b
              >
              ${this.pref.pioggia && o.pioggia ? html`<small>${o.pioggia}</small>` : nothing}
            </div>`,
        )}
      </div>
    </section>`;
  }

  private giorni(): TemplateResult | typeof nothing {
    const quanti = this.pref.giorni;
    if (quanti <= 0 || this.giornaliera === null) return nothing;
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const domani = new Date(oggi.getTime() + 86_400_000);
    const nome = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric" });
    const giorni = this.giornaliera.filter((g) => new Date(g.datetime) >= domani).slice(0, quanti);
    if (!giorni.length) return nothing;
    return html`<section>
      <h2>Prossimi ${giorni.length} giorni</h2>
      <div class="giorni" data-test="meteo-giorni">
        ${giorni.map((g) => {
          const c = condizione(g.condition);
          const pioggia = this.pref.pioggia ? pioggiaDi(g) : null;
          return html`<div class="giorno" data-test="meteo-giorno">
            ${icona(c.icona)}
            <span class="nome"
              >${nome.format(new Date(g.datetime))}<small
                >${c.testo}${pioggia ? html` · pioggia ${pioggia}` : nothing}</small
              ></span
            >
            <span class="t">${gradiInteri(g.temperature) ?? "—"} / ${gradiInteri(g.templow) ?? "—"}</span>
          </div>`;
        })}
      </div>
    </section>`;
  }

  protected disegna(): TemplateResult {
    return html`<h1>Meteo</h1>
      ${this.adesso()} ${this.ore()} ${this.giorni()}`;
  }
}
customElements.define("jarvis-pagina-meteo", JarvisPaginaMeteo);
