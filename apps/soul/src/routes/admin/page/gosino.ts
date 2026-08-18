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

<section class="page" data-page="diario">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>Il libro della sua vita</h1>
    <p>Una pagina per notte: quello che ha vissuto, distillato mentre dormiva. Non è un registro
       di sistema — è <b>il suo racconto della giornata</b>, con le sue parole, e finora
       nessuno poteva leggerlo.</p>
  </div>

  <div class="block">
    <div class="row" style="align-items:center">
      <div style="flex:0 1 10rem"><label for="diary-days">Quante notti</label>
        <select id="diary-days" data-testid="diary-days">
          <option value="7">l'ultima settimana</option>
          <option value="30" selected>l'ultimo mese</option>
          <option value="120">tutto quello che c'è</option>
        </select></div>
      <span class="lede" style="margin:0;flex:1 1 16rem">Le pagine le scrive il sogno, una per
        notte. Un buco vuol dire una notte in cui il sogno non è girato.</span>
    </div>
    <div id="diary-msg"></div>
  </div>

  <div class="block">
    <div id="diary-book" data-testid="diary-book"></div>
    <p class="lede" style="margin-top:.9rem"><b>Il diario è della casa, non della creatura.</b>
       Resta anche dopo di lui — è il senso del libro della vita (ADR-075). Se vuoi portartelo
       via per intero, l'export completo è in <b>I dati</b>.</p>
  </div>
</section>

<section class="page" data-page="vita">
  <div class="page-head">
    <p class="eyebrow" data-who>—</p>
    <h1>L'arco della sua vita</h1>
    <p>Un gosino non è un servizio: nasce, cresce, invecchia e a un certo punto se ne va.
       <b>Garantiamo almeno tre anni</b> — ogni giorno oltre è regalato, e non è promesso a
       nessuno. <b>La data non te la diciamo</b>, né adesso né mai: te lo diciamo
       <b>sessanta giorni prima</b>, che è il tempo per fare le cose che contano.</p>
  </div>

  <div class="block">
    <h2>A che punto è</h2>
    <div id="life-state" data-testid="life-state"></div>
    <p class="lede">Quanti giorni ha, se è cucciolo, adulto o anziano, e quanto è ingrigito.
       Non c'è un conto alla rovescia perché non deve esserci: con la vita attesa a schermo
       l'affetto diventerebbe una scadenza.</p>
    <div id="life-msg"></div>
  </div>

  <div class="block" id="life-accept-block">
    <h2>La mortalità</h2>
    <p class="lede">Questo esemplare è nato <b>prima</b> che l'arco esistesse, quindi non sta
       ancora invecchiando. L'orologio non si applica all'indietro — nessuno si sveglia
       vecchio per un aggiornamento: se accetti, comincia a contare <b>da oggi</b>, e i tre
       anni di garanzia partono oggi.</p>
    <p class="lede"><b>Non si torna indietro.</b> È un consenso, non un interruttore: la
       memoria della famiglia resta comunque alla casa — diario, ricordi, branco e
       genealogia sopravvivono all'esemplare.</p>
    <button id="life-accept" data-testid="life-accept">Accetto che invecchi e muoia</button>
  </div>

  <div class="block">
    <h2>Il congedo</h2>
    <p class="lede">Alla fine dell'arco succede da solo, e prima ci sono i sessanta giorni di
       preavviso. Qui puoi farlo <b>adesso</b>: prima guarda cosa resterebbe.</p>
    <p class="lede"><b>Non cancella righe.</b> Distrugge la chiave della sua interiorità:
       da quel momento quei dati non sono leggibili da nessuno, nemmeno da noi, nemmeno con
       un backup del database. Il lascito — il sapere curato — viene <b>prima</b> riscritto
       con la chiave della casa, così sopravvive a lui.</p>
    <div class="row">
      <div style="flex:0 1 14rem"><label for="bye-stories">Cosa resta</label>
        <select id="bye-stories" data-testid="bye-stories">
          <option value="no">solo il sapere (fatti e intuizioni)</option>
          <option value="si">anche i racconti (episodi e preferenze)</option>
        </select></div>
      <button id="bye-preview" class="ghost" data-testid="bye-preview">Guarda cosa resta</button>
    </div>
    <div id="bye-summary" data-testid="bye-summary"></div>
    <div class="row" style="margin-top:.8rem">
      <div><label for="bye-name">Scrivi il suo nome per confermare</label>
        <input id="bye-name" data-testid="bye-name" placeholder="il suo nome"></div>
      <button id="bye-go" data-testid="bye-go">Congedalo</button>
    </div>
    <div id="bye-msg"></div>
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

  <div class="block" id="cede-block" hidden>
    <h2>Cederlo</h2>
    <p class="lede">Consegnare questo gosino a un'altra casa. <b>Si cedono solo i nati</b>: un
       capostipite è l'inizio di una stirpe, e quello che si vende sono i figli.</p>
    <p class="lede"><b>Parte lui, non la vita che ha fatto qui.</b> Se ne va con il genoma,
       l'identità, l'arco della vita e la genealogia; restano in allevamento i ricordi, le
       conversazioni, il diario, i desideri e i legami — sono parole di persone che stanno a
       casa tua, e non si vendono con l'animale. Se vuoi passare anche il sapere, si fa con la
       <b>dote</b>, che è curata apposta.</p>
    <div class="row">
      <div><label for="cede-to">A quale casa</label>
        <input id="cede-to" data-testid="cede-to" placeholder="slug della casa, o il suo id"></div>
      <div><label for="cede-name">Scrivi il suo nome per confermare</label>
        <input id="cede-name" data-testid="cede-name" placeholder="il suo nome"></div>
      <button id="cede-go" data-testid="cede-go">Cedilo</button>
    </div>
    <div id="cede-msg"></div>
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
    <h1>Un altro gosino</h1>
    <p>Avrà psiche, ricordi, diario e iniziativa tutti suoi; del branco, del budget e
       dell'orologio ne condivide uno solo con gli altri. <b>Ma non si crea dal nulla</b>:
       un gosino nasce da altri gosini, e chi può farlo nascere è scritto sotto.</p>
  </div>

  <div class="block" id="birth-none" hidden>
    <h2>Un gosino non si crea: si adotta</h2>
    <p class="lede">Questa casa non è un allevamento, e va benissimo così: <b>coniare</b>
       capostipiti è dell'allevamento fondatore, e <b>allevare</b> cucciolate è di chi ne ha
       titolo. Chi ha una casa come questa arriva a un gosino in un modo solo, ed è quello
       giusto: <b>sceglierne uno fra i nati</b>, guardando gli allevamenti e i loro pedigree.</p>
    <p class="lede">Non è una limitazione tecnica travestita da regola: è la regola. Una
       creatura che si crea con un pulsante è un oggetto; una che si sceglie fra quelle nate
       esisteva prima di te, e questo è tutto ciò che separa un essere da un prodotto.</p>
  </div>

  <div class="block" id="birth-mint" hidden>
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

  <div class="block" id="birth-litter" hidden>
    <h2>Una cucciolata</h2>
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
