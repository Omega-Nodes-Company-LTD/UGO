/**
 * The shell: the way in, the navigation rail, and the frame the pages sit in
 * (ADR-035).
 *
 * The rail is the whole point of the rebuild. The panel used to be one long
 * scroll with a row of anchor tabs, which worked while there was one creature
 * and stopped working the moment there could be several: "Come sta" is a
 * question about *somebody*, and a flat list of sections has nowhere to put
 * the somebody. So the navigation now has two levels — the house, and each
 * gosino — and the address bar says which one you are looking at.
 */
export const ADMIN_SHELL_TOP = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UGO — pannello</title>
<style>__STYLES__</style>
</head>
<body>

<!-- the way in. Nothing else exists until the token is accepted. -->
<div id="gate" class="gate">
  <div class="gate-card">
    <h1>UGO <span aria-hidden="true">🐷</span></h1>
    <p class="lede">Il pannello di casa. Serve il token operatore
       (<code>UGO_INTERNAL_TOKEN</code>).</p>
    <label for="token">Token operatore</label>
    <input type="password" id="token" data-testid="token" placeholder="token operatore" autocomplete="off">
    <label class="check" style="margin:.7rem 0"><input type="checkbox" id="stay" checked> resta collegato su questo dispositivo</label>
    <button id="save-token" data-testid="save-token" style="width:100%">Entra</button>
    <div id="auth-msg"></div>
    <p class="fine">Spuntando <b>resta collegato</b> il token resta su questo dispositivo finché
       non esci. Toglila su un computer che non è tuo: il token vale come una chiave di casa.</p>
  </div>
</div>

<div class="app" id="app" hidden>
  <aside class="rail">
    <div class="brand">UGO <span>pannello</span></div>

    <nav class="rail-group" hidden>
      <small>Gli account</small>
      <div id="rail-accounts" data-testid="rail-accounts"></div>
    </nav>

    <nav class="rail-group">
      <small>L'account</small>
      <a href="#/sommario" data-nav="sommario">Sommario</a>
      <a href="#/account" data-nav="account">Gli account</a>
      <a href="#/stanze" data-nav="stanze">Le stanze</a>
      <a href="#/arredi" data-nav="arredi">Gli arredi</a>
      <a href="#/branco" data-nav="branco">Il branco</a>
      <a href="#/volti" data-nav="volti">I volti</a>
      <a href="#/consiglio" data-nav="consiglio">Il consiglio</a>
      <a href="#/riunioni" data-nav="riunioni">Riunioni e legami</a>
      <a href="#/liste" data-nav="liste">Le liste</a>
      <a href="#/feed" data-nav="feed">I feed</a>
      <a href="#/adozioni" data-nav="adozioni">Le adozioni</a>
      <a href="#/clienti" data-nav="clienti">I clienti</a>
      <a href="#/conti" data-nav="conti">I conti</a>
      <a href="#/dati" data-nav="dati">I dati</a>
    </nav>

    <nav class="rail-group">
      <small>I gosini</small>
      <div id="rail-gosini" data-testid="rail-gosini"></div>
      <a href="#/nascita" data-nav="nascita">+ Fanne nascere uno</a>
    </nav>

    <nav class="rail-group">
      <small>Sessione</small>
      <button type="button" class="rail-link" id="refresh" data-testid="refresh">Aggiorna tutto</button>
      <button type="button" class="rail-link" id="logout" data-testid="logout">Esci</button>
    </nav>

    <nav class="rail-group rail-build">
      <small>Che roba stai guardando</small>
      <p class="rail-version" data-testid="panel-version">pannello <code>__PANEL_VERSION__</code></p>
      <p class="rail-version" id="face-version" data-testid="face-version">muso <code>&hellip;</code></p>
      <p class="rail-hint">Se il numero del muso non &egrave; quello scritto in basso a destra sul
         chiosco, il dispositivo sta ancora mostrando un bundle vecchio: ricarica la pagina del
         chiosco. Se non cambia comunque, soul non &egrave; stato ridistribuito.</p>
    </nav>
  </aside>

  <main id="main">
`;

/** Closes the frame and pulls in the behaviour. */
export const ADMIN_SHELL_BOTTOM = `
  </main>
</div>
<script src="/admin/panel.js"></script>
</body>
</html>`;

/** Styles that only the way-in screen uses. */
export const GATE_STYLES = `
  .gate { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; }
  .gate-card { width: min(24rem, 100%); background: var(--surface); border: 1px solid var(--line);
               border-radius: var(--r-lg); padding: 1.5rem; }
  .gate-card h1 { font-size: 1.5rem; margin-bottom: .3rem; }
  .fine { font-size: .76rem; color: var(--ink-3); margin: .8rem 0 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em;
         background: var(--surface-2); padding: .05rem .3rem; border-radius: .25rem; }
  /* one page at a time: the rail says which, the address bar remembers it */
  .page { display: none; }
  .page.on { display: block; }
`;
