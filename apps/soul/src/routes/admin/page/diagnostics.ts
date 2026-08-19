/**
 * La pagina che si apre quando qualcosa non va.
 *
 * Tre domande, in questo ordine — che è l'ordine in cui uno le fa davvero:
 *
 * 1. **quali pezzi rispondono e quali no** (una riga per container, col nome
 *    che si scrive in `docker logs` accanto);
 * 2. **dove se ne va il tempo** quando la risposta tarda: le fasi dell'ultimo
 *    turno, in millisecondi;
 * 3. **quante frasi sono entrate e quante ne sono uscite**, perché «non mi
 *    sente» e «non mi risponde» sono due guasti diversi e per mesi non c'è
 *    stato modo di distinguerli.
 *
 * Ogni riga porta con sé **cosa fare**. Uno strumento di diagnosi che dice
 * solo che sei nei guai è un modo elegante di lasciarti dove eri.
 */
export const DIAGNOSTICS_PAGE = `
<section class="page" data-page="diagnostica">
  <div class="page-head">
    <p class="eyebrow" data-account>&mdash;</p>
    <h1>Diagnostica</h1>
    <p>Tutti i container in una pagina: chi risponde, quanto ci mette, e cosa fare se non va.</p>
  </div>

  <div class="block">
    <h2>Il verdetto</h2>
    <p class="lede">Una riga sola. Se qui &egrave; verde e la creatura sembra lenta lo stesso,
       la risposta sta in <b>Dove se ne va il tempo</b> qui sotto.</p>
    <div class="row" style="align-items:center">
      <p id="diag-verdict" data-testid="diag-verdict" class="verdict">&hellip;</p>
      <button id="diag-refresh" class="ghost" data-testid="diag-refresh">Risonda adesso</button>
    </div>
    <p class="lede" id="diag-soul" data-testid="diag-soul"></p>
    <div id="diag-msg"></div>
  </div>

  <div class="block">
    <h2>I container</h2>
    <p class="lede">Uno per riga. <b>Spento</b> non &egrave; un guasto: &egrave; una funzione che
       nessuno ha configurato, e accanto c'&egrave; il nome della variabile che la accende.
       <b>Lento</b> s&igrave;: &egrave; un pezzo che risponde e ti fa aspettare, ed &egrave;
       quasi sempre l&igrave; che si nasconde il minuto.</p>
    <div id="diag-services" data-testid="diag-services"></div>
  </div>

  <div class="block">
    <h2>Dove se ne va il tempo</h2>
    <p class="lede">Gli ultimi turni, spezzati in fasi. <b>ripescaggio</b> &egrave; quel che
       succede in casa prima di uscire (umore, ricordi, embedding di Ollama);
       <b>modello</b> &egrave; il tempo passato fuori, dal provider; <b>scrittura</b> &egrave;
       la biografia. Un turno senza fasi &egrave; un gesto risolto in casa, che non ha mai
       visto il provider &mdash; e infatti costa niente.</p>
    <div class="row">
      <div class="tile"><small>mediana</small><b id="diag-median" data-testid="diag-median">&mdash;</b><span>degli ultimi turni</span></div>
      <div class="tile"><small>il peggiore</small><b id="diag-slowest" data-testid="diag-slowest">&mdash;</b><span>fra quelli tenuti</span></div>
    </div>
    <div id="diag-turns" data-testid="diag-turns"></div>
  </div>

  <div class="block">
    <h2>Quante frasi ha sentito</h2>
    <p class="lede">Da quando soul &egrave; acceso. <b>sentite</b> sono le frasi arrivate dal
       muso: se parli venti volte e qui ne conta tre, le altre diciassette non sono mai
       arrivate &mdash; e allora il guasto &egrave; nel dispositivo (microfono, cancello degli
       enunciati, rete), non qui dentro. Se invece le conta tutte e <b>risposte</b> &egrave;
       molto pi&ugrave; basso, muoiono in casa e la riga rossa qui sopra dice dove.</p>
    <div id="diag-counters" data-testid="diag-counters"></div>
  </div>
</section>`;

/** Lo stile della pagina: la forma dice quanto il colore, e prima di lui. */
export const DIAGNOSTICS_STYLES = `
  .verdict { font-size: 1.25rem; font-weight: 650; margin: 0; flex: 1 1 auto; }
  .diag-row { display: grid; grid-template-columns: auto 1fr auto; gap: .1rem .7rem;
              align-items: baseline; padding: .7rem 0; border-bottom: 1px solid var(--line); }
  .diag-row:last-child { border-bottom: 0; }
  .diag-mark { font-size: 1.1rem; line-height: 1; }
  .diag-name { font-weight: 600; }
  .diag-name code { margin-left: .4rem; }
  .diag-ms { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink-2); }
  .diag-what, .diag-why, .diag-hint, .diag-detail {
    grid-column: 2 / -1; font-size: .82rem; color: var(--ink-3); margin: .15rem 0 0; }
  .diag-hint { color: var(--ink-2); }
  .diag-bar { display: flex; height: .55rem; border-radius: .3rem; overflow: hidden;
              background: var(--surface-2); margin: .3rem 0; }
  .diag-bar span { display: block; height: 100%; }
  .diag-turn { padding: .5rem 0; border-bottom: 1px solid var(--line); font-size: .85rem; }
  .diag-turn:last-child { border-bottom: 0; }
  .diag-legend { font-size: .78rem; color: var(--ink-3); display: flex; gap: .8rem; flex-wrap: wrap; }
`;
