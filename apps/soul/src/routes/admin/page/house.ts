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
    <h2>La giornata</h2>
    <div class="tiles" id="tiles" data-testid="stats"></div>
    <h3>Sta rispondendo tutto?</h3>
    <div class="pills" id="health" data-testid="health"></div>
    <div class="row" style="margin-top:.9rem">
      <button id="dream" class="ghost" data-testid="dream">Fallo sognare adesso</button>
    </div>
    <div id="stats-msg"></div>
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
    <div class="row">
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
`;
