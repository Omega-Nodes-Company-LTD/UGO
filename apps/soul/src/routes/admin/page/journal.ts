/**
 * Il giornale e la cronaca (ADR-099): tre viste che il pannello non aveva.
 *
 * Una pagina sola e non tre voci nel menu, perché sono la stessa domanda —
 * «cosa è successo qui?» — guardata da tre lati: chi ha fatto cosa (il
 * registro), cosa ci si è detti (le conversazioni), chi si è visto (gli
 * incontri). Tre blocchi, ognuno col suo «più indietro».
 */
/**
 * La riga di giornale: ora a sinistra, fatto a destra. Monospaziata sull'ora
 * perché una colonna di orari che balla è una colonna che non si scorre.
 */
export const JOURNAL_STYLES = `
  .line { display: flex; gap: .55rem; align-items: baseline; flex-wrap: wrap;
          padding: .35rem 0; border-bottom: 1px solid var(--line); font-size: .93rem; }
  .line:last-child { border-bottom: 0; }
  .line .when { font-variant-numeric: tabular-nums; color: var(--muted);
                font-size: .82rem; min-width: 8.5rem; }
  .line .tag { font-size: .76rem; padding: .06rem .4rem; border-radius: 999px;
               border: 1px solid var(--line); color: var(--muted); }
  .line .tag.ok { color: var(--good); }
  .line .tag.warn { color: var(--critical); }
`;

export const JOURNAL_PAGES = `
<section class="page" data-page="giornale">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Il giornale</h1>
    <p>Cosa è successo in questo account: chi ha fatto cosa, cosa ci si è detti,
       chi si è visto. Si legge e basta — il registro non si corregge (ADR-049).</p>
  </div>

  <div class="block">
    <h2>Chi ha fatto cosa</h2>
    <p class="lede">Solo id, verbi ed esiti: nessun nome e nessun contenuto, ed è
       il punto. Le righe scadono dopo dodici mesi.</p>
    <div id="audit-rows" data-testid="audit-rows"></div>
    <button id="audit-more" class="ghost" data-testid="audit-more" hidden>Più indietro</button>
    <p class="msg" id="audit-msg"></p>
  </div>

  <div class="block">
    <h2>Le conversazioni</h2>
    <p class="lede">Quello che vi siete detti, in chiaro: è tuo, ed è lo stesso
       testo che l'export ti darebbe.</p>
    <div class="row">
      <div><label for="msg-who">Di chi</label><select id="msg-who" data-testid="msg-who"></select></div>
    </div>
    <div id="msg-rows" data-testid="msg-rows"></div>
    <button id="msg-more" class="ghost" data-testid="msg-more" hidden>Più indietro</button>
    <p class="msg" id="msg-msg"></p>
  </div>

  <div class="block">
    <h2>Chi ha visto, e cosa</h2>
    <p class="lede">Gli incontri del riconoscitore e le occhiate alla stanza.
       Mai l'impronta: quella resta cifrata dov'è.</p>
    <div id="perc-rows" data-testid="perc-rows"></div>
    <button id="perc-more" class="ghost" data-testid="perc-more" hidden>Più indietro</button>
    <p class="msg" id="perc-msg"></p>
  </div>
</section>
`;
