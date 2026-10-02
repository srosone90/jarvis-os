/**
 * Dopo `vite build`:
 *  1. genera dist/sw.js con l'elenco esatto dei file da mettere in cache;
 *  2. controlla i limiti del progetto: pochi file (ogni richiesta sull'HTTPS
 *     costa ~1,5 s) e bundle iniziale < 200 KB gzip.
 *
 * Il motore della parola «Jarvis» (v0.5.0: onnxruntime, modelli, ~17 MB) e dalla
 * v0.6.0 quello del volto (fotocamera, 1,2 MB di modello) stanno
 * in parola/: fuori dal bundle iniziale e dal limite dei file, in una cache
 * sua del service worker che scarica solo i file cambiati.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const MAX_FILE = 10;
const MAX_GZIP_KB = 200;

function elenca(cartella) {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    return statSync(percorso).isDirectory() ? elenca(percorso) : [percorso];
  });
}

const versione = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const DELLA_PAROLA = (p) => p.startsWith("parola/");
const MAX_PAROLA_MB = 25;
const tuttiIFile = elenca(DIST).map((p) => relative(DIST, p).split("\\").join("/"));
const parola = tuttiIFile.filter(DELLA_PAROLA).sort();
const file = tuttiIFile.filter((p) => p !== "sw.js" && !DELLA_PAROLA(p)).sort();

const impronta = createHash("sha256");
for (const f of file) impronta.update(f).update(readFileSync(join(DIST, f)));

const sw = readFileSync(new URL("./sw-modello.js", import.meta.url), "utf8")
  .replace("__VERSIONE__", versione)
  .replace("__IMPRONTA__", impronta.digest("hex").slice(0, 12))
  .replace(
    "__ELENCO__",
    JSON.stringify(
      file.map((f) => `./${f}`),
      null,
      2,
    ),
  )
  .replace(
    "__PAROLA__",
    JSON.stringify(
      parola.map((f) => `./${f}`),
      null,
      2,
    ),
  );
writeFileSync(join(DIST, "sw.js"), sw);

const tutti = [...file, "sw.js"];
const iniziali = tutti.filter((f) => /\.(js|html|webmanifest)$/.test(f));
const gzipKB = iniziali.reduce((s, f) => s + gzipSync(readFileSync(join(DIST, f))).length, 0) / 1024;

console.log(`\nJarvis OS ${versione} — ${tutti.length} file in dist/:`);
for (const f of tutti) console.log(`  ${f}  (${(statSync(join(DIST, f)).size / 1024).toFixed(1)} KB)`);
console.log(`Codice iniziale (html+js+manifest+sw) gzip: ${gzipKB.toFixed(1)} KB (limite ${MAX_GZIP_KB} KB)`);

let errori = 0;
if (tutti.length > MAX_FILE) {
  console.error(`ERRORE: ${tutti.length} file, massimo ${MAX_FILE} (ogni richiesta costa ~1,5 s sull'HTTPS)`);
  errori++;
}
if (gzipKB > MAX_GZIP_KB) {
  console.error(`ERRORE: bundle iniziale ${gzipKB.toFixed(1)} KB gzip, massimo ${MAX_GZIP_KB} KB`);
  errori++;
}
const js = tutti.filter((f) => f.endsWith(".js") && f !== "sw.js");
if (js.length !== 1) {
  console.error(`ERRORE: attesi 1 file JavaScript, trovati ${js.length}: ${js.join(", ")}`);
  errori++;
}
const mb = parola.reduce((s, f) => s + statSync(join(DIST, f)).size, 0) / 1024 / 1024;
console.log(
  `\nMotori della parola «Jarvis» e del volto (caricati dopo, cache a parte): ${parola.length} file, ${mb.toFixed(1)} MB`,
);
for (const f of parola) console.log(`  ${f}  (${(statSync(join(DIST, f)).size / 1024).toFixed(1)} KB)`);
// v0.6.0: motore della parola, motore del volto e onnxruntime condiviso (1-3 pezzi JS),
// un solo .wasm, 3 modelli della parola + 1 del volto
const jsParola = parola.filter((f) => f.endsWith(".js"));
if (
  jsParola.length < 1 ||
  jsParola.length > 3 ||
  parola.filter((f) => f.endsWith(".wasm")).length !== 1 ||
  parola.filter((f) => f.endsWith(".onnx")).length !== 4 ||
  !parola.some((f) => /version-RFB-320.*\.onnx$/.test(f))
) {
  console.error(
    `ERRORE: in parola/ attesi 1-3 JavaScript, un .wasm, 3 modelli della parola e quello del volto: trovati ${parola.join(", ")}`,
  );
  errori++;
}
if (mb > MAX_PAROLA_MB) {
  console.error(`ERRORE: il motore della parola pesa ${mb.toFixed(1)} MB, massimo ${MAX_PAROLA_MB}`);
  errori++;
}
process.exit(errori ? 1 : 0);
