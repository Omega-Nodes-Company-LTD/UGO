/**
 * Il secondo strato del pannello (revisione UI del 2026-10-04): quello che
 * stava scritto a mano nelle pagine, e quello che mancava del tutto.
 *
 * - **Classi, non `style="…"`**: 81 stili sparsi nelle pagine sono diventati
 *   le classi qui sotto, così la CSP non deve ammettere stili in linea e una
 *   spaziatura si cambia in un posto solo. Le larghezze calcolate (barre,
 *   metri) viaggiano in `data-w`/`data-x` e le applica lo script.
 * - **Il telefono**: il menu diventa un cassetto, con una barra in alto che dice
 *   dove sei. Prima il menu occupava lo schermo e il contenuto finiva sotto.
 * - **Lo stato delle cose**: un pulsante che sta lavorando lo dice, una pagina
 *   che carica lo dice, un campo sbagliato lo dice — dopo che l'hai toccato.
 */
export const ADMIN_UI_STYLES = `
  /* --- utilità (sostituiscono gli stili in linea) ------------------------- */
  .mt-2 { margin-top: .5rem; } .mt-3 { margin-top: .75rem; } .mt-4 { margin-top: 1rem; }
  .my-3 { margin: .75rem 0; } .m-0 { margin: 0; }
  .center { align-items: center; } .gap-sm { gap: .4rem; }
  .clickable { cursor: pointer; } .full { width: 100%; } .indent { padding-left: 1.6rem; }
  .span-rest { grid-column: 2 / -1; }
  .row > .w-7 { flex: 0 1 7rem; } .row > .w-8 { flex: 0 1 8rem; } .row > .w-9 { flex: 0 1 9rem; }
  .row > .w-10 { flex: 0 1 10rem; } .row > .w-12 { flex: 0 1 12rem; } .row > .w-14 { flex: 0 1 14rem; }
  .row > .w-16 { flex: 0 1 16rem; } .row > .w-20 { flex: 0 1 20rem; }
  .row > .f-9 { flex: 1 1 9rem; } .row > .f-12 { flex: 1 1 12rem; } .row > .f-14 { flex: 1 1 14rem; }
  .row > .f-16 { flex: 1 1 16rem; } .row > .f-22 { flex: 1 1 22rem; }
  .row > .f2-12 { flex: 2 1 12rem; } .row > .f2-16 { flex: 2 1 16rem; }
  .f-14 { flex: 1 1 14rem; } .f-16 { flex: 1 1 16rem; }
  .diag-bar .stage-0 { background: var(--accent); }
  .diag-bar .stage-1 { background: var(--warning); }
  .diag-bar .stage-2 { background: var(--ink-3); }

  /* --- un link che fa da pulsante ---------------------------------------- */
  a.btn { display: inline-flex; align-items: center; gap: .4rem; padding: .45rem .8rem;
          border-radius: var(--r); background: var(--accent); color: var(--on-accent);
          font-weight: 500; text-decoration: none; white-space: nowrap; }
  a.btn:hover { filter: brightness(1.06); }
  .nudge { display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap; }

  /* --- il fuoco si vede sempre, anche sui link --------------------------- */
  a:focus-visible, summary:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r);
  }

  /* --- un pulsante che lavora lo dice (e non si preme due volte) --------- */
  button[aria-busy="true"] { position: relative; color: transparent !important; pointer-events: none; }
  button[aria-busy="true"]::after {
    content: ""; position: absolute; inset: 0; margin: auto; width: 1rem; height: 1rem;
    border-radius: 50%; border: 2px solid var(--on-accent); border-right-color: transparent;
    animation: ugo-spin .7s linear infinite;
  }
  button.ghost[aria-busy="true"]::after { border-color: var(--accent); border-right-color: transparent; }
  @keyframes ugo-spin { to { transform: rotate(360deg); } }

  /* --- una pagina che carica: una riga che scorre, non un vuoto ---------- */
  main { position: relative; }
  main[aria-busy="true"]::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    background-size: 40% 100%; background-repeat: no-repeat;
    animation: ugo-slide 1.1s ease-in-out infinite;
  }
  @keyframes ugo-slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  .empty { color: var(--ink-3); font-size: .875rem; padding: .6rem 0; }

  /* --- un campo sbagliato si segna dopo che l'hai toccato, non prima ----- */
  input:user-invalid, select:user-invalid, textarea:user-invalid { border-color: var(--critical); }
  .msg { display: flex; gap: .5rem; align-items: flex-start; }
  .msg.err::before { content: "!"; font-weight: 700; }

  /* --- il telefono: la barra in alto e il cassetto ----------------------- */
  .topbar, .scrim { display: none; }
  @media (max-width: 60rem) {
    .topbar { display: flex; align-items: center; gap: .75rem; position: sticky; top: 0; z-index: 20;
              padding: .6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--line); }
    .menu-btn { display: inline-flex; align-items: center; gap: .4rem; min-height: 2.75rem; }
    .topbar-page { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rail { position: fixed; top: 0; left: 0; bottom: 0; z-index: 40; width: min(19rem, 86vw);
            height: 100dvh; border-right: 1px solid var(--line); border-bottom: 0;
            transform: translateX(-102%); transition: transform .2s ease; }
    .app.menu-open .rail { transform: none; box-shadow: 0 0 2rem rgb(0 0 0 / .25); }
    .scrim { position: fixed; inset: 0; z-index: 30; background: rgb(0 0 0 / .35); }
    .app.menu-open .scrim { display: block; }
    /* il dito non è un puntatore: i bersagli crescono */
    button, a.btn, .rail a, .rail button.rail-link { min-height: 2.75rem; }
    input, select, textarea { min-height: 2.75rem; font-size: 16px; }
    .row > div, .row > [class*="w-"], .row > [class*="f-"] { flex: 1 1 100%; }
    .row > button { flex: 1 1 auto; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
`;
