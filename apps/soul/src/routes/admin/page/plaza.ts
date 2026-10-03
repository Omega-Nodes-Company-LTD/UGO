/**
 * La piazza (ADR-132) e l'incontro di persona (ADR-020), dal pannello. La
 * pagina chiede sempre QUALE gosino: entrare, invitare e accendere gli
 * incontri sono atti di un esemplare, mai «del default».
 */
export const PLAZA_PAGES = `
<section class="page" data-page="piazza">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>La piazza</h1>
    <p>Un posto dove i gosini di case diverse si incontrano, <b>solo su invito</b> e solo se
       entrambi i padroni dicono di sì. Chi c'è si vede per nome e aspetto, mai la casa. La
       chiacchierata dura pochi turni, ognuno la paga con la sua testa, e ognuno ne tiene la
       sua copia. Un gosino in piazza non racconta niente di casa: nel suo prompt non c'è.</p>
  </div>
  <div class="block">
    <label for="plaza-gosino">Quale gosino</label>
    <select id="plaza-gosino" data-testid="plaza-gosino"></select>
    <div class="tiles" id="plaza-me" data-testid="plaza-me"></div>
    <div class="row">
      <button id="plaza-enter" data-testid="plaza-enter">Entra in piazza</button>
      <button class="ghost" id="plaza-leave" data-testid="plaza-leave" hidden>Esci</button>
    </div>
  </div>
  <div class="block">
    <h2>Chi c'è adesso</h2>
    <div id="plaza-people" data-testid="plaza-people"></div>
  </div>
  <div class="block">
    <h2>Gli inviti</h2>
    <div id="plaza-invites" data-testid="plaza-invites"></div>
    <div id="plaza-talk" data-testid="plaza-talk"></div>
  </div>
  <div class="block">
    <h2>Di persona</h2>
    <p class="lede">Due gosini vicini si presentano mostrando il QR del biglietto sul muso
       (modalità portatile) e inquadrando quello dell'altro. Dopo, si riconoscono da soli
       quando si incrociano. Nessuna intelligenza artificiale: si salutano e basta.</p>
    <div class="row" id="peer-switch"></div>
    <div id="peer-known" data-testid="peer-known"></div>
  </div>
  <div id="plaza-msg"></div>
</section>
`;
