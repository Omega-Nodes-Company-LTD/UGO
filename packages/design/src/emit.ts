import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_CSS, FONT_FILES, tokensCss } from "./tokens.js";

/**
 * Il passo di build che scrive `dist/tokens.css` e copia i woff2 accanto:
 * così Vite e Next li impacchettano da soli, e nessuna superficie va a un CDN
 * (la casa non ne ha uno, ADR-044).
 */
const here = dirname(fileURLToPath(import.meta.url));
const fonts = join(here, "fonts");
mkdirSync(fonts, { recursive: true });
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("@fontsource/atkinson-hyperlegible/package.json"));
for (const file of Object.values(FONT_FILES)) {
  copyFileSync(join(source, "files", file), join(fonts, file));
}
writeFileSync(join(here, "tokens.css"), tokensCss({ fontBase: "./fonts/" }) + BASE_CSS);
