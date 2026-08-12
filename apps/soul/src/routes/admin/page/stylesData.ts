/**
 * Styles for the things that carry data: meters, charts, small multiples,
 * ranked bars, the pack cards, the journal, the council transcript.
 *
 * Kept apart from the shell (ADR-035) so neither file grows past what a person
 * reads in one sitting, and so a change to a chart never touches the layout.
 */
export const ADMIN_DATA_STYLES = `
  /* --- the psyche, as magnitudes with their resting points --------------- */
  .var { display: grid; grid-template-columns: 5rem minmax(0, 1fr) 2.4rem;
         align-items: center; gap: .55rem; margin: .3rem 0; }
  .var .name { font-size: .82rem; color: var(--ink-2); }
  .var .val { font-size: .8rem; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-2); }
  .meter { position: relative; display: block; height: 8px; background: var(--surface-2);
           border-radius: 4px; overflow: visible; }
  .meter > i { display: block; height: 100%; background: var(--data); border-radius: 4px; }
  .meter .baseline { position: absolute; top: -3px; width: 1px; height: 14px;
                     background: var(--ink-3); opacity: .6; }
  /* the causes sit in the bar's own column, so the eye reads "this bar, for these reasons" */
  .why { grid-column: 2 / 4; font-size: .74rem; color: var(--ink-3); margin: -.05rem 0 .3rem; }
  .why b { font-weight: 600; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .why .rest { opacity: .75; }

  /* --- charts ------------------------------------------------------------ */
  .plot { position: relative; margin-top: .3rem; }
  .plot-title { margin: 1rem 0 0; font-size: .8rem; color: var(--ink-3); }
  .plot-title b { color: var(--ink); font-weight: 600; }
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .chart .grid { stroke: var(--line); stroke-width: 1; }
  /* axis labels are the difference between a picture and an instrument */
  .chart .tick { fill: var(--ink-3); font-size: 10px; font-variant-numeric: tabular-nums; }
  .chart .area { fill: var(--data-soft); }
  .chart .line { fill: none; stroke: var(--data); stroke-width: 2;
                 stroke-linejoin: round; stroke-linecap: round; }
  .chart .endpoint, .chart .cursor { fill: var(--data); stroke: var(--surface); stroke-width: 2; }
  .chart .crosshair { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 3 3; }
  .chart .bar { fill: var(--data); }
  .chart .bar.over { fill: var(--critical); }
  .chart .reference { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 4 4; }
  .tip { position: absolute; top: 0; background: var(--ink); color: var(--bg); font-size: .75rem;
         padding: .2rem .45rem; border-radius: .3rem; pointer-events: none; white-space: nowrap; }
  .empty { color: var(--ink-3); font-size: .875rem; margin: .5rem 0; }
  /* a caveat that travels with a drawn chart, not instead of one */
  .note { color: var(--ink-3); font-size: .78rem; margin: .35rem 0 0; }

  /* --- small multiples: six shapes, one colour, no legend ---------------- */
  .sparks { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
            gap: .45rem; margin-top: .5rem; }
  .spark-card { display: block; width: 100%; text-align: left; padding: .45rem .55rem .25rem;
                background: var(--surface-2); border: 1px solid transparent;
                border-radius: var(--r); color: var(--ink); font-weight: 400; }
  .spark-card:hover { border-color: var(--line-strong); }
  .spark-card[aria-pressed="true"] { border-color: var(--data); background: var(--data-soft); }
  .spark-card small { display: block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
                      letter-spacing: .07em; color: var(--ink-3); }
  .spark-card b { display: block; font-size: 1.05rem; line-height: 1.3;
                  font-variant-numeric: tabular-nums; }
  .spark { display: block; width: 100%; height: 30px; }
  .spark-line { fill: none; stroke: var(--data); stroke-width: 1.5; stroke-linejoin: round; }
  .spark-area { fill: var(--data-soft); }
  .spark-end { fill: var(--data); }
  .spark-empty { color: var(--ink-3); font-size: .8rem; }

  /* --- ranked horizontal bars: the labels are words, so they lie flat ---- */
  /* capped: a count of two does not deserve a bar the width of the page */
  .hbar { display: grid; grid-template-columns: 8.5rem minmax(0, 18rem) 1.8rem;
          align-items: center; gap: .55rem; margin: .28rem 0; font-size: .82rem; }
  .hbar-name { color: var(--ink-2); }
  .hbar-track { display: block; height: 8px; background: var(--surface-2); border-radius: 4px; }
  .hbar-track > i { display: block; height: 100%; background: var(--data); border-radius: 4px; }
  .hbar-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-3); }

  /* --- the pack ----------------------------------------------------------- */
  .pack { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: .7rem; }
  .being { background: var(--surface-2); border-radius: var(--r); padding: .75rem .85rem; }
  .being h4 { margin: 0; font-size: .95rem; }
  .being .species { font-size: .76rem; color: var(--ink-3); margin-bottom: .5rem; }
  .being .bond { display: grid; gap: .3rem; margin-bottom: .5rem; }
  .being .bond > div { display: grid; grid-template-columns: 5rem 1fr; align-items: center; gap: .5rem; }
  .being .bond span { font-size: .74rem; color: var(--ink-3); }
  .being .guards { display: flex; flex-wrap: wrap; gap: .5rem .9rem; }
  .flags { font-size: .8rem; color: var(--ink-2); }

  /* --- what he started himself, and the council -------------------------- */
  .deed { background: var(--surface-2); border-radius: var(--r); padding: .55rem .75rem; margin: .35rem 0; }
  .deed .when { font-size: .72rem; color: var(--ink-3); float: right; }
  .deed .act { font-weight: 600; font-size: .875rem; display: flex; align-items: center; gap: .5rem; }
  /* «disfa» sta in fondo alla riga: è l'azione distruttiva, non il titolo */
  .deed .act .room-del { margin-left: auto; font-size: .72rem; padding: .15rem .5rem; }
  .deed .deed-act { font-weight: 400; color: var(--ink-2); }
  .deed .because { font-size: .82rem; color: var(--ink-2); font-style: italic; }
  .voice { background: var(--surface-2); border-radius: var(--r); padding: .7rem .85rem; margin: .45rem 0; }
  .voice h4 { margin: 0 0 .25rem; font-size: .9rem; }
  .voice .said { margin: .15rem 0; font-size: .9rem; }
  .voice .again { margin: .4rem 0 0; padding-left: .65rem; border-left: 2px solid var(--data); font-size: .9rem; }

  /* --- tables and lists --------------------------------------------------- */
  details.table { margin-top: .6rem; }
  details.table summary { cursor: pointer; color: var(--ink-3); font-size: .8rem; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; margin-top: .5rem;
          font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: .3rem .4rem; border-bottom: 1px solid var(--line); }
  th { color: var(--ink-3); font-weight: 600; font-size: .74rem;
       text-transform: uppercase; letter-spacing: .06em; }
  .list-row { display: flex; justify-content: space-between; align-items: center; gap: .6rem;
              padding: .4rem 0; border-bottom: 1px solid var(--line); font-size: .875rem; }
  .list-row:last-child { border-bottom: 0; }

  /* --- the memory graph ---------------------------------------------------- */
  .graph { width: 100%; height: auto; background: var(--surface-2); border-radius: var(--r); }
  .graph .edge { stroke: var(--line-strong); stroke-width: 1; }
  .graph .edge.replaced { stroke-dasharray: 4 3; }
  .graph .node-being { fill: var(--data); }
  .graph .node-memory { fill: var(--data-soft); stroke: var(--data); stroke-width: 1.5; }
  .graph .node-memory.retired { fill: var(--surface); }
  .graph text { fill: var(--ink-2); font-size: 9px; }
`;
