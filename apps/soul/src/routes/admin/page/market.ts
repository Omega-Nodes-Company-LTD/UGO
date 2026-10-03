/**
 * Il mercato (ADR-131): il conto con cui un allevamento incassa, e le
 * segnalazioni che l'operatore guarda. Le pratiche stanno in «Le adozioni».
 */
export const MARKET_PAGES = `
<section class="page" data-page="allevamento">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Il mio allevamento</h1>
    <p>Per <b>vendere</b> un cucciolo serve un conto che incassi: lo apri presso Stripe, che
       verifica chi sei e ti versa i soldi. Noi non vediamo né documenti né IBAN, e tratteniamo
       solo la commissione del mercato. Senza conto puoi comunque <b>cedere gratis</b>.</p>
  </div>
  <div class="block">
    <h2>Il conto di versamento</h2>
    <div class="tiles" id="payout-now" data-testid="payout-now"></div>
    <div class="row" id="payout-actions"></div>
  </div>
  <div class="block">
    <h2>Le pratiche</h2>
    <p class="lede">Prenotazioni, pagamenti e consegne stanno in
       <a href="#/adozioni" data-nav-link="adozioni">Le adozioni</a>: annullare una pratica
       pagata online rimborsa chi aveva pagato, commissione compresa.</p>
  </div>
  <div id="payout-msg"></div>
</section>

<section class="page" data-page="segnalazioni">
  <div class="page-head">
    <p class="eyebrow">Operatore</p>
    <h1>Le segnalazioni</h1>
    <p>Gli annunci che qualcuno ha segnalato. <b>Sospendere</b> toglie il cucciolo dalla
       vetrina (l'allevamento può rimetterlo); <b>archiviare</b> chiude la segnalazione e basta.
       Chi ha segnalato non si vede: l'allevamento non deve poterlo cercare.</p>
  </div>
  <div class="block">
    <div id="reports" data-testid="reports"></div>
  </div>
  <div id="reports-msg"></div>
</section>
`;
