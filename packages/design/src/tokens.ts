import { DARK, LIGHT, type Palette } from "./palette.js";

/**
 * I token come CSS (ADR-127), in due forme dello stesso testo:
 *
 * - `tokens.css` nel `dist`, per chi ha un bundler (muso con Vite, reception
 *   con Next): i font sono accanto, in `./fonts/`, e il bundler li impacchetta;
 * - `tokensCss({ fontBase })`, una stringa, per chi è un template servito da
 *   soul (pannello, sito): i font li serve soul stesso, da un indirizzo suo.
 *
 * I nomi delle variabili sono quelli che il pannello usava già (ADR-035):
 * cambiare la veste non deve voler dire riscrivere ogni regola.
 */

const VARS: Record<keyof Palette, string> = {
  bg: "--bg",
  surface: "--surface",
  surface2: "--surface-2",
  raised: "--raised",
  line: "--line",
  lineStrong: "--line-strong",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  accent: "--accent",
  accentSoft: "--accent-soft",
  onAccent: "--on-accent",
  data: "--data",
  dataSoft: "--data-soft",
  good: "--good",
  warning: "--warning",
  critical: "--critical",
  info: "--info",
  focus: "--focus",
};

function colours(palette: Palette): string {
  return (Object.keys(VARS) as (keyof Palette)[])
    .map((key) => `${VARS[key]}: ${palette[key]};`)
    .join(" ");
}

/** Spaziature a passi di 4px, raggi, ombre, movimento, tipografia: uguali nei due temi. */
const SCALE = `
  --font: "Atkinson Hyperlegible", Verdana, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --text-xs: .75rem; --text-sm: .875rem; --text-md: 1rem; --text-lg: 1.25rem;
  --text-xl: 1.6rem; --text-2xl: 2.2rem; --text-3xl: 3rem;
  --s-1: .25rem; --s-2: .5rem; --s-3: .75rem; --s-4: 1rem; --s-5: 1.5rem;
  --s-6: 2rem; --s-7: 3rem; --s-8: 4.5rem;
  --r-sm: .375rem; --r: .5rem; --r-lg: .75rem; --r-xl: 1.25rem; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgb(31 26 23 / 6%), 0 2px 8px rgb(31 26 23 / 5%);
  --shadow-2: 0 2px 6px rgb(31 26 23 / 8%), 0 12px 32px rgb(31 26 23 / 8%);
  --ease: cubic-bezier(.2, .7, .2, 1); --dur: 160ms;
`;

export interface TokensOptions {
  /** dove stanno i woff2, con la barra finale: `./fonts/` o `/design/fonts/` */
  fontBase: string;
}

export const FONT_FILES = {
  400: "atkinson-hyperlegible-latin-400-normal.woff2",
  700: "atkinson-hyperlegible-latin-700-normal.woff2",
} as const;

export function tokensCss({ fontBase }: TokensOptions): string {
  const faces = ([400, 700] as const)
    .map(
      (weight) =>
        `@font-face { font-family: "Atkinson Hyperlegible"; font-style: normal; ` +
        `font-weight: ${String(weight)}; font-display: swap; ` +
        `src: url("${fontBase}${FONT_FILES[weight]}") format("woff2"); }`,
    )
    .join("\n");
  return `${faces}
:root { color-scheme: light; ${colours(LIGHT)} ${SCALE} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${colours(DARK)} }
}
:root[data-theme="dark"] { color-scheme: dark; ${colours(DARK)} }
:root[data-theme="light"] { color-scheme: light; ${colours(LIGHT)} }
@media (prefers-reduced-motion: reduce) { :root { --dur: 0ms; } }
`;
}

/**
 * Il minimo che ogni superficie condivide: il font, il fuoco visibile, il
 * rispetto per chi non vuole movimento. Il resto è di ciascuna.
 */
export const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font);
       -webkit-text-size-adjust: 100%; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-sm); }
.icon { width: 1.15em; height: 1.15em; flex: 0 0 auto; vertical-align: -0.2em; }
`;
