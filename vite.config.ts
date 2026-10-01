import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pacchetto = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// L'app è servita da Home Assistant in /config/www/jarvis/ → <origine>/local/jarvis/.
// Sull'indirizzo HTTPS ogni richiesta costa ~1,5 s: il build produce POCHI file
// (un solo JS, niente CSS separato, niente font) che il service worker mette in cache.
export default defineConfig({
  base: "./",
  define: {
    __VERSIONE__: JSON.stringify(pacchetto.version),
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/jarvis-[hash].js",
        // l'unico pezzo caricato dopo: il motore della parola «Jarvis» (v0.5.0), con
        // onnxruntime e i modelli, in parola/ (scripts/dopo-build.mjs lo tiene fuori
        // dal bundle iniziale; il service worker lo mette in una cache sua)
        chunkFileNames: "parola/motore-[hash].js",
        assetFileNames: (a) =>
          /\.(wasm|onnx)$/.test(a.names[0] ?? "")
            ? "parola/[name]-[hash][extname]"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "jsdom",
  },
});
