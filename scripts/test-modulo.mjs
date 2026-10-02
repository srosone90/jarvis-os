// Prove di UN modulo (riordino del 02/10): `npm run test:<modulo>`.
// Lancia le prove unitarie di test/unit/<modulo>/ e, se il modulo ne ha, il
// build e le prove nel browser di test/e2e/<modulo>/ (servono il pannello
// compilato). Le prove trasversali (layout alle 6 misure) stanno in
// test/e2e/trasversali/ e girano con `npm run verifica`.
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const modulo = process.argv[2];
if (!modulo || !existsSync(`src/${modulo}`)) {
  console.error(`Modulo sconosciuto: ${modulo ?? "(nessuno)"}. Uso: node scripts/test-modulo.mjs <modulo>`);
  process.exit(2);
}
const ha = (cartella) =>
  existsSync(cartella) && readdirSync(cartella).some((f) => /\.(test|spec)\.ts$/.test(f));
const esegui = (comando, argomenti) => {
  console.log(`\n> ${comando} ${argomenti.join(" ")}`);
  const r = spawnSync(comando, argomenti, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const unit = `test/unit/${modulo}`;
const e2e = `test/e2e/${modulo}`;
if (!ha(unit) && !ha(e2e)) {
  console.error(`Il modulo ${modulo} non ha prove in ${unit} né in ${e2e}.`);
  process.exit(1);
}
if (ha(unit)) esegui("npx", ["vitest", "run", `${unit}/`]);
if (ha(e2e)) {
  esegui("npm", ["run", "build"]);
  esegui("npx", ["playwright", "test", `${e2e}/`]);
}
