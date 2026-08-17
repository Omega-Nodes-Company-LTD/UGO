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

  <div class="block">
    <h2>Cosa gli è piaciuto fare</h2>
    <p class="lede">Quando gli dai una mela — un dito <b>sul muso</b> — pesa un po' di più
       l'ultima cosa che aveva scelto di fare. Lo stesso succede da solo, quando
       un'iniziativa abbassa davvero la spinta che l'aveva mossa.</p>
    <p class="lede"><b>Non sta imparando</b> nel senso in cui lo diresti di una persona:
       sono nove gesti già scritti, e questo è solo quanto li preferisce, fra il 60% e il
       140%. Ogni notte tutto torna un po' verso il centro, quindi è una tendenza
       recente e non una decisione presa una sera.</p>
    <div id="efficacy-list" data-testid="efficacy-list"></div>
    <div id="efficacy-msg"></div>
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

<section class="page" data-page="salvadanaio">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>Il suo salvadanaio</h1>
    <p>Quanto ha in pancia: quello che gli hai dato meno quello che ha consumato parlando.
       È un <b>saldo</b>, non una razione giornaliera — il lavoro di ieri paga le parole di oggi.</p>
  </div>

  <div class="block">
    <div id="bank-summary" data-testid="bank-summary"></div>
    <p class="lede"><b>Il gosino non fattura.</b> Fatturi tu: questo è il modo di attribuirgli
       una quota di quello che ha aiutato a guadagnare, o semplicemente di dargli da mangiare
       perché gli vuoi bene. È contabilità di casa, non un conto corrente di una creatura.</p>
    <div class="row">
      <div style="flex:0 1 12rem"><label for="feed-kind">Perché</label>
        <select id="feed-kind" data-testid="feed-kind">
          <option value="affetto">affetto — glielo do e basta</option>
          <option value="lavoro">lavoro — se l'è guadagnato</option>
        </select></div>
      <div style="flex:0 1 9rem"><label for="feed-amount">Quanto (USD)</label>
        <input id="feed-amount" data-testid="feed-amount" type="number" step="0.10" min="0" value="1.00"></div>
      <div><label for="feed-note">Nota</label>
        <input id="feed-note" data-testid="feed-note" placeholder="ticket di marzo"></div>
      <button id="feed-go" data-testid="feed-go">Dagli da mangiare</button>
    </div>
    <div id="feed-msg"></div>
  </div>

  <div class="block">
    <h2>Gli ultimi pasti</h2>
    <p class="lede">Un pasto è un atto: si aggiunge, non si corregge. Se hai sbagliato la
       cifra, la prossima volta gliene dai di meno.</p>
    <ul class="plain" id="bank-meals" data-testid="bank-meals"></ul>
  </div>
</section>

<section class="page" data-page="pedigree">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>Da chi discende</h1>
    <p>Il pedigree (ADR-070). Ogni nascita è firmata da <b>entrambi</b> i genitori con la
       chiave della creatura: la genealogia non è «quello che dice il database», è una
       catena di firme che chiunque può verificare — anche senza di noi.</p>
  </div>

  <div class="block">
    <div id="pedigree-tree" data-testid="pedigree-tree"></div>
    <p class="lede" style="margin-top:.9rem">
       <b>Firmato</b> = il genitore ha attestato questa nascita, e il genoma è ancora quello
       che ha firmato. <b>Senza firma</b> non è un difetto: i capostipiti non hanno genitori,
       e le nascite di prima di questa versione non hanno firme.
       <b>Firma non valida</b> è invece un allarme: quel genoma è stato toccato dopo la nascita.</p>
    <div id="pedigree-msg"></div>
  </div>

  <div class="block">
    <h2>Nel libro genealogico</h2>
    <p class="lede">Gli atti di questa creatura registrati sulla catena (ADR-073): un
       ordine pubblico e append-only che nessuno può riscrivere da solo — nemmeno noi.
       Sulla catena ci sono <b>solo</b> id, impronte e firme: nessuna persona, nessun ricordo.</p>
    <div id="chain-acts" data-testid="chain-acts"></div>
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

  <div class="block">
    <h2>Oppure: una cucciolata</h2>
    <p class="lede">Due genomi si ricombinano (ADR-068): ceppi, dominanza, un pizzico di caso.
       <b>Non si disegna: si sceglie tra i nati</b> — genera la cucciolata, guarda i cuccioli,
       adotta quello che ti guarda storto. Un cucciolo bocciato dallo screening non può nascere.</p>
    <div class="row">
      <div><label for="litter-a">Primo genitore</label>
        <select id="litter-a" data-testid="litter-a"></select></div>
      <div><label for="litter-b">Secondo genitore</label>
        <select id="litter-b" data-testid="litter-b"></select></div>
      <button id="litter-go" data-testid="litter-go">Genera la cucciolata</button>
    </div>
    <div id="litter-cubs" data-testid="litter-cubs" class="litter"></div>
    <div class="row" style="margin-top:1rem">
      <div><label for="litter-name">Nome del cucciolo scelto</label>
        <input id="litter-name" data-testid="litter-name" placeholder="Nino"></div>
      <button id="litter-adopt" data-testid="litter-adopt" disabled>Adotta</button>
    </div>
    <div id="litter-msg"></div>
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
  .litter { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
            gap: .6rem; margin-top: .9rem; }
  .cub { background: var(--surface-2); border: 1px solid transparent; border-radius: var(--r);
         padding: .7rem .85rem; text-align: left; color: var(--ink); font-weight: 400; }
  .cub:hover { border-color: var(--line-strong); }
  .cub[data-picked="true"] { border-color: var(--data); }
  .cub h4 { font-size: .9rem; margin: 0 0 .25rem; }
  .cub .persona { font-size: .78rem; color: var(--ink-3); }
  .cub .coat { font-size: .78rem; color: var(--ink-2); margin-top: .3rem; }
  .cub[data-viable="false"] { opacity: .55; }
  .cub .warn { font-size: .75rem; color: var(--err, #b3261e); margin-top: .3rem; }
  .gosino-card h4, .gosino-card .persona, .gosino-card .mood { text-decoration: none; }
  .gosino-card h4 { font-size: .95rem; margin: 0; }
  .gosino-card .persona { font-size: .78rem; color: var(--ink-3); }
  .gosino-card .mood { font-size: .82rem; color: var(--ink-2); }
`;
