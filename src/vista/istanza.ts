import { ControlloVista } from "./vista";

/**
 * L'unico controllo della vista del pannello. La condizione "si può andare a
 * riposo" la dà il layout (jarvis-app), che sa cosa è aperto.
 */
let condizione: () => boolean = () => true;

export const vista = new ControlloVista(() => condizione());

export function quandoPuoRiposare(f: () => boolean): void {
  condizione = f;
}
