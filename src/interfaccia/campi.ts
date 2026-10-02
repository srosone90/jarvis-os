import { css, html, nothing, type TemplateResult } from "lit";
import { virgola } from "../comune";

/**
 * Campi delle impostazioni (v0.5.4, "personalizzazione massima" del 01/10):
 * ogni valore ha il suo valore di serie, scritto accanto, e il tasto
 * "Ripristina valore di serie" che compare solo quando è cambiato. Funzioni
 * che restituiscono template: si usano dentro qualunque sezione. `cambia`
 * riceve `null` per "torna al valore di serie".
 */

export const stileCampi = css`
  .campo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 12px 0;
    border-bottom: 1px solid #1c2029;
  }
  .campo > .testo {
    flex: 1 1 240px;
    min-width: 0;
  }
  .campo b {
    font-weight: 500;
    font-size: 17px;
  }
  .campo small {
    display: block;
    color: var(--attenuato);
    font-size: 14px;
    margin-top: 3px;
    overflow-wrap: break-word;
  }
  .campo .comandi {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .campo input[type="number"],
  .campo input[type="time"],
  .campo input[type="text"],
  .campo select {
    min-height: 48px;
    max-width: 100%;
    border-radius: 12px;
    border: 1px solid #343a46;
    background: var(--superficie);
    color: var(--testo);
    font: inherit;
    font-size: 16px;
    padding: 0 12px;
  }
  .campo input[type="number"] {
    width: 110px;
  }
  .campo input.auto {
    width: 150px;
  }
  .campo input[type="text"] {
    width: 220px;
  }
  /* elenchi (v0.5.7): vanno a capo, si legge tutto */
  .campo textarea {
    box-sizing: border-box;
    width: 320px;
    max-width: 100%;
    min-height: 72px;
    border-radius: 12px;
    border: 1px solid #343a46;
    background: var(--superficie);
    color: var(--testo);
    font: inherit;
    font-size: 16px;
    padding: 10px 12px;
    resize: vertical;
  }
  .campo .comandi {
    max-width: 100%;
  }
  .campo .unita {
    color: var(--attenuato);
    font-size: 15px;
  }
  .campo input[type="checkbox"] {
    width: 26px;
    height: 26px;
    accent-color: var(--accento);
  }
  .campo .interruttore {
    display: flex;
    align-items: center;
    min-height: 48px;
    cursor: pointer;
  }
  .ripristina {
    min-height: 40px;
    border-radius: 10px;
    border: 1px solid #343a46;
    background: none;
    color: var(--attenuato);
    font: inherit;
    font-size: 14px;
    padding: 0 10px;
    cursor: pointer;
  }
  .campo.disattivo {
    opacity: 0.55;
  }
`;

interface Base<T> {
  /** Usato in data-test: `campo-<id>` e `ripristina-<id>`. */
  id: string;
  titolo: string;
  spiegazione?: string | TemplateResult;
  valore: T;
  diSerie: T;
  cambia: (v: T | null) => void;
  disattivo?: boolean;
}

const testoSerie = (v: unknown, formato?: (x: never) => string): string =>
  formato ? formato(v as never) : typeof v === "boolean" ? (v ? "acceso" : "spento") : String(v);

function riga<T>(o: Base<T>, controllo: TemplateResult, formato?: (v: T) => string): TemplateResult {
  const uguale = JSON.stringify(o.valore) === JSON.stringify(o.diSerie);
  return html`<div class="campo ${o.disattivo ? "disattivo" : ""}">
    <div class="testo">
      <b>${o.titolo}</b>
      ${o.spiegazione ? html`<small>${o.spiegazione}</small>` : nothing}
      <small data-test="serie-${o.id}">Di serie: ${testoSerie(o.diSerie, formato as never)}</small>
    </div>
    <span class="comandi">
      ${controllo}
      ${
        uguale
          ? nothing
          : html`<button
              class="ripristina"
              data-test="ripristina-${o.id}"
              aria-label="Ripristina il valore di serie: ${o.titolo}"
              @click=${() => o.cambia(null)}
            >
              Ripristina
            </button>`
      }
    </span>
  </div>`;
}

