import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/", "docs/", ".venv*/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        console: "readonly",
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Response: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        process: "readonly",
      },
    },
    rules: {
      // Mai catch vuoti: ogni errore va loggato (regola del progetto)
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Modello del service worker: __ELENCO__ lo sostituisce scripts/dopo-build.mjs
    files: ["scripts/sw-modello.js"],
    languageOptions: { globals: { __ELENCO__: "readonly", Request: "readonly" } },
  },
  {
    // Finto Home Assistant delle prove: script Node, lo stato è una mappa di entità
    files: ["test/finto-ha/**"],
    languageOptions: { globals: { setImmediate: "readonly" } },
    rules: { "@typescript-eslint/no-dynamic-delete": "off" },
  },
);
