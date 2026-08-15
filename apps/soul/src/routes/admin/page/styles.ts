/**
 * The panel's visual system (ADR-035).
 *
 * Rebuilt from nothing after the owner's verdict on the previous one. Three
 * decisions carry most of the difference:
 *
 * 1. **One typeface, the system sans, everywhere.** The old panel set every
 *    heading in Palatino over a sans body; a display serif next to dense
 *    tabular data reads as a brochure pretending to be an instrument. Hierarchy
 *    now comes from size, weight and colour, which is what actually carries it.
 * 2. **Neutral chrome, clay only where it means something.** Everything used to
 *    be a shade of the brand red — headings, rules, surfaces — so nothing stood
 *    out because everything did. The clay is now reserved for data marks and
 *    the primary action; the rest is warm grey.
 * 3. **No shadows, hairlines instead.** Twelve floating cards down a page is
 *    noise. A flat plane with 1px rules holds far more without getting louder.
 *
 * Spacing is a 4px scale. Data numbers are tabular so columns line up.
 */
export const ADMIN_STYLES = `
  :root {
    color-scheme: light;
    --bg: #f4f2ef; --surface: #fbfaf8; --surface-2: #f1eeea; --raised: #ffffff;
    --line: #e4e0da; --line-strong: #d0cbc2;
    --ink: #1b1a18; --ink-2: #56534d; --ink-3: #8b867d;
    --accent: #7a3030; --accent-soft: #7a303012; --on-accent: #ffffff;
    --data: #a8443c; --data-soft: #a8443c22;
    --good: #0ca30c; --warning: #b07600; --critical: #d03b3b;
    --r: .5rem; --r-lg: .75rem;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #111110; --surface: #1a1a19; --surface-2: #232321; --raised: #1f1f1d;
      --line: #2e2e2b; --line-strong: #3d3c39;
      --ink: #f2f0ec; --ink-2: #b5b0a8; --ink-3: #8a857d;
      --accent: #c4695c; --accent-soft: #c4695c1f; --on-accent: #17100f;
      --data: #c4695c; --data-soft: #c4695c2e;
      --good: #3fbf3f; --warning: #fab219; --critical: #e26a6a;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #111110; --surface: #1a1a19; --surface-2: #232321; --raised: #1f1f1d;
    --line: #2e2e2b; --line-strong: #3d3c39;
    --ink: #f2f0ec; --ink-2: #b5b0a8; --ink-3: #8a857d;
    --accent: #c4695c; --accent-soft: #c4695c1f; --on-accent: #17100f;
    --data: #c4695c; --data-soft: #c4695c2e;
    --good: #3fbf3f; --warning: #fab219; --critical: #e26a6a;
  }

  * { box-sizing: border-box; }
  /* display:grid on .gate and .app beats the [hidden] default, which left
     the door standing open above the panel. Say it once, for everything. */
  [hidden] { display: none !important; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  h1, h2, h3, h4 { font-weight: 600; margin: 0; letter-spacing: -.01em; }
  a { color: inherit; text-decoration: none; }
  main p a, main li a { text-decoration: underline; }
  .num { font-variant-numeric: tabular-nums; }

  /* --- the shell: a fixed rail, and one column of work ------------------- */
  .app { display: grid; grid-template-columns: 15rem minmax(0, 1fr); min-height: 100vh;
         /* the rail is 100vh and sticky, so on a long page its column would
            run out of colour halfway down: paint the column, not the element */
         background: linear-gradient(to right, var(--surface) 15rem, transparent 15rem); }
  @media (max-width: 60rem) { .app { grid-template-columns: 1fr; background: none; } }

  .rail {
    border-right: 1px solid var(--line); background: var(--surface);
    padding: 1.25rem .75rem; position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  @media (max-width: 60rem) {
    .rail { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  }
  .brand { display: flex; align-items: center; gap: .5rem; font-size: .95rem; font-weight: 600;
           padding: 0 .5rem 1rem; letter-spacing: -.01em; }
  .brand span { color: var(--ink-3); font-weight: 400; }
  .rail-group { margin-top: .9rem; }
  .rail-group > small {
    display: block; padding: 0 .55rem .3rem; font-size: .69rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: .09em; color: var(--ink-3);
  }
  .rail a, .rail button.rail-link {
    display: flex; align-items: center; gap: .5rem; width: 100%; text-align: left;
    padding: .4rem .55rem; border-radius: var(--r); text-decoration: none;
    color: var(--ink-2); font-size: .875rem; border: 0; background: none;
    font: inherit; font-size: .875rem; cursor: pointer;
  }
  .rail a:hover, .rail button.rail-link:hover { background: var(--surface-2); color: var(--ink); }
  .rail a[aria-current="page"] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .rail .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--data); flex: 0 0 auto; }
  .rail .rail-note { padding: .35rem .55rem; font-size: .78rem; color: var(--ink-3); }
  /* the room is what a device shows, so the rail names it beside him */
  .rail .rail-where { margin-left: auto; font-size: .72rem; color: var(--ink-3); }

  main { padding: 1.75rem clamp(1rem, 4vw, 2.5rem) 5rem; max-width: 68rem; }

  /* --- page head: who and what, then the work --------------------------- */
  .page-head { margin-bottom: 1.5rem; }
  .eyebrow { font-size: .72rem; font-weight: 600; text-transform: uppercase;
             letter-spacing: .09em; color: var(--ink-3); }
  .page-head h1 { font-size: 1.7rem; line-height: 1.15; margin: .15rem 0 .3rem; }
  .page-head p { margin: 0; color: var(--ink-2); font-size: .95rem; max-width: 46rem; }

  /* --- blocks: hairlines, not shadows ----------------------------------- */
  .block { background: var(--surface); border: 1px solid var(--line);
           border-radius: var(--r-lg); padding: 1.1rem 1.15rem; margin-bottom: 1rem; }
  .block > h2 { font-size: 1rem; }
  .block > h2 + .lede { margin: .2rem 0 1rem; }
  .lede { color: var(--ink-2); font-size: .875rem; margin: 0 0 .8rem; max-width: 46rem; }
  h3 { font-size: .875rem; margin: 1.4rem 0 .35rem; }
  h3:first-child { margin-top: 0; }
  .grid-2 { display: grid; gap: 1rem; }
  @media (min-width: 64rem) { .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }

  /* --- controls ---------------------------------------------------------- */
  label { display: block; margin: 0 0 .2rem; font-size: .72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: .07em; color: var(--ink-3); }
  input, select, textarea, button { font: inherit; }
  input, select, textarea {
    width: 100%; padding: .45rem .6rem; border-radius: var(--r);
    border: 1px solid var(--line-strong); background: var(--raised); color: inherit;
  }
  input:focus-visible, select:focus-visible, button:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  button {
    padding: .45rem .8rem; border-radius: var(--r); cursor: pointer; font-weight: 500;
    background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent);
  }
  button.ghost { background: var(--raised); color: var(--ink); border-color: var(--line-strong); font-weight: 400; }
  button.ghost:hover { border-color: var(--accent); color: var(--accent); }
  button[disabled] { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: end; }
  .row > div { flex: 1 1 9rem; min-width: 0; }
  .row > button { flex: 0 0 auto; }
  .check { display: inline-flex; align-items: center; gap: .35rem; margin: 0;
           text-transform: none; letter-spacing: 0; font-size: .85rem;
           font-weight: 400; color: var(--ink); }
  .check input { width: auto; }

  /* --- messages: they say what happened, in words ------------------------ */
  .msg { margin-top: .6rem; padding: .45rem .65rem; border-radius: var(--r);
         font-size: .85rem; border: 1px solid var(--line); background: var(--surface-2); }
  .msg.ok { color: var(--good); border-color: currentColor; background: transparent; }
  .msg.err { color: var(--critical); border-color: currentColor; background: transparent; }

  /* --- summary before detail --------------------------------------------- */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: .6rem; }
  .tile { background: var(--surface-2); border-radius: var(--r); padding: .7rem .8rem; }
  .tile small { display: block; font-size: .69rem; font-weight: 600; text-transform: uppercase;
                letter-spacing: .08em; color: var(--ink-3); }
  .tile b { display: block; font-size: 1.5rem; line-height: 1.25; font-weight: 600;
            font-variant-numeric: tabular-nums; margin: .1rem 0; }
  .tile span { font-size: .78rem; color: var(--ink-3); }
  .pill { display: inline-flex; align-items: center; gap: .3rem; font-size: .75rem;
          padding: .1rem .5rem; border-radius: 999px; border: 1px solid currentColor; }
  .pill.good { color: var(--good); } .pill.warning { color: var(--warning); }
  .pill.critical { color: var(--critical); }
  .pills { display: flex; gap: .4rem; flex-wrap: wrap; }

  /* --- la piantina degli arredi (ADR-051) ---------------------------------
     Una piantina e non due cursori: «dove sta il cuscino» e' una domanda
     spaziale, e rispondere con due numeri costringe il proprietario a fare la
     conversione in testa e a guardare il chiosco per verificare. Qui la vede.
     Le proporzioni sono quelle del recinto vero (3.4 x 1.7), o quel che si
     trascina qui non e' dove finisce li'. */
  .prop-map { position: relative; margin: .8rem 0; aspect-ratio: 2 / 1;
              background: var(--surface-2); border: 1px solid var(--line);
              border-radius: var(--r); overflow: hidden; touch-action: none; }
  .prop-pig { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
              font-size: 1.6rem; opacity: .5; pointer-events: none; }
  .prop { position: absolute; transform: translate(-50%,-50%); cursor: grab;
          font-size: 1.5rem; line-height: 1; user-select: none;
          padding: .2rem; border-radius: 50%; }
  .prop.on { outline: 2px solid var(--accent); background: var(--surface); }
  .prop:active { cursor: grabbing; }
  .stock-row { display: flex; gap: .6rem; align-items: center; padding: .35rem 0;
               border-bottom: 1px solid var(--line); }
  .stock-row span { flex: 1 1 auto; }
  .stock-row input { width: 5rem; flex: 0 0 auto; }
`;
