import { defineConfig } from "vite";

/**
 * Build a parte per la PROVA "Ehi Jarvis" (prova-ehi-jarvis.html): onnxruntime
 * e i modelli pesano MB e non devono entrare nel pannello. Scrive in dist/
 * accanto al pannello (senza cancellarlo): la pagina alla radice, tutto il resto
 * in dist/prova/. scripts/dopo-build.mjs tiene questi file fuori dal service
 * worker e dai limiti del pannello.
 */
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false,
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: {
      input: "prova-ehi-jarvis.html",
      output: {
        entryFileNames: "prova/prova-[hash].js",
        chunkFileNames: "prova/prova-[hash].js",
        assetFileNames: "prova/[name]-[hash][extname]",
      },
    },
  },
});
