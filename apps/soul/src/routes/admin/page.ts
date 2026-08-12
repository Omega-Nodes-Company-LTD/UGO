/**
 * The operator panel (served at /admin). No build step, no dependencies.
 *
 * It is a tool, not a document: the summary comes before the detail, state
 * is encoded in shape as well as number, and the mood — the thing that makes
 * UGO a creature rather than a service — is the first thing on the page.
 *
 * The operator token lives in sessionStorage: typed once, gone when the tab
 * closes, never in a URL where history or logs could keep it.
 */
export const ADMIN_PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UGO — pannello</title>

<style>
  /* Palette: UGO's clay for the chrome, a validated step of the same family
     for the data marks (the brand hex sits below the readable lightness band
     for a mark on this surface), and the reserved status colours — which never
     appear without a word beside them. */
  :root {
    --paper: #fbf9f8; --card: #ffffff; --sunk: #f4efed;
    --ink: #241a19; --muted: #6f6360; --rule: #e7dfdc;
    --brand: #7a3030; --brand-soft: #7a303014;
    --data: #a8443c; --data-soft: #a8443c26;
    --good: #0ca30c; --warning: #b07600; --critical: #d03b3b;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --shadow: 0 1px 2px #241a190a, 0 10px 30px #241a1908;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #16110f; --card: #1e1816; --sunk: #241d1a;
      --ink: #ece3df; --muted: #a99b96; --rule: #342a27;
      --brand: #d98d84; --brand-soft: #d98d841f;
      --data: #c4695c; --data-soft: #c4695c33;
      --good: #3fbf3f; --warning: #fab219; --critical: #e26a6a;
      --shadow: 0 1px 2px #0007, 0 10px 30px #0005;
    }
  }
  :root[data-theme="dark"] {
    --paper: #16110f; --card: #1e1816; --sunk: #241d1a;
    --ink: #ece3df; --muted: #a99b96; --rule: #342a27;
    --brand: #d98d84; --brand-soft: #d98d841f;
    --data: #c4695c; --data-soft: #c4695c33;
    --good: #3fbf3f; --warning: #fab219; --critical: #e26a6a;
    --shadow: 0 1px 2px #0007, 0 10px 30px #0005;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .shell { max-width: 72rem; margin: 0 auto; padding: 0 1rem 5rem; }
  /* on a wide screen the state and its history sit side by side instead of
     making the reader scroll between the number and its shape */
  @media (min-width: 60rem) {
    .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.6rem; align-items: start; }
    .split > * { min-width: 0; }
    /* only side by side does the second column start at the top; stacked,
       the heading still needs air above it */
    .split .split-head { margin-top: 0; }
  }

  /* --- hero: the mood, because that is what this creature is ------------- */
  header.hero { padding: 2rem 0 1.25rem; }
  .wordmark { font-family: var(--serif); font-size: 1.05rem; letter-spacing: .01em; margin: 0 0 1.25rem; }
  .wordmark b { color: var(--brand); font-weight: 600; }
  .mood { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
  .mood b { font-family: var(--serif); font-size: clamp(2rem, 7vw, 3rem); line-height: 1; font-weight: 600; }
  .mood span { color: var(--muted); font-size: .95rem; max-width: 34rem; }

  nav.tabs { display: flex; gap: .35rem; overflow-x: auto; padding: .75rem 0 0; margin-bottom: -1px; }
  nav.tabs a {
    padding: .45rem .8rem; border-radius: .45rem .45rem 0 0; text-decoration: none;
    color: var(--muted); font-size: .9rem; white-space: nowrap; border: 1px solid transparent;
  }
  nav.tabs a:hover { color: var(--brand); background: var(--brand-soft); }

  section { background: var(--card); border: 1px solid var(--rule); border-radius: .75rem;
            padding: 1.25rem 1.25rem 1.4rem; margin-top: 1rem; box-shadow: var(--shadow); }
  h2 { font-family: var(--serif); font-size: 1.2rem; margin: 0 0 .2rem; font-weight: 600; }
  h2 + .lede { margin: 0 0 1rem; color: var(--muted); font-size: .9rem; }
  h3 { font-size: .95rem; margin: 1.5rem 0 .4rem; }

  label { display: block; margin: .5rem 0 .15rem; font-size: .78rem; color: var(--muted);
          text-transform: uppercase; letter-spacing: .07em; }
  input, select, button { font: inherit; padding: .5rem .6rem; border-radius: .45rem;
                          border: 1px solid var(--rule); background: var(--card); color: inherit; }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
  button { cursor: pointer; background: var(--brand); color: #fff; border-color: var(--brand); font-weight: 500; }
  button.ghost { background: transparent; color: inherit; border-color: var(--rule); font-weight: 400; }
  button.ghost:hover { border-color: var(--brand); color: var(--brand); }
  button[disabled] { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: flex-end; }
  .row > div { flex: 1 1 9rem; } .row > div > input, .row > div > select { width: 100%; }
  .check { display: inline-flex; align-items: center; gap: .35rem; text-transform: none;
           letter-spacing: 0; font-size: .85rem; color: inherit; margin: 0; }

  /* --- summary before detail -------------------------------------------- */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem; }
  .tile { background: var(--sunk); border-radius: .55rem; padding: .7rem .8rem; }
  .tile small { display: block; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .tile b { display: block; font-family: var(--serif); font-size: 1.6rem; line-height: 1.2;
            font-variant-numeric: tabular-nums; }
  .tile span { font-size: .78rem; color: var(--muted); }
  .pill { display: inline-flex; align-items: center; gap: .3rem; font-size: .75rem; padding: .1rem .5rem;
          border-radius: 999px; border: 1px solid currentColor; }
  /* status never rides on colour alone: every pill carries its word */
  .pill.good { color: var(--good); } .pill.warning { color: var(--warning); } .pill.critical { color: var(--critical); }

  /* --- charts ------------------------------------------------------------ */
  .plot { position: relative; margin-top: .4rem; }
  .plot-title { margin: 1.1rem 0 0; font-size: .82rem; color: var(--muted); }
  .plot-title b { color: var(--ink); font-weight: 600; }
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .chart .grid { stroke: var(--rule); stroke-width: 1; }
  /* axis labels are the difference between a picture and an instrument */
  .chart .tick { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
  .chart .area { fill: var(--data-soft); }
  .chart .line { fill: none; stroke: var(--data); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .chart .endpoint { fill: var(--data); stroke: var(--card); stroke-width: 2; }
  .chart .cursor { fill: var(--data); stroke: var(--card); stroke-width: 2; }
  .chart .crosshair { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
  .chart .bar { fill: var(--data); }
  .chart .bar.over { fill: var(--critical); }
  .chart .reference { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 4 4; }
  .tip { position: absolute; top: 0; background: var(--ink); color: var(--paper); font-size: .75rem;
         padding: .2rem .45rem; border-radius: .3rem; pointer-events: none; white-space: nowrap; }
  .empty { color: var(--muted); font-size: .9rem; margin: .5rem 0; }
  /* a caveat that travels with a drawn chart, not instead of one */
  .note { color: var(--muted); font-size: .8rem; margin: .35rem 0 0; }

  /* --- small multiples: six shapes, one colour, no legend ---------------- */
  .sparks { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: .5rem; margin-top: .6rem; }
  .spark-card { display: block; width: 100%; text-align: left; padding: .5rem .6rem .3rem;
                background: var(--sunk); border: 1px solid transparent; border-radius: .55rem;
                color: inherit; font-weight: 400; cursor: pointer; }
  .spark-card:hover { border-color: var(--rule); }
  .spark-card.on { border-color: var(--data); background: var(--data-soft); }
  .spark-card small { display: block; font-size: .72rem; text-transform: uppercase;
                      letter-spacing: .07em; color: var(--muted); }
  .spark-card b { display: block; font-size: 1.15rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .spark { display: block; width: 100%; height: 34px; }
  .spark-line { fill: none; stroke: var(--data); stroke-width: 1.5; stroke-linejoin: round; }
  .spark-area { fill: var(--data-soft); }
  .spark-end { fill: var(--data); }
  .spark-empty { color: var(--muted); font-size: .8rem; }

  /* --- ranked horizontal bars: the labels are words, so they lie flat ---- */
  /* capped: a count of 2 does not deserve a bar the width of the page */
  .hbar { display: grid; grid-template-columns: 9rem minmax(0, 22rem) 2rem; align-items: center;
          gap: .6rem; margin: .3rem 0; font-size: .85rem; }
  .hbar-name { color: var(--muted); }
  .hbar-track { display: block; height: 9px; background: var(--sunk); border-radius: 4px; }
  .hbar-track > i { display: block; height: 100%; background: var(--data); border-radius: 4px; }
  .hbar-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  details.table { margin-top: .6rem; } details.table summary { cursor: pointer; color: var(--muted); font-size: .82rem; }
  details.table table { width: 100%; border-collapse: collapse; font-size: .82rem; margin-top: .5rem;
                        font-variant-numeric: tabular-nums; }
  details.table th, details.table td { text-align: left; padding: .25rem .4rem; border-bottom: 1px solid var(--rule); }

  /* --- the psyche, as six magnitudes with their resting points ----------- */
  .var { display: grid; grid-template-columns: 5.5rem 1fr 2.5rem; align-items: center; gap: .6rem; margin: .35rem 0; }
  .var .name { font-size: .85rem; color: var(--muted); }
  .var .num { font-size: .8rem; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .meter { position: relative; display: block; height: 7px; background: var(--sunk); border-radius: 4px; }
  .meter > i { display: block; height: 100%; background: var(--data); border-radius: 4px; }
  .meter .baseline { position: absolute; top: -3px; width: 1px; height: 13px; background: var(--muted); opacity: .55; }
  /* the causes sit under their own bar, in the bar's column, so the eye reads
     "questa barra, per questi motivi" without a legend */
  .why { grid-column: 2 / 4; font-size: .74rem; color: var(--muted); margin: -.1rem 0 .35rem; }
  .why b { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .why .rest { opacity: .7; }

  /* --- what he started himself, and the council -------------------------- */
  .deed { background: var(--sunk); border-radius: .6rem; padding: .6rem .8rem; margin: .4rem 0; }
  .deed .when { font-size: .74rem; color: var(--muted); float: right; }
  .deed .act { font-weight: 600; }
  .deed .because { font-size: .85rem; color: var(--muted); font-style: italic; }
  .deed .deed-act { font-weight: 400; color: var(--muted); }
  .voice { background: var(--sunk); border-radius: .6rem; padding: .7rem .9rem; margin: .5rem 0; }
  .voice h4 { margin: 0 0 .3rem; font-family: var(--serif); font-size: .95rem; }
  .voice .said { margin: .2rem 0; }
  .voice .again { margin: .4rem 0 0; padding-left: .7rem; border-left: 2px solid var(--data); }

  /* --- the pack ---------------------------------------------------------- */
  .pack { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: .75rem; }
  .being { background: var(--sunk); border-radius: .6rem; padding: .8rem .9rem; }
  .being h4 { margin: 0; font-size: 1rem; font-family: var(--serif); font-weight: 600; }
  .being .species { font-size: .78rem; color: var(--muted); }
  .being .bond { margin: .6rem 0 .5rem; display: grid; gap: .3rem; }
  .being .bond div { display: grid; grid-template-columns: 4.5rem 1fr; align-items: center; gap: .5rem;
                     font-size: .75rem; color: var(--muted); }
  .being .guards { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; }
  .being .guards label { margin: 0; }
  ul.plain { list-style: none; margin: .5rem 0 0; padding: 0; font-size: .9rem; }
  ul.plain li { padding: .3rem 0; border-bottom: 1px solid var(--rule); display: flex;
                justify-content: space-between; gap: .5rem; align-items: center; }
  ul.plain li:last-child { border-bottom: 0; }
  .flags { font-size: .8rem; color: var(--muted); }
  /* corrections on a memory: present, but never louder than the memory */
  button.link { background: none; border: 0; padding: 0 .1rem; font: inherit;
    font-size: .8rem; color: var(--muted); text-decoration: underline; cursor: pointer; }
  button.link:hover { color: var(--ink); }
  button.link.danger:hover { color: var(--danger, #b3261e); }
  li.retired { opacity: .55; }
  li.retired b { text-decoration: line-through; }
  .msg { margin-top: .8rem; padding: .55rem .7rem; border-radius: .45rem; font-size: .88rem; }
  .msg.ok { background: #0ca30c1a; } .msg.err { background: #d03b3b1a; } .msg.info { background: var(--sunk); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em;
         background: var(--sunk); padding: .1em .35em; border-radius: .25em; }
  :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="shell">
<header class="hero">
  <p class="wordmark"><b>UGO</b> 🐷 pannello</p>
  <div id="auth-hero">
    <p class="flags">Incolla il token operatore (<code>UGO_INTERNAL_TOKEN</code>). Resta in questa
       scheda: chiudendola sparisce.</p>
    <div class="row" style="max-width:26rem">
      <div><input type="password" id="token" data-testid="token" placeholder="token operatore" autocomplete="off"></div>
      <button id="save-token" data-testid="save-token">Entra</button>
    </div>
    <div id="auth-msg"></div>
  </div>
  <div class="mood" id="mood-hero" hidden>
    <b id="mood-label" data-testid="mood-label">—</b>
    <span id="mood-phrase" data-testid="mood-phrase"></span>
    <!-- ADR-034: with more than one of them in the house, every reading below
         belongs to somebody. Hidden while there is only one, because a chooser
         with a single choice is furniture. -->
    <label id="who-pick" hidden style="margin-left:auto;display:flex;align-items:center;gap:.4rem">
      <span style="font-size:.8rem;color:var(--muted)">stai guardando</span>
      <select id="who" data-testid="who"></select>
    </label>
  </div>
</header>

<div id="app" hidden>
  <nav class="tabs">
    <a href="#ora">Come sta</a><a href="#volonta">Cosa ha deciso lui</a>
    <a href="#branco">Il branco</a><a href="#consiglio">Il consiglio</a><a href="#voce">Voce</a>
    <a href="#memoria">Memoria</a><a href="#conti">Conti</a><a href="#dati">I dati</a>
  </nav>

  <section id="ora">
    <h2>Come sta adesso</h2>
    <p class="lede">Sei variabili che si muovono da sole e tornano piano al loro punto di riposo —
       il trattino verticale su ogni barra.</p>
    <div class="split">
      <div>
        <div id="psyche-bars" data-testid="psyche-bars"></div>
      </div>
      <div>
        <h3 class="split-head">Come si sono mosse nelle ultime 48 ore</h3>
        <p class="lede">Sei riquadri invece di sei linee sovrapposte: così nessuna variabile
           ha bisogno di un colore suo per essere riconosciuta. Tocca quella da vedere in grande.</p>
        <div class="sparks" id="spark-row" data-testid="spark-row"></div>
        <p class="plot-title">In grande: <b id="mood-pick-name">umore</b></p>
        <div class="plot" id="mood-chart" data-testid="mood-chart"></div>
      </div>
    </div>
    <div id="health" data-testid="health" style="margin-top:1rem;display:flex;gap:.4rem;flex-wrap:wrap"></div>
    <div class="row" style="margin-top:.8rem">
      <button id="refresh" class="ghost" data-testid="refresh" style="flex:0 0 auto">Aggiorna</button>
      <button id="dream" class="ghost" data-testid="dream" style="flex:0 0 auto">Fallo sognare adesso</button>
    </div>
    <div id="stats-msg"></div>
  </section>

  <section id="volonta">
    <h2>Cosa ha deciso lui</h2>
    <p class="lede">Non le risposte: le volte in cui ha cominciato lui. Ogni riga porta la
       spinta che l'ha mosso, con le sue parole.</p>
    <div class="row" style="align-items:center;gap:.6rem">
      <button id="init-toggle" class="ghost" data-testid="init-toggle" style="flex:0 0 auto">—</button>
      <span id="init-state" data-testid="init-state" class="lede" style="margin:0"></span>
    </div>
    <div id="volition-msg"></div>
    <h3>Desideri in sospeso</h3>
    <p class="lede">Quello che si è ripromesso di dirti, e i promemoria che gli hai chiesto.</p>
    <div id="desire-list" data-testid="desire-list"></div>
    <h3>Cosa lo muove</h3>
    <p class="lede">Quante volte ogni spinta l'ha fatto cominciare. Risponde a una domanda
       che l'elenco qui sotto non risponde: è solo che si annoia, o gli manchi?</p>
    <div id="driver-chart" data-testid="driver-chart"></div>

    <h3>Le ultime iniziative</h3>
    <div id="initiative-list" data-testid="initiative-list"></div>
  </section>

  <section id="consiglio">
    <h2>Il consiglio</h2>
    <p class="lede">Una domanda a tutti quanti. Il primo giro è cieco — nessuno sente gli altri
       prima di parlare — poi si ascoltano e possono cambiare idea. Solo modelli locali:
       un consiglio non tocca il budget.</p>
    <div class="row">
      <div style="flex:1"><label for="council-q">La domanda</label>
        <input id="council-q" data-testid="council-q" placeholder="Meglio il fango o il divano?"></div>
      <button id="council-go" data-testid="council-go" style="flex:0 0 auto;align-self:end">Convoca</button>
    </div>
    <div id="council-msg"></div>
    <div id="council-out" data-testid="council-out"></div>
  </section>

  <section id="branco">
    <h2>Il branco</h2>
    <p class="lede">Chi vive qui. Il legame parte da zero e se lo guadagna col tempo.</p>
    <div class="pack" data-testid="pack-rows" id="pack-rows"></div>
    <p class="flags" style="margin-top:.8rem">Le tutele si cambiano quando vuoi. Spuntare
       <b>non ascoltare</b> (o <b>è minorenne</b>) su chi ha già un'impronta vocale la
       <b>cancella</b>: revocare un consenso non è smettere di usare un dato, è distruggerlo.</p>
    <div id="pack-msg"></div>

    <h3>Aggiungi un essere</h3>
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
      <button id="add-being" data-testid="add-being" style="flex:0 0 auto">Aggiungi</button>
    </div>
    <div id="add-msg"></div>

    <h3>Chi è chi</h3>
    <p class="flags">Le relazioni tra gli altri, vere anche senza UGO. Gli servono per capire di chi
       state parlando.</p>
    <div class="row">
      <div><label for="rel-a">Questo</label><select id="rel-a" data-testid="rel-a"></select></div>
      <div><label for="rel-type">è</label><select id="rel-type" data-testid="rel-type">
        <option value="parent_of">genitore di</option><option value="partner_of">sta con</option>
        <option value="cares_for">si prende cura di</option><option value="avoids">evita</option></select></div>
      <div><label for="rel-b">questo</label><select id="rel-b" data-testid="rel-b"></select></div>
      <button id="add-rel" data-testid="add-rel" style="flex:0 0 auto">Collega</button>
    </div>
    <ul class="plain" id="rel-list" data-testid="rel-list"></ul>
    <div id="rel-msg"></div>
  </section>

  <section id="voce">
    <h2>La voce</h2>
    <p class="lede">Dieci secondi di parlato normale, dal dock di casa. L'impronta nasce stanotte,
       nel sogno: UGO non finge di aver imparato subito.</p>
    <div class="row">
      <div><label for="enroll-being">Chi parla</label><select id="enroll-being" data-testid="enroll-being"></select></div>
      <button id="rec" data-testid="rec" style="flex:0 0 auto">● Registra 10 s</button>
    </div>
    <p class="flags">Ripeti due o tre volte in momenti diversi: il centroide è una media, e migliora
       con la varietà.</p>
    <div id="enroll-msg"></div>

    <h3>Correggilo</h3>
    <div class="row">
      <div><label for="corr-being">Su chi</label><select id="corr-being" data-testid="corr-being"></select></div>
      <div><label for="corr-signal">Cosa ha sbagliato</label><select id="corr-signal" data-testid="corr-signal">
        <option value="wrong_name">ha sbagliato nome</option><option value="too_loud">parla troppo forte</option>
        <option value="leave_alone">deve lasciare in pace</option><option value="good">ha fatto bene</option></select></div>
      <button id="add-corr" data-testid="add-corr" style="flex:0 0 auto">Diglielo</button>
    </div>
    <div id="corr-msg"></div>
  </section>

  <section id="memoria">
    <h2>Cosa ricorda</h2>
    <p class="lede">Una finestra sulla memoria, non il modo di usarla: il modo è chiedergli le cose
       parlando. Con una ricerca vedi quello che <b>lui</b> ripescherebbe.</p>
    <div class="row">
      <div><label for="mem-q">Cerca</label><input id="mem-q" data-testid="mem-q" placeholder="il corriere"></div>
      <div><label for="mem-kind">Tipo</label><select id="mem-kind" data-testid="mem-kind">
        <option value="">tutti</option><option value="fact">fatti</option>
        <option value="preference">preferenze</option><option value="episode">episodi</option>
        <option value="insight">intuizioni</option></select></div>
      <button id="mem-go" data-testid="mem-go" style="flex:0 0 auto">Guarda</button>
    </div>
    <ul class="plain" id="mem-list" data-testid="mem-list"></ul>
    <div id="mem-msg"></div>

    <h3>Come si legano</h3>
    <p class="lede">Chi parla di chi, chi è parente di chi, e cosa ha preso il posto di cosa.
       Il quadrato è una persona, il cerchio un ricordo; un cerchio vuoto è un ricordo ritirato,
       e la linea tratteggiata dice «questo ha sostituito quello».</p>
    <button id="graph-go" data-testid="graph-go" style="flex:0 0 auto">Disegna</button>
    <div id="graph-svg" data-testid="graph-svg"></div>
    <div id="graph-msg"></div>

    <h3>Riunioni</h3>
    <div class="row">
      <div><label for="meet-url">Link della call</label>
        <input id="meet-url" data-testid="meet-url" placeholder="https://meet.google.com/abc-defg-hij"></div>
      <div><label for="meet-title">Titolo</label><input id="meet-title" data-testid="meet-title" placeholder="facoltativo"></div>
      <button id="meet-join" data-testid="meet-join" style="flex:0 0 auto">Mandalo in call</button>
    </div>
    <ul class="plain" id="meet-list" data-testid="meet-list"></ul>
    <div id="meet-msg"></div>
  </section>

  <section id="conti">
    <h2>I conti</h2>
    <p class="lede">Ogni giorno ha una cifra da spendere. Quando finisce lo dice, invece di
       rispondere peggio in silenzio.</p>
    <div class="tiles" id="tiles" data-testid="stats"></div>
    <h3>Spesa degli ultimi 14 giorni</h3>
    <div class="plot" id="spend-chart" data-testid="spend-chart"></div>
    <details class="table"><summary>Vedi i numeri</summary><div id="spend-table"></div></details>
  </section>

  <section id="dati">
    <h2>I dati</h2>
    <p class="lede">Sono tuoi. Puoi portarli via tutti, o far sparire qualcuno per sempre.</p>
    <button id="export" class="ghost" data-testid="export">Scarica tutto (JSON)</button>
    <p class="flags">Il file contiene conversazioni, trascrizioni, ricordi e diario <b>in chiaro</b>.
       Le impronte vocali no: un export è testo leggibile, e un'impronta in chiaro è ciò che la
       cifratura esiste per impedire.</p>

    <h3>Far dimenticare qualcuno</h3>
    <div class="row">
      <div><label for="forget-being">Chi</label><select id="forget-being" data-testid="forget-being"></select></div>
      <div><label for="forget-confirm">Scrivi DIMENTICA per confermare</label>
        <input id="forget-confirm" data-testid="forget-confirm" autocomplete="off"></div>
      <button id="forget" data-testid="forget" style="flex:0 0 auto">Dimentica</button>
    </div>
    <p class="flags">Irreversibile. Il nome sparisce da tutta la biografia — anche dalle frasi degli
       altri — i ricordi vengono riscritti e ricalcolati, e l'impronta vocale è distrutta.</p>
    <div id="forget-msg"></div>
  </section>
</div>
</div>
<script src="/admin/panel.js"></script>
</body>
</html>`;
