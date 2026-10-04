/**
 * Le cose che segue (ADR-133): quello che hai detto di voler sapere, fare o
 * temere, e che UGO tiene d'occhio nel mondo. Le capisce da come parli; qui
 * si vedono, si aggiungono e si dimenticano.
 */
export const WATCH_PAGES = `
<section class="page" data-page="segue">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Le cose che segue</h1>
    <p>Quando gli dici una curiosità, un progetto o una preoccupazione («voglio andare in Uganda a
       febbraio»), la notte UGO se la segna. Poi guarda le novità dei tuoi feed e, se lo permetti, il
       web: quando esce qualcosa che c'entra davvero, la mattina te lo dice, col link alla fonte.
       Al massimo una cosa al giorno.</p>
  </div>
  <div class="block">
    <h2>Cerca anche sul web</h2>
    <p class="lede">Una volta a settimana per ogni cosa seguita, le sue ricerche vanno ai motori di
       ricerca (SearXNG), senza il tuo nome. È l'unico momento in cui il tema esce di casa.</p>
    <div class="row" id="watch-web"></div>
  </div>
  <div class="block">
    <h2>Cosa segue</h2>
    <div id="watch-list" data-testid="watch-list"></div>
  </div>
  <div class="block">
    <h2>Aggiungine una</h2>
    <div class="row">
      <div style="flex:2 1 16rem"><label for="watch-subject">Cosa</label>
        <input id="watch-subject" data-testid="watch-subject" maxlength="200" placeholder="es. il viaggio in Uganda a febbraio"></div>
      <div style="flex:1 1 9rem"><label for="watch-kind">Di che tipo</label>
        <select id="watch-kind" data-testid="watch-kind">
          <option value="curiosita">curiosità</option>
          <option value="progetto">progetto</option>
          <option value="preoccupazione">preoccupazione</option>
        </select></div>
      <div style="flex:1 1 9rem"><label for="watch-gosino">Chi la segue</label>
        <select id="watch-gosino" data-testid="watch-gosino"></select></div>
      <div style="flex:0 1 7rem"><label for="watch-days">Per giorni</label>
        <input id="watch-days" data-testid="watch-days" type="number" min="7" max="365" value="90"></div>
      <button id="watch-add" data-testid="watch-add">Seguila</button>
    </div>
  </div>
  <div class="block">
    <h2>Cosa ha trovato</h2>
    <div id="watch-finds" data-testid="watch-finds"></div>
  </div>
  <div id="watch-msg"></div>
</section>
`;
