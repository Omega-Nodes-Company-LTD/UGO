/**
 * The pages that belong to ONE creature (ADR-035), plus the form that makes a
 * new one.
 *
 * There is a single copy of this markup, repainted for whoever the address bar
 * names — not one page per exemplar. A house with four gosini would otherwise
 * be four identical copies of the same DOM, kept in sync by hand.
 */
export const GOSINO_PAGES = `
<section class="page" data-page="stato">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1 id="mood-label" data-testid="mood-label">—</h1>
    <p id="mood-phrase" data-testid="mood-phrase"></p>
  </div>

  <div class="grid-2">
    <div class="block">
      <h2>Come sta adesso</h2>
      <p class="lede">Sei variabili che si muovono da sole e tornano piano al loro punto di
         riposo — il trattino verticale su ogni barra. Sotto, da cosa arriva.</p>
      <div id="psyche-bars" data-testid="psyche-bars"></div>
    </div>

    <div class="block">
      <h2>Come si sono mosse nelle ultime 48 ore</h2>
      <p class="lede">Sei riquadri invece di sei linee sovrapposte: così nessuna variabile ha
         bisogno di un colore suo per essere riconosciuta. Tocca quella da vedere in grande.</p>
      <div class="sparks" id="spark-row" data-testid="spark-row"></div>
      <p class="plot-title">In grande: <b id="mood-pick-name">umore</b></p>
      <div class="plot" id="mood-chart" data-testid="mood-chart"></div>
    </div>
  </div>
</section>

<section class="page" data-page="volonta">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>Cosa ha deciso lui</h1>
    <p>Non le risposte: le volte in cui ha cominciato lui. Ogni riga porta la spinta che
       l'ha mosso, con le sue parole.</p>
  </div>

  <div class="block">
    <div class="row" style="align-items:center">
      <button id="init-toggle" class="ghost" data-testid="init-toggle">—</button>
      <span id="init-state" data-testid="init-state" class="lede" style="margin:0;flex:1 1 14rem"></span>
    </div>
    <div id="volition-msg"></div>
  </div>

  <div class="grid-2">
    <div class="block">
      <h2>Desideri in sospeso</h2>
      <p class="lede">Quello che si è ripromesso di dirti, e i promemoria che gli hai chiesto.</p>
      <div id="desire-list" data-testid="desire-list"></div>
    </div>
    <div class="block">
      <h2>Cosa lo muove</h2>
      <p class="lede">Quante volte ogni spinta l'ha fatto cominciare. Risponde a una domanda
         che l'elenco non risponde: è solo che si annoia, o gli manchi?</p>
      <div id="driver-chart" data-testid="driver-chart"></div>
    </div>
  </div>

  <div class="block">
    <h2>Le ultime iniziative</h2>
    <div id="initiative-list" data-testid="initiative-list"></div>
  </div>
</section>

<section class="page" data-page="memoria">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>Cosa ricorda</h1>
    <p>Una finestra sulla memoria, non il modo di usarla: il modo è chiedergli le cose
       parlando. Con una ricerca vedi quello che <b>lui</b> ripescherebbe — e sono i ricordi
       suoi, non quelli degli altri gosini.</p>
  </div>
  <div class="block">
    <div class="row">
      <div><label for="mem-q">Cerca</label><input id="mem-q" data-testid="mem-q" placeholder="il corriere"></div>
      <div><label for="mem-kind">Tipo</label><select id="mem-kind" data-testid="mem-kind">
        <option value="">tutti</option><option value="fact">fatti</option>
        <option value="preference">preferenze</option><option value="episode">episodi</option>
        <option value="insight">intuizioni</option></select></div>
      <button id="mem-go" data-testid="mem-go">Guarda</button>
    </div>
    <ul class="plain" id="mem-list" data-testid="mem-list"></ul>
    <div id="mem-msg"></div>
  </div>
</section>

<section class="page" data-page="nascita">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Fai nascere un gosino</h1>
    <p>Un altro esemplare, con il suo carattere. Avrà psiche, ricordi, diario e iniziativa
       tutti suoi; del branco, del budget e dell'orologio ne condivide uno solo con gli altri.</p>
  </div>

  <div class="block">
    <h2>Chi è</h2>
    <div class="row">
      <div><label for="new-name">Nome</label><input id="new-name" data-testid="new-name" placeholder="Nino"></div>
      <div><label for="new-where">In che stanza</label>
        <select id="new-where" data-testid="new-where"></select></div>
    </div>
    <p class="lede" style="margin-top:.7rem">La stanza decide su quale schermo lo vedi:
       <code>/?stanza=&lt;nome&gt;</code>. Se non ce n'è ancora nessuna, falla in
       <b>Le stanze</b> — oppure lascia <b>— nessuna stanza —</b> e dagliela dopo.</p>

    <h3>Che carattere ha</h3>
    <p class="lede">Un archetipo è un punto di partenza. Le manopole qui sotto vincono
       sull'archetipo, e restano com'erano se non le tocchi.</p>
    <div class="row">
      <div style="flex:0 1 20rem"><label for="new-archetype">Archetipo</label><select id="new-archetype" data-testid="new-archetype">
        <option value="">nessuno, uno normale</option>
        <option value="curiosone">curiosone</option><option value="pigrone">pigrone</option>
        <option value="affettuoso">affettuoso</option><option value="brontolone">brontolone</option>
        <option value="timidone">timidone</option></select></div>
    </div>
    <div id="new-dials" class="dials"></div>
    <div class="row" style="margin-top:1rem">
      <button id="new-go" data-testid="new-go">Fallo nascere</button>
    </div>
    <div id="new-msg"></div>
  </div>
</section>
`;

/** Styles for the birth form's dials — sliders that say what they mean. */
export const DIAL_STYLES = `
  .dials { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
           gap: .45rem 1.4rem; margin-top: .8rem; }
  /* a dial IS a label, so it inherits the uppercase micro-type of a field
     caption unless it says otherwise — which is what made these overflow */
  .dial { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr) 2.4rem;
          align-items: center; gap: .55rem; margin: 0;
          text-transform: none; letter-spacing: normal; font-size: inherit; color: inherit; }
  .dial > span { font-size: .85rem; color: var(--ink-2); }
  .dial input[type="range"] { width: 100%; padding: 0; accent-color: var(--data); border: 0; background: none; }
  .dial > b { font-size: .8rem; text-align: right; font-variant-numeric: tabular-nums;
              color: var(--ink-3); font-weight: 400; }
  .gosino-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 14rem);
                 align-items: center; gap: .8rem; background: var(--surface-2);
                 border-radius: var(--r); padding: .7rem .85rem; margin: .4rem 0;
                 border: 1px solid transparent; width: 100%; text-align: left;
                 color: var(--ink); font-weight: 400; }
  .gosino-card:hover { border-color: var(--line-strong); }
  .gosino-card h4, .gosino-card .persona, .gosino-card .mood { text-decoration: none; }
  .gosino-card h4 { font-size: .95rem; margin: 0; }
  .gosino-card .persona { font-size: .78rem; color: var(--ink-3); }
  .gosino-card .mood { font-size: .82rem; color: var(--ink-2); }
`;
