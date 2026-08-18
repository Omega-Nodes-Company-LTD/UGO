/**
 * The customers page (ADR-052): the house side of the reception. One page,
 * two layers — the list, and the selected customer's detail. The detail's
 * skeleton is static (script.test.ts wires every id the script reaches for);
 * the script only fills the containers and toggles visibility.
 */
export const CUSTOMER_PAGES = `
<section class="page" data-page="clienti">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>I clienti</h1>
    <p>Chi bussa alla reception: a quali gosini può rivolgersi, con che token entra,
       cosa ha chiesto. Il gosino <b>raccoglie</b> le richieste — il lavoro resta tuo.</p>
  </div>

  <div class="block">
    <h2>Un cliente nuovo</h2>
    <div class="row">
      <div><label for="cust-name">Come si chiama</label>
        <input id="cust-name" data-testid="cust-name" placeholder="Rossi SRL" maxlength="120"></div>
      <button id="cust-go" data-testid="cust-go">Crealo</button>
    </div>
    <div id="cust-msg"></div>
  </div>

  <div class="block">
    <h2>Il registro</h2>
    <div id="cust-list" data-testid="cust-list"></div>
  </div>

  <div class="block" id="cust-detail" data-testid="cust-detail" hidden>
    <h2 id="cust-title"></h2>
    <div class="because" id="cust-slug"></div>
    <div id="cust-token-once"></div>

    <h3>A chi può rivolgersi</h3>
    <div id="cust-gosini-list"></div>
    <div class="row" style="margin-top:.5rem">
      <button id="cust-assign" data-testid="cust-assign">Salva gli ascoltatori</button>
    </div>

    <h3>I suoi limiti</h3>
    <div class="row">
      <div><label for="cust-budget">Tetto del giorno (USD, vuoto = default)</label>
        <input id="cust-budget" data-testid="cust-budget"></div>
      <div><label for="cust-hourly">Domande l'ora (vuoto = default)</label>
        <input id="cust-hourly" data-testid="cust-hourly"></div>
      <div><label for="cust-apples">Mele in 7 giorni (vuoto = default)</label>
        <input id="cust-apples" data-testid="cust-apples"></div>
      <button id="cust-limits" data-testid="cust-limits">Salva i limiti</button>
    </div>
    <p class="because" id="cust-apples-given"></p>

    <h3>I token</h3>
    <div id="cust-tokens"></div>
    <div class="row" style="margin-top:.5rem">
      <div><label for="cust-token-label">Per cosa è</label>
        <input id="cust-token-label" data-testid="cust-token-label" placeholder="portale di Rossi SRL" maxlength="120"></div>
      <button id="cust-token-go" data-testid="cust-token-go">Emetti un token</button>
    </div>

    <h3>Cosa sa del suo lavoro</h3>
    <p class="lede">Le fonti (ADR-054): repository da clonare e indicizzare, una casella email
       da <b>leggere soltanto</b>, documenti nel bucket privato. Le credenziali entrano cifrate
       e non escono mai più.</p>
    <div id="cust-sources"></div>
    <div class="row" style="margin-top:.5rem">
      <div><label for="cust-repo-url">Repository (URL git)</label>
        <input id="cust-repo-url" data-testid="cust-repo-url" placeholder="https://github.com/studio/progetto"></div>
      <div><label for="cust-repo-branch">Ramo</label>
        <input id="cust-repo-branch" data-testid="cust-repo-branch" value="main" maxlength="80"></div>
      <div><label for="cust-repo-pat">PAT (vuoto se pubblico)</label>
        <input id="cust-repo-pat" data-testid="cust-repo-pat" type="password" maxlength="300"></div>
      <button id="cust-repo-go" data-testid="cust-repo-go">Collega il repo</button>
    </div>
    <div class="row" style="margin-top:.5rem">
      <div><label for="cust-mail-host">IMAP host</label>
        <input id="cust-mail-host" data-testid="cust-mail-host" placeholder="imap.example.com"></div>
      <div><label for="cust-mail-port">Porta</label>
        <input id="cust-mail-port" data-testid="cust-mail-port" value="993" maxlength="5"></div>
      <div><label for="cust-mail-user">Utente</label>
        <input id="cust-mail-user" data-testid="cust-mail-user"></div>
      <div><label for="cust-mail-pass">Password</label>
        <input id="cust-mail-pass" data-testid="cust-mail-pass" type="password"></div>
      <div><label for="cust-mail-folder">Cartella</label>
        <input id="cust-mail-folder" data-testid="cust-mail-folder" value="INBOX"></div>
      <div style="flex:2"><label for="cust-mail-senders">Solo da/per (vuoto = tutta la cartella)</label>
        <input id="cust-mail-senders" data-testid="cust-mail-senders"
          placeholder="mario@rossi.it, @rossisrl.it"
          title="indirizzi o domini separati da virgola: si indicizzano solo i messaggi in cui mittente o destinatari combaciano"></div>
      <button id="cust-mail-go" data-testid="cust-mail-go">Collega la casella</button>
    </div>
    <div class="row" style="margin-top:.5rem">
      <div><label for="cust-doc-file">Documento (pdf, txt, md, csv)</label>
        <input id="cust-doc-file" data-testid="cust-doc-file" type="file" accept=".pdf,.txt,.md,.csv"></div>
      <button id="cust-doc-go" data-testid="cust-doc-go">Caricalo</button>
      <button id="cust-sync-go" class="ghost" data-testid="cust-sync-go">Sincronizza adesso</button>
    </div>

    <h3>Le richieste</h3>
    <div id="cust-tickets"></div>

    <div id="cust-stats"></div>

    <div class="row" style="margin-top:.9rem">
      <button id="cust-archive" class="ghost" data-testid="cust-archive"></button>
    </div>

    <div class="row" style="margin-top:.9rem">
      <input id="cust-forget-confirm" data-testid="cust-forget-confirm" type="text"
             autocomplete="off" placeholder="scrivi il nome del cliente per confermare">
      <button id="cust-forget" class="ghost" data-testid="cust-forget">Dimentica il cliente</button>
    </div>
    <p class="lede">L'oblio (GDPR): cancella <b>tutto</b> — conversazioni, ticket, documenti nel
       bucket compresi — e non si torna indietro. Archiviare invece conserva. Il nome scritto
       per intero è la conferma: un click solo non basta per una cosa irreversibile.</p>
    <div id="cust-detail-msg"></div>
  </div>
</section>
`;
