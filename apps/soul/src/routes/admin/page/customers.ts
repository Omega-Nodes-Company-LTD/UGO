/**
 * The customers page (ADR-052): the house side of the reception. One page,
 * two layers — the list, and the selected customer's detail. The detail's
 * skeleton is static (script.test.ts wires every id the script reaches for);
 * the script only fills the containers and toggles visibility.
 */
export const CUSTOMER_PAGES = `
<section class="page" data-page="clienti">
  <div class="page-head">
    <p class="eyebrow">La casa</p>
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
      <button id="cust-limits" data-testid="cust-limits">Salva i limiti</button>
    </div>

    <h3>I token</h3>
    <div id="cust-tokens"></div>
    <div class="row" style="margin-top:.5rem">
      <div><label for="cust-token-label">Per cosa è</label>
        <input id="cust-token-label" data-testid="cust-token-label" placeholder="portale di Rossi SRL" maxlength="120"></div>
      <button id="cust-token-go" data-testid="cust-token-go">Emetti un token</button>
    </div>

    <h3>Le richieste</h3>
    <div id="cust-tickets"></div>

    <div id="cust-stats"></div>

    <div class="row" style="margin-top:.9rem">
      <button id="cust-archive" class="ghost" data-testid="cust-archive"></button>
    </div>
    <div id="cust-detail-msg"></div>
  </div>
</section>
`;
