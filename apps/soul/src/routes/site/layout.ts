import { BASE_CSS, DESIGN_FONT_BASE, FAVICON_PATH, icon, tokensCss } from "@ugo/design";

/**
 * Il telaio del sito (ADR-121, ADR-127): una pagina server, i token del
 * design system, uno script esterno. Niente framework e niente build in più:
 * sono sette pagine, e la CSP vieta comunque gli script inline.
 */

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

const SITE_CSS = `
.wrap { width: min(68rem, 100%); margin: 0 auto; padding: 0 var(--s-4); }
header.top { border-bottom: 1px solid var(--line); background: var(--surface); }
header.top .wrap { display: flex; align-items: center; gap: var(--s-4); min-height: 3.75rem; flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: var(--s-2); font-weight: 700; font-size: var(--text-lg);
         color: var(--ink); text-decoration: none; }
.brand .icon { width: 1.6em; height: 1.6em; color: var(--accent); }
nav.main { margin-left: auto; display: flex; gap: var(--s-2); flex-wrap: wrap; }
nav.main a { color: var(--ink-2); text-decoration: none; padding: var(--s-2) var(--s-3); border-radius: var(--r); }
nav.main a:hover, nav.main a[aria-current="page"] { color: var(--ink); background: var(--surface-2); }
nav.main a.cta { background: var(--accent); color: var(--on-accent); }
main { padding: var(--s-6) 0 var(--s-7); }
h1 { font-size: var(--text-2xl); line-height: 1.15; margin: 0 0 var(--s-3); }
h2 { font-size: var(--text-xl); margin: var(--s-6) 0 var(--s-3); }
p, li { line-height: 1.6; color: var(--ink-2); max-width: 42rem; }
a { color: var(--accent); }
.lede { font-size: var(--text-lg); color: var(--ink-2); }
.hero { display: grid; gap: var(--s-5); grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); align-items: center; }
.hero-art { display: grid; place-items: center; aspect-ratio: 1; max-width: 20rem; border-radius: var(--r-xl);
            background: var(--accent-soft); color: var(--accent); }
.hero-art .icon { width: 55%; height: 55%; }
.grid { display: grid; gap: var(--s-4); grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--s-5);
        box-shadow: var(--shadow-1); }
.card h3 { margin: var(--s-2) 0; font-size: var(--text-lg); }
.card .icon { width: 1.75rem; height: 1.75rem; color: var(--accent); }
.form { display: grid; gap: var(--s-3); max-width: 26rem; }
label { font-weight: 700; color: var(--ink); }
input[type=email] { font: inherit; padding: var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r);
        background: var(--surface); color: var(--ink); min-height: 2.75rem; }
.check { display: flex; gap: var(--s-2); align-items: flex-start; font-weight: 400; color: var(--ink-2); }
.check input { margin-top: .3rem; width: 1.1rem; height: 1.1rem; }
.btn { font: inherit; font-weight: 700; border: 0; border-radius: var(--r); padding: var(--s-3) var(--s-5);
       background: var(--accent); color: var(--on-accent); cursor: pointer; min-height: 2.75rem;
       display: inline-flex; gap: var(--s-2); align-items: center; justify-content: center; text-decoration: none; }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line-strong); }
.msg { padding: var(--s-3) var(--s-4); border-radius: var(--r); border: 1px solid var(--line); background: var(--surface-2); }
.msg.ok { border-color: var(--good); } .msg.err { border-color: var(--critical); }
.muted { color: var(--ink-3); font-size: var(--text-sm); }
.pup { display: grid; gap: var(--s-2); }
.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: flex-end; margin: var(--s-4) 0; }
.filters label { display: grid; gap: var(--s-1); font-size: var(--text-sm); }
.filters input { font: inherit; padding: var(--s-2); border: 1px solid var(--line-strong); border-radius: var(--r);
  background: var(--surface); color: var(--ink); width: 9rem; min-height: 2.5rem; }
.tree { list-style: none; padding: 0; display: grid; gap: var(--s-2); }
.tree li { padding: var(--s-2) var(--s-3); border-left: 3px solid var(--accent-soft); }
.price { font-weight: 700; color: var(--ink); font-size: var(--text-lg); }
footer.bottom { border-top: 1px solid var(--line); padding: var(--s-5) 0; color: var(--ink-3); font-size: var(--text-sm); }
footer.bottom .wrap { display: flex; gap: var(--s-4); flex-wrap: wrap; }
footer.bottom a { color: var(--ink-2); }
.skip { position: absolute; left: -999px; }
.skip:focus { left: var(--s-4); top: var(--s-2); background: var(--surface); padding: var(--s-2) var(--s-3); }
@media (max-width: 40rem) { h1 { font-size: var(--text-xl); } nav.main { margin-left: 0; } }
`;

const NAV = [
  ["/vetrina", "Vetrina"],
  ["/accedi", "Accedi"],
] as const;

export interface PageInput {
  title: string;
  description: string;
  /** il percorso della pagina, per segnare la voce di menu corrente */
  path: string;
  body: string;
}

export function sitePage(input: PageInput): string {
  const nav = NAV.map(
    ([href, label]) => `<a href="${href}"${href === input.path ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("");
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} · UGO</title>
<meta name="description" content="${escapeHtml(input.description)}">
<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">
<style>
${tokensCss({ fontBase: DESIGN_FONT_BASE })}
${BASE_CSS}
${SITE_CSS}
</style>
<script src="/sito/app.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Vai al contenuto</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/">${icon("pig")}UGO</a>
  <nav class="main" aria-label="Sito">${nav}<a class="cta" href="/registrati">Adotta un gosino</a></nav>
</div></header>
<main id="main"><div class="wrap">
${input.body}
</div></main>
<footer class="bottom"><div class="wrap">
  <span>UGO — un compagno che vive in casa</span>
  <a href="/privacy">Privacy</a><a href="/termini">Termini</a><a href="/casa">La mia casa</a>
</div></footer>
</body>
</html>`;
}
