import { FAVICON_PATH, icon } from "@ugo/design";

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
<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">
<style>__STYLES__</style>
</head>
<body>

<!-- the way in. Nothing else exists until a session or a token is accepted. -->
<div id="gate" class="gate">
  <div class="gate-card">
    <h1 class="brand-mark">${icon("pig")}UGO</h1>
    <p class="lede">Il pannello della tua casa.</p>
    <p><a class="gate-primary" href="/accedi" data-testid="gate-email">Entra con la tua email</a></p>
    <p class="fine">Non hai ancora una casa? <a href="/registrati">Creala qui</a>.</p>
    <details class="gate-token">
    <summary data-testid="gate-token-open">Ho un token</summary>
    <p class="fine">Per l'operatore (<code>UGO_INTERNAL_TOKEN</code>) e per le case nate dalla
       riga di comando.</p>
    <label for="token">Token</label>
    <input type="password" id="token" data-testid="token" placeholder="token operatore" autocomplete="off">
    <label class="check" style="margin:.7rem 0"><input type="checkbox" id="stay" checked> resta collegato su questo dispositivo</label>
    <button id="save-token" data-testid="save-token" style="width:100%">Entra</button>
    <div id="auth-msg"></div>
    <p class="fine">Spuntando <b>resta collegato</b> il token resta su questo dispositivo finché
       non esci. Toglila su un computer che non è tuo: il token vale come una chiave di casa.</p>
    </details>
  </div>
</div>

<div class="app" id="app" hidden>
  <aside class="rail">
    <div class="brand">${icon("pig")}UGO <span>pannello</span></div>

    <nav class="rail-group" hidden>
      <small>Gli account</small>
      <div id="rail-accounts" data-testid="rail-accounts"></div>
    </nav>

    <nav class="rail-group">
      <a href="#/sommario" data-nav="sommario">${icon("today")}Oggi</a>
    </nav>

    <nav class="rail-group">
      <small>I gosini</small>
      <div id="rail-gosini" data-testid="rail-gosini"></div>
      <a href="#/nascita" data-nav="nascita" data-needs="breeding">${icon("plus")}Fanne nascere uno</a>
    </nav>

    <nav class="rail-group">
      <small>La casa</small>
      <a href="#/stanze" data-nav="stanze">${icon("room")}Le stanze</a>
      <a href="#/arredi" data-nav="arredi">${icon("sofa")}Gli arredi</a>
      <a href="#/branco" data-nav="branco">${icon("users")}Il branco</a>
      <a href="#/volti" data-nav="volti">${icon("face")}I volti</a>
      <a href="#/liste" data-nav="liste">${icon("list")}Le liste</a>
      <a href="#/documenti" data-nav="documenti">${icon("doc")}I documenti</a>
      <a href="#/segue" data-nav="segue" data-plan="dream">${icon("eye")}Le cose che segue</a>
      <a href="#/album" data-nav="album" data-plan="album">${icon("photo")}L'album</a>
    </nav>

    <nav class="rail-group">
      <small>Insieme</small>
      <a href="#/riunioni" data-nav="riunioni" data-plan="meetings">${icon("meeting")}Riunioni e legami</a>
      <a href="#/consiglio" data-nav="consiglio">${icon("council")}Il consiglio</a>
      <a href="#/feed" data-nav="feed">${icon("feed")}I feed</a>
      <a href="#/parentele" data-nav="parentele">${icon("family")}Le parentele</a>
      <a href="#/piazza" data-nav="piazza" data-plan="plaza">${icon("plaza")}La piazza</a>
    </nav>

    <nav class="rail-group">
      <small>Mercato</small>
      <a href="#/adozioni" data-nav="adozioni">${icon("store")}Le adozioni</a>
      <a href="#/allevamento" data-nav="allevamento" data-needs="breeding">${icon("coin")}Il mio allevamento</a>
    </nav>

    <nav class="rail-group" data-group="business">
      <small>Lavoro</small>
      <a href="#/clienti" data-nav="clienti">${icon("briefcase")}I clienti</a>
    </nav>

    <nav class="rail-group">
      <small>Account</small>
      <a href="#/ai" data-nav="ai">${icon("brain")}La testa di UGO</a>
      <a href="#/abbonamento" data-nav="abbonamento">${icon("card")}Abbonamento</a>
      <a href="#/credito" data-nav="credito">${icon("bolt")}Il credito</a>
      <a href="#/accessi" data-nav="accessi">${icon("key")}Accessi e dispositivi</a>
      <a href="#/conti" data-nav="conti">${icon("coin")}I conti</a>
      <a href="#/giornale" data-nav="giornale">${icon("journal")}Il giornale</a>
      <a href="#/dati" data-nav="dati">${icon("shield")}I dati</a>
    </nav>

    <nav class="rail-group" data-group="operator">
      <small>Operatore</small>
      <a href="#/account" data-nav="account">${icon("users")}Gli account</a>
      <a href="#/diagnostica" data-nav="diagnostica">${icon("gauge")}La diagnostica</a>
      <a href="#/segnalazioni" data-nav="segnalazioni">${icon("alert")}Le segnalazioni</a>
    </nav>

    <nav class="rail-group">
      <small>Sessione</small>
      <button type="button" class="rail-link" id="theme" data-testid="theme">${icon("auto")}<span id="theme-label">Tema: automatico</span></button>
      <button type="button" class="rail-link" id="refresh" data-testid="refresh">${icon("refresh")}Aggiorna tutto</button>
      <button type="button" class="rail-link" id="logout" data-testid="logout">${icon("logout")}Esci</button>
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
  .gate-primary { display: block; text-align: center; font-weight: 700; padding: .75rem 1rem; border-radius: var(--r);
    background: var(--accent); color: var(--on-accent); text-decoration: none; }
  .gate-token { margin-top: 1rem; border-top: 1px solid var(--line); padding-top: .8rem; }
  .gate-token summary { cursor: pointer; font-weight: 700; }
  .fine { font-size: .76rem; color: var(--ink-3); margin: .8rem 0 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em;
         background: var(--surface-2); padding: .05rem .3rem; border-radius: .25rem; }
  /* one page at a time: the rail says which, the address bar remembers it */
  .page { display: none; }
  .page.on { display: block; }
`;
