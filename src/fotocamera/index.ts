export { OcchioFotocamera } from "./occhio";
export { Presenza } from "./presenza";
export type { MotoreVolto } from "./presenza";
import type { MotoreVolto } from "./presenza";

/**
 * Il modello del volto, caricato solo quando la fotocamera parte: l'`import()`
 * sta qui, dentro il modulo, così onnxruntime e il modello restano fuori dal
 * pacchetto iniziale (in `parola/`).
 */
export const caricaMotoreVolto = (): Promise<MotoreVolto> =>
  import("./motore-volto").then((m) => m.creaMotoreVolto());
