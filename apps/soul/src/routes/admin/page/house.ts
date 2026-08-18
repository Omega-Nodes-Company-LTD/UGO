/**
 * The pages that belong to the HOUSE, not to any one creature (ADR-035).
 *
 * The split is not cosmetic. The pack, the budget, the data and the clock
 * belong to the household (ADR-019): two gosini under one roof must agree
 * about who lives here and share one purse. Everything on these pages would be
 * a lie if it were shown per exemplar.
 */
export const HOUSE_PAGES = `
<section class="page" data-page="casa">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Sommario</h1>
    <p>Chi ci vive, quanto è costata la giornata, e se la macchina sotto sta rispondendo.</p>
  </div>

  <div class="block">
    <h2>I gosini</h2>
    <p class="lede">Ognuno con il suo umore. Clicca un nome per entrare nel suo.</p>
    <div id="gosini-cards" data-testid="gosini-cards"></div>
  </div>

  <div class="block">
    <h2>Dove sta questa casa</h2>
    <p class="lede">Serve al cielo del recinto: il tempo che fa lo prende da qui. Scrivi il
       paese o la citt&agrave; e scegli dalla lista &mdash; le coordinate le trova lui, e restano
       di <em>questa</em> casa: due famiglie sullo stesso server hanno due cieli.</p>
    <div class="row">
      <input id="place-q" type="text" placeholder="Torino" data-testid="place-q" />
      <button id="place-find" class="ghost" data-testid="place-find">Cerca</button>
    </div>
    <div id="place-results" data-testid="place-results"></div>
    <p class="lede" id="place-now" data-testid="place-now"></p>
    <div id="place-msg"></div>
  </div>

  <div class="block">
    <h2>La giornata</h2>
    <div class="tiles" id="tiles" data-testid="stats"></div>
    <h3>Sta rispondendo tutto?</h3>
    <div class="pills" id="health" data-testid="health"></div>
    <div class="row" style="margin-top:.9rem">
      <button id="dream" class="ghost" data-testid="dream">Fallo sognare adesso</button>
    </div>
    <div id="stats-msg"></div>
  </div>

  <div class="block">
    <h2>Cosa sa fare, adesso</h2>
    <p class="lede">Quasi tutto qui sotto &egrave; facoltativo: spento &egrave; uno stato legittimo.
       Quel che non &egrave; legittimo &egrave; una funzione spenta che si comporta come una funzione
       rotta &mdash; «la camera non mi funziona» quando la camera non c'entra niente. Se manca
       qualcosa, qui c'&egrave; scritto cosa impostare.</p>
    <div id="capabilities" data-testid="capabilities"></div>
  </div>
</section>

<section class="page" data-page="case">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Le case</h1>
    <p>Una persona pu&ograve; avere pi&ugrave; case e pi&ugrave; negozi (ADR-061), e ognuno &egrave; un mondo
       separato: il suo branco, i suoi ricordi, il suo salvadanaio, la sua chiave. Le stanze sono
       della casa &mdash; uno <em>Studio</em> in Casa Citt&agrave; e uno <em>Studio</em> in Casa Mare sono
       due stanze diverse, e il database lo sa gi&agrave;.</p>
  </div>

  <div class="block">
    <h2>Quelle che ci sono</h2>
    <div id="houses-list" data-testid="houses-list"></div>
  </div>

  <div class="block">
    <h2>Come si chiama, e che ore sono l&igrave;</h2>
    <p class="lede">Di questa casa &mdash; quella scelta in alto. Il fuso decide quando finisce la
       sua giornata, e quindi quando si azzera il salvadanaio.</p>
    <div class="row">
      <input id="house-name" type="text" placeholder="Casa Mare" data-testid="house-name" />
      <select id="house-kind" data-testid="house-kind">
        <option value="home">casa</option>
        <option value="business">azienda</option>
      </select>
      <input id="house-tz" type="text" placeholder="Europe/Rome" data-testid="house-tz" />
      <input id="house-budget" type="number" step="0.01" min="0" placeholder="0.50" data-testid="house-budget" />
      <button id="house-save" class="ghost" data-testid="house-save">Salva</button>
    </div>
    <div id="house-msg"></div>
  </div>

  <div class="block">
    <h2>Farne nascere una</h2>
    <p class="lede">Nasce con il suo gosino, il suo genoma e la sua chiave dati. Il token del
       proprietario si vede <strong>una volta sola</strong>: in archivio esiste solo come impronta,
       e se si perde si riemette &mdash; non si recupera.</p>
    <div class="row">
      <input id="new-house-slug" type="text" placeholder="casa-mare" data-testid="new-house-slug" />
      <input id="new-house-name" type="text" placeholder="Casa Mare" data-testid="new-house-name" />
      <select id="new-house-kind" data-testid="new-house-kind">
        <option value="casa">casa</option>
        <option value="azienda">azienda</option>
      </select>
      <input id="new-house-tz" type="text" placeholder="Europe/Rome" data-testid="new-house-tz" />
      <input id="new-house-gosino" type="text" placeholder="nome del gosino" data-testid="new-house-gosino" />
      <button id="new-house" class="ghost" data-testid="new-house">Falla nascere</button>
    </div>
    <div id="new-house-msg"></div>
  </div>
</section>

<section class="page" data-page="stanze">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Le stanze</h1>
    <p>Un dispositivo mostra <b>una stanza</b>, non una creatura: chi ci vive compare lì,
       da solo o insieme agli altri. Spostarli è come cambia chi vedi su quale schermo.</p>
  </div>

  <div class="block">
    <h2>Fai una stanza</h2>
    <p class="lede">Una stanza esiste anche se non ci vive ancora nessuno: falla prima,
       poi decidi chi ci va. L'indirizzo è <code>/?stanza=&lt;nome&gt;</code>.</p>
    <div class="row">
      <div><label for="room-name">Come si chiama</label>
        <input id="room-name" data-testid="room-name" placeholder="cucina" maxlength="40"></div>
      <button id="room-go" data-testid="room-go">Falla</button>
    </div>
  </div>

  <div class="block">
    <h2>Chi sta dove</h2>
    <p class="lede">Chi non sta in nessuna stanza non compare su nessun dispositivo finché
       non gliene dai una.</p>
    <div id="rooms-list" data-testid="rooms-list"></div>
    <div id="rooms-msg"></div>
  </div>

  <div class="block">
    <h2>Spostane uno</h2>
    <div class="row">
      <div><label for="move-who">Chi</label><select id="move-who" data-testid="move-who"></select></div>
      <div><label for="move-room">In che stanza</label>
        <select id="move-room" data-testid="move-room"></select></div>
      <button id="move-go" data-testid="move-go">Spostalo</button>
    </div>
    <p class="lede" style="margin-top:.7rem">Scegli <b>— nessuna stanza —</b> per toglierlo da
       ogni schermo. Lo spostamento è immediato: non perde né umore né ricordi, cambia solo
       dove lo vedi.</p>
  </div>
</section>

<section class="page" data-page="arredi">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Gli arredi</h1>
    <p>Una stanza vuota è un posto in cui non c'è niente da fare. Mettici un cuscino, un
       ciuffo d'erba, un truogolo: quando si <b>annoia</b> ci va da solo, e ci fa quello che
       l'oggetto suggerisce. Non glielo ordini tu — decide lui, e non costa un centesimo.</p>
  </div>

  <div class="block">
    <h2>Dove metterli</h2>
    <p class="lede">Scegli la stanza, poi <b>trascina</b> gli oggetti sulla piantina.
       Il maiale sta al centro. Quel che sposti qui si sposta sul chiosco
       <b>subito</b>, senza ricaricare niente.</p>
    <div class="row">
      <div><label for="prop-room">Quale stanza</label>
        <select id="prop-room" data-testid="prop-room"></select></div>
      <div><label for="prop-kind">Cosa aggiungere</label>
        <select id="prop-kind" data-testid="prop-kind"></select></div>
      <button id="prop-add" data-testid="prop-add">Mettilo dentro</button>
    </div>
    <div id="prop-map" class="prop-map" data-testid="prop-map">
      <div class="prop-pig" aria-hidden="true">🐷</div>
    </div>
    <p class="lede">Clicca un oggetto e premi <b>Togli</b> per riprendertelo: la scorta
       torna indietro.</p>
    <div class="row">
      <button id="prop-del" class="ghost" data-testid="prop-del" disabled>Togli</button>
      <button id="prop-turn" class="ghost" data-testid="prop-turn" disabled>Giralo</button>
    </div>
    <div id="prop-msg"></div>
  </div>

  <div class="block">
    <h2>Le scorte</h2>
    <p class="lede">In casa tua non c'è limite: metti quello che vuoi. Il limite serve per
       chi non è di casa — tante cose a settimana, così un premio resta un premio.
       Lascia <b>vuoto</b> per «nessun limite».</p>
    <div id="prop-stock" data-testid="prop-stock"></div>
    <div id="stock-msg"></div>
  </div>
</section>

<section class="page" data-page="volti">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Chi ha imparato a riconoscere</h1>
    <p>Quando vede una faccia che non conosce, e la rivede, <b>te lo chiede lui</b>: non c'è
       un modulo da compilare qui. Intanto conserva l'impronta — cifrata — in attesa di un
       nome, e questa pagina è dove la puoi vedere e cancellare.</p>
  </div>

  <div class="block">
    <h2>Facce senza nome</h2>
    <p class="lede">Sono <b>dati biometrici di persone che non hanno detto di sì</b>.
       Si cancellano da sole dopo <span id="print-retention">30</span> giorni, e qui puoi
       toglierne una subito. Quel che vedi è quante volte e quando: l'impronta non esce
       mai da questa casa, nemmeno verso questo pannello.</p>
    <div id="prints-list" data-testid="prints-list"></div>
    <div class="row">
      <div><label for="print-who">Chi è</label><select id="print-who" data-testid="print-who"></select></div>
      <button id="print-claim" data-testid="print-claim" disabled>È lui</button>
      <button id="print-del" class="ghost" data-testid="print-del" disabled>Cancella l'impronta</button>
    </div>
    <div id="prints-msg"></div>
  </div>

  <div class="block">
    <h2>Facce che conosce</h2>
    <p class="lede">Chi ha un'impronta del volto. Toglierla è immediato e non cancella la
       persona: smette solo di riconoscerla guardandola.</p>
    <div id="faces-list" data-testid="faces-list"></div>
    <div id="faces-msg"></div>
  </div>
</section>

<section class="page" data-page="branco">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Il branco</h1>
    <p>Chi vive qui. Il legame parte da zero e se lo guadagna col tempo.</p>
  </div>

  <div class="block">
    <h2>Chi c'è</h2>
    <div class="pack" data-testid="pack-rows" id="pack-rows"></div>
    <p class="lede" style="margin-top:.8rem">Le tutele si cambiano quando vuoi. Spuntare
       <b>non ascoltare</b> (o <b>è minorenne</b>) su chi ha già un'impronta vocale la
       <b>cancella</b>: revocare un consenso non è smettere di usare un dato, è distruggerlo.</p>
    <div id="pack-msg"></div>
  </div>

  <div class="block">
    <h2>Aggiungi un essere</h2>
    <div class="row">
      <div><label for="name">Nome</label><input id="name" data-testid="being-name" placeholder="Ivan"></div>
      <div><label for="species">Specie</label>
        <input id="species" data-testid="being-species" list="species-list" value="human">
        <datalist id="species-list"></datalist></div>
      <div><label for="kind">Ruolo</label><select id="kind" data-testid="being-kind">
        <option value="resident">vive qui</option><option value="visitor">passa ogni tanto</option>
        <option value="unknown">non so</option></select></div>
      <div><label for="arrival">Nel branco da</label><input type="date" id="arrival" data-testid="being-arrival"></div>
    </div>
    <div class="row" style="margin-top:.7rem">
      <label class="check"><input type="checkbox" id="minor" data-testid="being-minor"> è minorenne</label>
      <label class="check"><input type="checkbox" id="no-audio" data-testid="being-noaudio"> non ascoltare</label>
      <label class="check"><input type="checkbox" id="no-vision" data-testid="being-novision"> non guardare</label>
      <button id="add-being" data-testid="add-being">Aggiungi</button>
    </div>
    <div id="add-msg"></div>
  </div>

  <div class="block">
    <h2>Chi è chi</h2>
    <p class="lede">Le relazioni tra gli altri, vere anche senza UGO. Gli servono per capire di chi
       state parlando.</p>
    <div class="row">
      <div><label for="rel-a">Questo</label><select id="rel-a" data-testid="rel-a"></select></div>
      <div><label for="rel-type">è</label><select id="rel-type" data-testid="rel-type">
        <option value="parent_of">genitore di</option><option value="partner_of">sta con</option>
        <option value="cares_for">si prende cura di</option><option value="avoids">evita</option></select></div>
      <div><label for="rel-b">questo</label><select id="rel-b" data-testid="rel-b"></select></div>
      <button id="add-rel" data-testid="add-rel">Collega</button>
    </div>
    <ul class="plain" id="rel-list" data-testid="rel-list"></ul>
    <div id="rel-msg"></div>
  </div>

  <div class="block">
    <h2>La voce</h2>
    <p class="lede">Dieci secondi di parlato normale, dal dock di casa. L'impronta nasce stanotte,
       nel sogno: UGO non finge di aver imparato subito.</p>
    <div class="row">
      <div><label for="enroll-being">Chi parla</label><select id="enroll-being" data-testid="enroll-being"></select></div>
      <button id="rec" data-testid="rec">● Registra 10 s</button>
    </div>
    <p class="lede" style="margin-top:.7rem">Ripeti due o tre volte in momenti diversi: il centroide
       è una media, e migliora con la varietà.</p>
    <div id="enroll-msg"></div>

    <h3>Correggilo</h3>
    <p class="lede">Una correzione è <b>per una creatura</b>: se ne hai due, quella che ha
       sbagliato se lo ricorda e l'altra no. Dirlo a entrambe sarebbe far scusare chi non
       ha fatto niente.</p>
    <div class="row">
      <div><label for="corr-who">A chi</label><select id="corr-who" data-testid="corr-who"></select></div>
      <div><label for="corr-being">Su chi</label><select id="corr-being" data-testid="corr-being"></select></div>
      <div><label for="corr-signal">Cosa ha sbagliato</label><select id="corr-signal" data-testid="corr-signal">
        <option value="wrong_name">ha sbagliato nome</option><option value="too_loud">parla troppo forte</option>
        <option value="leave_alone">deve lasciare in pace</option><option value="good">ha fatto bene</option></select></div>
      <button id="add-corr" data-testid="add-corr">Diglielo</button>
    </div>
    <div id="corr-msg"></div>
  </div>
</section>

<section class="page" data-page="consiglio">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Il consiglio</h1>
    <p>Una domanda a tutti quanti. Il primo giro è cieco — nessuno sente gli altri prima di
       parlare — poi si ascoltano e possono cambiare idea. Solo modelli locali: un consiglio
       non tocca il budget.</p>
  </div>
  <div class="block">
    <div class="row">
      <div><label for="council-q">La domanda</label>
        <input id="council-q" data-testid="council-q" placeholder="Meglio il fango o il divano?"></div>
      <button id="council-go" data-testid="council-go">Convoca</button>
    </div>
    <div id="council-msg"></div>
    <div id="council-out" data-testid="council-out"></div>
  </div>
</section>

<section class="page" data-page="riunioni">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Riunioni e legami</h1>
    <p>Mandarlo in una call, e vedere cosa ha collegato a cosa.</p>
  </div>

  <div class="block">
    <h2>Riunioni</h2>
    <div class="row">
      <div><label for="meet-who">Chi ci mando</label>
        <select id="meet-who" data-testid="meet-who"></select></div>
      <div><label for="meet-url">Link della call</label>
        <input id="meet-url" data-testid="meet-url" placeholder="https://meet.google.com/abc-defg-hij"></div>
      <div><label for="meet-title">Titolo</label><input id="meet-title" data-testid="meet-title" placeholder="facoltativo"></div>
      <button id="meet-join" data-testid="meet-join">Mandalo in call</button>
    </div>
    <ul class="plain" id="meet-list" data-testid="meet-list"></ul>
    <div id="meet-msg"></div>
  </div>

  <div class="block">
    <h2>Come si legano</h2>
    <p class="lede">Chi parla di chi, chi è parente di chi, e cosa ha preso il posto di cosa.
       Il quadrato è una persona, il cerchio un ricordo; un cerchio vuoto è un ricordo ritirato,
       e la linea tratteggiata dice «questo ha sostituito quello».</p>
    <button id="graph-go" data-testid="graph-go" class="ghost">Disegna</button>
    <div id="graph-svg" data-testid="graph-svg"></div>
    <div id="graph-msg"></div>
  </div>
</section>

<section class="page" data-page="conti">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>I conti</h1>
    <p>Ogni giorno ha una cifra da spendere. Quando finisce lo dice, invece di rispondere
       peggio in silenzio. Il budget è della casa: i gosini lo condividono.</p>
  </div>
  <div class="block">
    <h2>Spesa degli ultimi 14 giorni</h2>
    <div class="plot" id="spend-chart" data-testid="spend-chart"></div>
    <details class="table"><summary>Vedi i numeri</summary><div id="spend-table"></div></details>
  </div>

  <div class="block">
    <h2>Il metabolismo</h2>
    <p class="lede">Acceso, ogni gosino ha un <b>salvadanaio suo</b>: quello che gli dai meno
       quello che consuma parlando. A saldo vuoto ha fame e te lo dice, invece di continuare a
       spendere il budget di casa. <b>Non allarga niente</b>: il tetto giornaliero qui sopra
       resta il muro esterno per tutti.</p>
    <p class="lede">Il salvadanaio di ognuno sta nella sua pagina <b>Il suo salvadanaio</b>.
       Guardali prima di accendere: chi è a zero smetterà di parlare finché non mangia.</p>
    <div class="row" style="align-items:center">
      <button id="meta-toggle" class="ghost" data-testid="meta-toggle">—</button>
      <span id="meta-state" data-testid="meta-state" class="lede" style="margin:0;flex:1 1 14rem"></span>
    </div>
    <div id="meta-msg"></div>
  </div>
</section>

<section class="page" data-page="liste">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>Le liste</h1>
    <p>La spesa, le cose da fare, quello che serve in ferramenta. Si riempiono <b>parlando</b>
       — «aggiungi il latte alla spesa», «ho preso il pane», «cosa c'è nella spesa?» — e
       queste frasi <b>non costano niente</b>: UGO le capisce in casa, senza chiedere a
       nessuno. Sono della casa, non di un gosino: la spesa è una sola anche se sono in tre.</p>
  </div>
  <div class="block">
    <div class="row">
      <div style="flex:0 1 12rem"><label for="list-name">Lista</label>
        <input id="list-name" data-testid="list-name" placeholder="spesa"></div>
      <div><label for="list-text">Cosa</label>
        <input id="list-text" data-testid="list-text" placeholder="latte"></div>
      <button id="list-add" data-testid="list-add">Aggiungi</button>
    </div>
    <div id="lists-all" data-testid="lists-all"></div>
    <div id="list-msg"></div>
  </div>
</section>

<section class="page" data-page="dati">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>I dati</h1>
    <p>Sono tuoi. Puoi portarli via tutti, o far sparire qualcuno per sempre.</p>
  </div>
  <div class="block">
    <h2>Portarli via</h2>
    <button id="export" class="ghost" data-testid="export">Scarica tutto (JSON)</button>
    <p class="lede" style="margin-top:.7rem">Il file contiene conversazioni, trascrizioni, ricordi
       e diario <b>in chiaro</b>. Le impronte vocali no: un export è testo leggibile, e un'impronta
       in chiaro è ciò che la cifratura esiste per impedire.</p>
  </div>
  <div class="block">
    <h2>Far dimenticare qualcuno</h2>
    <div class="row">
      <div><label for="forget-being">Chi</label><select id="forget-being" data-testid="forget-being"></select></div>
      <div><label for="forget-confirm">Scrivi DIMENTICA per confermare</label>
        <input id="forget-confirm" data-testid="forget-confirm" autocomplete="off"></div>
      <button id="forget" data-testid="forget">Dimentica</button>
    </div>
    <p class="lede" style="margin-top:.7rem">Irreversibile. Il nome sparisce da tutta la biografia
       — anche dalle frasi degli altri — i ricordi vengono riscritti e ricalcolati, e l'impronta
       vocale è distrutta.</p>
    <div id="forget-msg"></div>
  </div>
</section>

<section class="page" data-page="feed">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
    <h1>I feed</h1>
    <p>Le fonti che UGO legge da solo (ADR-060): le scarica coi job, le impara <b>sognando</b>,
       e quando una novità somiglia davvero a quello su cui lavora un cliente, la mattina te
       lo dice — «è uscita X, magari proporla a Y». Al massimo <b>un consiglio al giorno</b>,
       e mai in reception: l'incrocio con i clienti resta in casa.</p>
  </div>

  <div class="block">
    <h2>Iscrivilo a un feed</h2>
    <div class="row">
      <div><label for="feed-url">Indirizzo (RSS o Atom)</label>
        <input id="feed-url" data-testid="feed-url" placeholder="https://blog.example.com/feed.xml" maxlength="500"></div>
      <div><label for="feed-label">Come lo chiami</label>
        <input id="feed-label" data-testid="feed-label" placeholder="changelog di React" maxlength="120"></div>
      <button id="feed-go" data-testid="feed-go">Iscrivilo</button>
    </div>
    <div id="feed-msg"></div>
  </div>

  <div class="block">
    <h2>Cosa sta seguendo</h2>
    <div id="feed-list" data-testid="feed-list"></div>
  </div>

  <div class="block">
    <h2>Cos'è arrivato</h2>
    <p class="lede">Gli ultimi articoli scaricati, dal più recente. Il contatore qui sopra dice
       <i>quanti</i>; questo dice <b>quali</b> — ed è l'unico modo di accorgersi che un feed
       pubblica solo pubblicità prima che UGO te ne consigli uno.</p>
    <p class="lede">La spunta accanto a un titolo vuol dire che <b>te l'ha già consigliato lui</b>:
       una cosa consigliata non si riconsiglia. Puoi anche chiedergliele a voce —
       «che notizie ci sono?» — e ti legge i primi titoli.</p>
    <div id="feed-items" data-testid="feed-items"></div>
  </div>
</section>
`;
