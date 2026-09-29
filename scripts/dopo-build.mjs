/**
 * Dopo `vite build`:
 *  1. genera dist/sw.js con l'elenco esatto dei file da mettere in cache;
 *  2. controlla i limiti del progetto: pochi file (ogni richiesta sull'HTTPS
 *     costa ~1,5 s) e bundle iniziale < 200 KB gzip.
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
// La pagina della prova "Ehi Jarvis" (vite.prova.config.ts) NON fa parte del
// pannello: fuori dal service worker e dai limiti, con un controllo suo.
const DELLA_PROVA = (p) => p === "prova-ehi-jarvis.html" || p.startsWith("prova/");
const MAX_PROVA_MB = 25;
const tuttiIFile = elenca(DIST).map((p) => relative(DIST, p).split("\\").join("/"));
const prova = tuttiIFile.filter(DELLA_PROVA).sort();
const file = tuttiIFile.filter((p) => p !== "sw.js" && !DELLA_PROVA(p)).sort();

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
if (prova.length > 0) {
  const mb = prova.reduce((s, f) => s + statSync(join(DIST, f)).size, 0) / 1024 / 1024;
  console.log(
    `\nProva "Ehi Jarvis" (fuori dal pannello e dal service worker): ${prova.length} file, ${mb.toFixed(1)} MB`,
  );
  for (const f of prova) console.log(`  ${f}  (${(statSync(join(DIST, f)).size / 1024).toFixed(1)} KB)`);
  if (mb > MAX_PROVA_MB) {
    console.error(`ERRORE: la prova pesa ${mb.toFixed(1)} MB, massimo ${MAX_PROVA_MB}`);
    errori++;
  }
}
process.exit(errori ? 1 : 0);
