import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { campoInterruttore, campoNumero, campoOrario } from "../../../src/interfaccia/campi";

/**
 * Riordino del 02/10: i campi delle impostazioni (valore di serie scritto
 * accanto, «Ripristina» solo quando il valore è cambiato) non avevano prove
 * unitarie, solo quelle nel browser delle singole sezioni.
 */

const monta = (t: Parameters<typeof render>[0]): HTMLElement => {
  const div = document.createElement("div");
  render(t, div);
  return div;
};
const trova = (d: HTMLElement, test: string) => d.querySelector<HTMLElement>(`[data-test="${test}"]`);

describe("campi delle impostazioni", () => {
  it("valore di serie: niente «Ripristina»; cambiato: c'è, e riporta al valore di serie (null)", () => {
    const cambia = vi.fn();
    const base = { id: "x", titolo: "Prova", diSerie: 2, min: 0, max: 15, passo: 1, unita: "s", cambia };
    expect(trova(monta(campoNumero({ ...base, valore: 2 })), "ripristina-x")).toBeNull();
    const d = monta(campoNumero({ ...base, valore: 5 }));
    expect(trova(d, "serie-x")?.textContent).toBe("Di serie: 2 s");
    trova(d, "ripristina-x")?.click();
    expect(cambia).toHaveBeenCalledWith(null);
  });
  it("numero: fuori misura torna nei limiti; decimali col formato giusto", () => {
    const cambia = vi.fn();
    const d = monta(
      campoNumero({
        id: "d",
        titolo: "Distanza",
        valore: 1.5,
        diSerie: 1.5,
        min: 0.5,
        max: 3,
        passo: 0.1,
        cifre: 1,
        unita: "metri",
        cambia,
      }),
    );
    expect(trova(d, "serie-d")?.textContent).toBe("Di serie: 1,5 metri");
    const input = trova(d, "campo-d") as HTMLInputElement;
    input.value = "9";
    input.dispatchEvent(new Event("change"));
    expect(cambia).toHaveBeenLastCalledWith(3);
  });
  it("interruttore: acceso/spento nel valore di serie, e la spunta arriva a cambia", () => {
    const cambia = vi.fn();
    const d = monta(campoInterruttore({ id: "i", titolo: "Presenza", valore: true, diSerie: true, cambia }));
    expect(trova(d, "serie-i")?.textContent).toBe("Di serie: acceso");
    const input = trova(d, "campo-i") as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(cambia).toHaveBeenCalledWith(false);
  });
  it("orario: solo «HH:MM» passa", () => {
    const cambia = vi.fn();
    const d = monta(campoOrario({ id: "o", titolo: "Dalle", valore: "23:00", diSerie: "23:00", cambia }));
    const input = trova(d, "campo-o") as HTMLInputElement;
    input.value = "07:30";
    input.dispatchEvent(new Event("change"));
    expect(cambia).toHaveBeenCalledWith("07:30");
  });
});