export function campoNumero(
  o: Base<number> & { min: number; max: number; passo: number; unita?: string; cifre?: number },
): TemplateResult {
  const cifre = o.cifre ?? 0;
  return riga(
    o,
    html`<input
        type="number"
        inputmode="decimal"
        data-test="campo-${o.id}"
        aria-label=${o.titolo}
        min=${o.min}
        max=${o.max}
        step=${o.passo}
        .value=${String(o.valore)}
        ?disabled=${o.disattivo}
        @change=${(e: Event) => {
          const v = Number((e.target as HTMLInputElement).value.replace(",", "."));
          if (Number.isFinite(v)) o.cambia(Math.min(o.max, Math.max(o.min, v)));
        }}
      />${o.unita ? html`<span class="unita">${o.unita}</span>` : nothing}`,
    (v) => `${virgola(v, cifre)}${o.unita ? ` ${o.unita}` : ""}`,
  );
}

/** Numero che può anche essere "automatico" (null): campo vuoto = automatico. */
export function campoNumeroAuto(
  o: Base<number | null> & { min: number; max: number; passo: number; cifre?: number; auto: string },
): TemplateResult {
  const cifre = o.cifre ?? 2;
  return riga<number | null>(
    o,
    html`<input
      type="number"
      class="auto"
      inputmode="decimal"
      data-test="campo-${o.id}"
      aria-label=${o.titolo}
      placeholder=${o.auto}
      min=${o.min}
      max=${o.max}
      step=${o.passo}
      .value=${o.valore === null ? "" : String(o.valore)}
      @change=${(e: Event) => {
        const t = (e.target as HTMLInputElement).value.trim().replace(",", ".");
        if (t === "") return o.cambia(null);
        const v = Number(t);
        if (Number.isFinite(v)) o.cambia(Math.min(o.max, Math.max(o.min, v)));
      }}
    />`,
    (v) => (v === null ? o.auto : virgola(v, cifre)),
  );
}

export function campoInterruttore(o: Base<boolean>): TemplateResult {
  return riga(
    o,
    html`<label class="interruttore">
      <input
        type="checkbox"
        data-test="campo-${o.id}"
        aria-label=${o.titolo}
        .checked=${o.valore}
        ?disabled=${o.disattivo}
        @change=${(e: Event) => o.cambia((e.target as HTMLInputElement).checked)}
      />
    </label>`,
  );
}

/** Orario "HH:MM". */
export function campoOrario(o: Base<string>): TemplateResult {
  return riga(
    o,
    html`<input
      type="time"
      data-test="campo-${o.id}"
      aria-label=${o.titolo}
      .value=${o.valore}
      ?disabled=${o.disattivo}
      @change=${(e: Event) => {
        const v = (e.target as HTMLInputElement).value;
        if (/^\d{2}:\d{2}$/.test(v)) o.cambia(v);
      }}
    />`,
  );
}

export function campoTesto(o: Base<string> & { segnaposto?: string }): TemplateResult {
  return riga(
    o,
    html`<input
      type="text"
      data-test="campo-${o.id}"
      aria-label=${o.titolo}
      placeholder=${o.segnaposto ?? ""}
      .value=${o.valore}
      ?disabled=${o.disattivo}
      @change=${(e: Event) => o.cambia((e.target as HTMLInputElement).value.trim())}
    />`,
    (v) => (v === "" ? "vuoto" : `«${v}»`),
  );
}

/** Testo che può essere lungo (elenchi separati da virgole): va a capo invece di scorrere di lato. */
export function campoTestoLungo(o: Base<string> & { segnaposto?: string }): TemplateResult {
  return riga(
    o,
    html`<textarea
      data-test="campo-${o.id}"
      aria-label=${o.titolo}
      rows="2"
      placeholder=${o.segnaposto ?? ""}
      .value=${o.valore}
      ?disabled=${o.disattivo}
      @change=${(e: Event) => o.cambia((e.target as HTMLTextAreaElement).value.trim())}
    ></textarea>`,
    (v) => (v === "" ? "vuoto" : `«${v}»`),
  );
}

export function campoScelta<T extends string>(
  o: Base<T> & { opzioni: readonly (readonly [T, string])[] },
): TemplateResult {
  return riga(
    o,
    html`<select
      data-test="campo-${o.id}"
      aria-label=${o.titolo}
      ?disabled=${o.disattivo}
      @change=${(e: Event) => o.cambia((e.target as HTMLSelectElement).value as T)}
    >
      ${o.opzioni.map(([v, t]) => html`<option value=${v} ?selected=${v === o.valore}>${t}</option>`)}
    </select>`,
    (v) => o.opzioni.find(([x]) => x === v)?.[1] ?? String(v),
  );
}
