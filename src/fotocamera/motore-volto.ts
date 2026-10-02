/**
 * Il modello del volto (v0.6.0), caricato SOLO quando la fotocamera parte,
 * con un `import()`: onnxruntime-web (già usato da «Jarvis») e il modello
 * (1,27 MB, `modelli/volto/`) restano fuori dal bundle iniziale, in `parola/`
 * con il motore della parola (scripts/dopo-build.mjs, cache a parte del
 * service worker).
 */
import * as ort from "onnxruntime-web/wasm";
import urlVolto from "../../modelli/volto/version-RFB-320.onnx?url";
import { log } from "../diagnostica/log";
import type { MotoreVolto } from "./presenza";
import { ALTEZZA_MODELLO, ingresso, LARGHEZZA_MODELLO } from "./volto";

export async function creaMotoreVolto(): Promise<MotoreVolto> {
  const t0 = performance.now();
  // un solo thread, come per la parola (niente SharedArrayBuffer su HA)
  ort.env.wasm.numThreads = 1;
  const sessione = await ort.InferenceSession.create(urlVolto, { logSeverityLevel: 3 });
  log.info(`Fotocamera: modello del volto pronto in ${Math.round(performance.now() - t0)} ms`);
  return {
    async rileva(rgba: Uint8ClampedArray) {
      const t = performance.now();
      const r = await sessione.run({
        [sessione.inputNames[0] ?? "input"]: new ort.Tensor("float32", ingresso(rgba), [
          1,
          3,
          ALTEZZA_MODELLO,
          LARGHEZZA_MODELLO,
        ]),
      });
      const scores = r["scores"]?.data;
      const boxes = r["boxes"]?.data;
      if (!(scores instanceof Float32Array) || !(boxes instanceof Float32Array))
        throw new Error("il modello del volto non ha dato scores e boxes");
      return { scores, boxes, ms: performance.now() - t };
    },
  };
}
