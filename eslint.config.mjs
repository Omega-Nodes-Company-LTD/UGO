import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.next/**",
      "apps/reception/next-env.d.ts",
      "packages/db/drizzle/**",
      // ADR-044: il wasm di MediaPipe, copiato qui da vite. È binario generato
      // da un altro progetto: analizzarlo produce 1400 errori su codice che non
      // possiamo cambiare e non abbiamo scritto.
      "apps/face/public/vision/**",
      // il service worker è JS statico copiato da vite nel dist: si esegue
      // nello scope del worker, dove gli ESLint globali del browser non valgono
      // (self, caches, clients). Non è TS, non è da analizzare, è da servire.
      "apps/face/public/sw.js",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
