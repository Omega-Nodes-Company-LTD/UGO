/**
 * Abbonamento e credito (ADR-125, ADR-130). Le righe le disegna lo script: il
 * piano, le vie di pagamento e i movimenti dipendono da questa installazione.
 */
export const BILLING_PAGES = `
<section class="page" data-page="abbonamento">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Abbonamento</h1>
    <p>Cosa può fare <b data-account>—</b>. Un piano che scende <b>non cancella niente</b>:
       i gosini e le stanze restano, si fermano solo le cose nuove.</p>
  </div>
  <div class="block">
    <h2>Adesso</h2>
    <div class="tiles" id="plan-now" data-testid="plan-now"></div>
    <div class="row" id="plan-manage"></div>
  </div>
  <div class="block">
    <h2>I piani</h2>
    <div class="plans" id="plan-cards" data-testid="plan-cards"></div>
  </div>
  <div id="plan-msg"></div>
</section>

<section class="page" data-page="credito">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Il credito</h1>
    <p>Serve solo per le <b>chiavi UGO a consumo</b> (Impostazioni → La testa di UGO): con
       le tue chiavi paghi il provider direttamente, e il credito non si tocca.</p>
  </div>
  <div class="block">
    <h2>Saldo</h2>
    <div class="tiles" id="credit-now" data-testid="credit-now"></div>
    <div class="row">
      <div style="flex:0 1 9rem"><label for="topup-euro">Ricarica (€)</label>
        <input id="topup-euro" type="number" min="5" max="500" step="5" value="10" data-testid="topup-euro"></div>
      <button id="topup-stripe" data-testid="topup-stripe">Ricarica con carta</button>
      <button id="topup-paypal" class="ghost" data-testid="topup-paypal">Ricarica con PayPal</button>
    </div>
  </div>
  <div class="block">
    <h2>Ricarica automatica</h2>
    <p class="lede">Quando il saldo scende sotto la soglia, ricarichiamo l'importo scelto sul
       metodo salvato con l'ultima ricarica a mano — mai oltre il tetto del mese. Se la banca
       dice di no, la spegniamo e ti scriviamo.</p>
    <p id="auto-state" data-testid="auto-state"></p>
    <div class="row">
      <label class="check"><input type="checkbox" id="auto-on" data-testid="auto-on"> attiva</label>
      <div style="flex:0 1 8rem"><label for="auto-threshold">Sotto (€)</label>
        <input id="auto-threshold" type="number" min="0" max="100" step="1"></div>
      <div style="flex:0 1 8rem"><label for="auto-amount">Ricarica (€)</label>
        <input id="auto-amount" type="number" min="5" max="200" step="5"></div>
      <div style="flex:0 1 8rem"><label for="auto-cap">Al mese al massimo (€)</label>
        <input id="auto-cap" type="number" min="5" max="1000" step="5"></div>
      <button id="auto-save" data-testid="auto-save">Salva</button>
    </div>
  </div>
  <div class="block">
    <h2>Movimenti</h2>
    <div id="credit-moves" data-testid="credit-moves"></div>
  </div>
  <div id="credit-msg"></div>
</section>
`;

export const BILLING_STYLES = `
.plans { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
.plan { border: 1px solid var(--line); border-radius: var(--r-lg); padding: 1rem 1.1rem; background: var(--surface); }
.plan.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.plan h3 { margin: 0 0 .4rem; }
.plan ul { margin: .4rem 0 .8rem; padding-left: 1.1rem; }
.plan li { margin: .2rem 0; }
/* una voce che il piano non apre: si vede, e dice dove si apre */
.rail a.locked::after { content: "Pro"; margin-left: auto; font-size: var(--text-xs); font-weight: 700;
  color: var(--accent); border: 1px solid var(--accent); border-radius: var(--r-pill); padding: 0 .4rem; }
.plan li.no { color: var(--ink-3); text-decoration: line-through; }
`;
