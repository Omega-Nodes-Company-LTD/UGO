/**
 * The operator panel (served at /admin). No build step, no dependencies: it is
 * a single page that talks to the same guarded routes an operator would
 * otherwise curl by hand. Registering a being or teaching UGO a voice must not
 * require reading a runbook with a terminal open.
 *
 * The operator token lives in sessionStorage: typed once, gone when the tab
 * closes. It is never put in a URL, so it cannot leak through history or logs.
 */
export const ADMIN_PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UGO — pannello</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 0 auto; padding: 1rem 1rem 4rem; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  section { border: 1px solid #8884; border-radius: .6rem; padding: 1rem; margin-top: 1rem; }
  label { display: block; margin: .5rem 0 .15rem; font-size: .85rem; opacity: .8; }
  input, select, button { font: inherit; padding: .45rem .55rem; border-radius: .4rem; border: 1px solid #8886; }
  button { cursor: pointer; background: #7a3030; color: #fff; border-color: #7a3030; }
  button.ghost { background: transparent; color: inherit; border-color: #8886; }
  button[disabled] { opacity: .5; cursor: not-allowed; }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: flex-end; }
  .row > div { flex: 1 1 9rem; } .row > div > input, .row > div > select { width: 100%; }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; font-size: .9rem; }
  th, td { text-align: left; padding: .35rem .4rem; border-bottom: 1px solid #8883; }
  .flags { font-size: .75rem; opacity: .75; }
  .msg { margin-top: .75rem; padding: .6rem .7rem; border-radius: .4rem; font-size: .9rem; }
  .ok { background: #2e7d3222; } .err { background: #c6282822; } .info { background: #8882; }
  .stat { display: inline-block; margin-right: 1.5rem; }
  .stat b { display: block; font-size: 1.2rem; }
  .rec { color: #c62828; font-weight: 700; }
</style>
</head>
<body>
<h1>UGO 🐷 <small style="opacity:.6">pannello</small></h1>

<section id="auth">
  <h2>Accesso</h2>
  <p style="font-size:.9rem;opacity:.8">Incolla il token operatore (<code>UGO_INTERNAL_TOKEN</code>).
     Resta solo in questa scheda: chiudendola sparisce.</p>
  <div class="row">
    <div><input type="password" id="token" data-testid="token" placeholder="token operatore" autocomplete="off"></div>
    <button id="save-token" data-testid="save-token">Entra</button>
  </div>
  <div id="auth-msg"></div>
</section>

<div id="app" hidden>
  <section>
    <h2>Il branco</h2>
    <table id="pack"><thead><tr><th>Nome</th><th>Specie</th><th>Legame</th><th>Voce</th><th>Tutele</th><th></th></tr></thead>
      <tbody data-testid="pack-rows"></tbody></table>
    <p class="flags">Le tutele si possono cambiare in qualunque momento. Spuntare <b>non ascoltare</b>
       (o <b>è minorenne</b>) su chi ha già un'impronta vocale la <b>cancella</b>: revocare il consenso
       non è smettere di usare un dato, è distruggerlo.</p>
    <div id="pack-msg"></div>
  </section>

  <section>
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
    <div class="row" style="margin-top:.6rem">
      <label style="flex:0 0 auto"><input type="checkbox" id="minor" data-testid="being-minor"> è minorenne</label>
      <label style="flex:0 0 auto"><input type="checkbox" id="no-audio" data-testid="being-noaudio"> non ascoltare</label>
      <label style="flex:0 0 auto"><input type="checkbox" id="no-vision" data-testid="being-novision"> non guardare</label>
      <button id="add-being" data-testid="add-being" style="flex:0 0 auto">Aggiungi</button>
    </div>
    <p class="flags">Se spunti <b>è minorenne</b> UGO non costruirà mai un'impronta della sua voce:
       lo riconoscerà solo se glielo dici tu. Vale anche per <b>non ascoltare</b>.</p>
    <div id="add-msg"></div>
  </section>

  <section>
    <h2>Chi è chi</h2>
    <p class="flags">Le relazioni tra gli altri, che esistono anche senza UGO. Gli servono per capire
       di chi state parlando.</p>
    <div class="row">
      <div><label for="rel-a">Questo</label><select id="rel-a" data-testid="rel-a"></select></div>
      <div><label for="rel-type">è</label><select id="rel-type" data-testid="rel-type">
        <option value="parent_of">genitore di</option>
        <option value="partner_of">sta con</option>
        <option value="cares_for">si prende cura di</option>
        <option value="avoids">evita</option></select></div>
      <div><label for="rel-b">questo</label><select id="rel-b" data-testid="rel-b"></select></div>
      <button id="add-rel" data-testid="add-rel" style="flex:0 0 auto">Collega</button>
    </div>
    <ul id="rel-list" data-testid="rel-list" style="font-size:.9rem"></ul>
    <div id="rel-msg"></div>
  </section>

  <section>
    <h2>Insegnagli una voce</h2>
    <div class="row">
      <div><label for="enroll-being">Chi parla</label><select id="enroll-being" data-testid="enroll-being"></select></div>
      <button id="rec" data-testid="rec" style="flex:0 0 auto">● Registra 10 s</button>
    </div>
    <p class="flags">Falla dal dock di casa, con la persona che parla normalmente. Ripeti due o tre
       volte in momenti diversi: l'impronta migliora con la varietà. L'impronta nasce stanotte, nel sogno.</p>
    <div id="enroll-msg"></div>
  </section>

  <section>
    <h2>Correggilo</h2>
    <div class="row">
      <div><label for="corr-being">Su chi</label><select id="corr-being" data-testid="corr-being"></select></div>
      <div><label for="corr-signal">Cosa ha sbagliato</label><select id="corr-signal" data-testid="corr-signal">
        <option value="wrong_name">ha sbagliato nome</option>
        <option value="too_loud">parla troppo forte</option>
        <option value="leave_alone">deve lasciare in pace</option>
        <option value="good">ha fatto bene</option></select></div>
      <button id="add-corr" data-testid="add-corr" style="flex:0 0 auto">Diglielo</button>
    </div>
    <div id="corr-msg"></div>
  </section>

  <section>
    <h2>I dati</h2>
    <div class="row">
      <button id="export" class="ghost" data-testid="export" style="flex:0 0 auto">Scarica tutto (JSON)</button>
    </div>
    <p class="flags">Il file contiene conversazioni, trascrizioni, ricordi e diario <b>in chiaro</b>.
       Le impronte vocali no: un file di export è testo leggibile, e un'impronta in chiaro è ciò che la
       cifratura esiste per impedire.</p>
    <h3 style="font-size:.95rem;margin-top:1.5rem">Far dimenticare qualcuno</h3>
    <div class="row">
      <div><label for="forget-being">Chi</label><select id="forget-being" data-testid="forget-being"></select></div>
      <div><label for="forget-confirm">Scrivi <code>DIMENTICA</code> per confermare</label>
        <input id="forget-confirm" data-testid="forget-confirm" autocomplete="off"></div>
      <button id="forget" data-testid="forget" style="flex:0 0 auto">Dimentica</button>
    </div>
    <p class="flags">Irreversibile. Il nome sparisce da tutta la biografia — anche dalle frasi degli
       altri — i ricordi vengono riscritti e ricalcolati, e l'impronta vocale è distrutta. Non c'è
       cestino: si torna indietro solo da un backup precedente.</p>
    <div id="forget-msg"></div>
  </section>

  <section>
    <h2>Come sta</h2>
    <div id="stats" data-testid="stats"></div>
    <div id="health" data-testid="health" style="margin-top:.8rem;font-size:.9rem"></div>
    <div class="row" style="margin-top:.8rem">
      <button id="refresh" class="ghost" data-testid="refresh" style="flex:0 0 auto">Aggiorna</button>
      <button id="dream" class="ghost" data-testid="dream" style="flex:0 0 auto">Fallo sognare adesso</button>
    </div>
    <div id="stats-msg"></div>
  </section>
</div>
<script src="/admin/panel.js"></script>
</body>
</html>`;
