/**
 * Accessi e dispositivi (ADR-121, ADR-124), e l'accoglienza di chi è appena
 * entrato. Una pagina per le tre cose che riguardano CHI entra in casa: i
 * browser collegati, i musi abbinati, e la porta d'uscita definitiva.
 */
export const ACCESS_PAGES = `
<section class="page" data-page="benvenuto">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Benvenuto a casa</h1>
    <p>La casa c'è. Tre passi e UGO è dei vostri: l'ordine conta poco, ma il primo serve a
       tutti gli altri.</p>
  </div>
  <ol class="steps" data-testid="welcome-steps">
    <li class="block"><h2>Dagli una testa</h2>
      <p class="lede">Scegli con quale modello pensa e parla: con una tua chiave Anthropic o
         OpenRouter, oppure con le chiavi UGO a consumo.</p>
      <p><a class="btn-link" href="#/ai" data-nav-link="ai">Apri «La testa di UGO»</a></p></li>
    <li class="block"><h2>Scegli il tuo gosino</h2>
      <p class="lede">Non si crea: si adotta, fra i cuccioli nati negli allevamenti. Guarda la
         vetrina e prenota quello che ti somiglia.</p>
      <p><a class="btn-link" href="/vetrina">Apri la vetrina</a></p></li>
    <li class="block"><h2>Dagli un muso</h2>
      <p class="lede">Un tablet o un vecchio telefono diventa il suo corpo. Aprilo su
         <code id="welcome-face-url">/muso/</code> e abbinalo col codice che trovi in
         <a href="#/accessi" data-nav-link="accessi">Accessi e dispositivi</a>.</p></li>
  </ol>
</section>

<section class="page" data-page="accessi">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>Accessi e dispositivi</h1>
    <p>Chi entra in <b data-account>—</b>: i browser con cui hai fatto l'accesso e i musi che
       hai abbinato. Ognuno si chiude da qui, senza toccare gli altri.</p>
  </div>

  <div class="block">
    <h2>I browser collegati</h2>
    <p class="lede">Una sessione dura trenta giorni dall'ultima volta che la usi. Se non
       riconosci un dispositivo, chiudilo.</p>
    <div id="access-sessions" data-testid="access-sessions"></div>
  </div>

  <div class="block">
    <h2>Abbina un muso</h2>
    <p class="lede">Apri <code id="access-face-url">/muso/</code> sul dispositivo che farà da
       corpo: ti chiederà sei cifre. Il codice vale dieci minuti e una volta sola; il muso
       abbinato compare fra le chiavi in <a href="#/giornale" data-nav-link="giornale">Il
       giornale</a>, da dove lo puoi revocare.</p>
    <div class="row">
      <div style="flex:1 1 12rem"><label for="pair-name">Dove sta</label>
        <input id="pair-name" type="text" maxlength="40" placeholder="cucina" data-testid="pair-name"></div>
      <button id="pair-make" data-testid="pair-make">Dammi il codice</button>
    </div>
    <p class="pair-code" id="pair-code" data-testid="pair-code" aria-live="polite"></p>
  </div>

  <div class="block danger">
    <h2>Chiudi la casa</h2>
    <p class="lede">Non si torna indietro. Distruggiamo la chiave della casa: ricordi, messaggi
       e trascrizioni diventano illeggibili per sempre, la tua email viene cancellata, ogni
       accesso e ogni muso smettono di funzionare. Se vuoi tenerti una copia, prima scarica i
       dati da <a href="#/dati" data-nav-link="dati">I dati</a>.</p>
    <label for="close-confirm">Per confermare scrivi il nome della casa: <code id="close-slug">—</code></label>
    <div class="row">
      <input id="close-confirm" type="text" autocomplete="off" data-testid="close-confirm">
      <button id="close-account" class="danger" data-testid="close-account">Chiudi per sempre</button>
    </div>
  </div>
  <div id="access-msg"></div>
</section>
`;

export const ACCESS_STYLES = `
.steps { list-style: none; padding: 0; margin: 0; counter-reset: step; }
.steps > li { counter-increment: step; position: relative; padding-left: 3.4rem; }
.steps > li::before { content: counter(step); position: absolute; left: 1rem; top: 1.1rem;
  width: 1.8rem; height: 1.8rem; border-radius: 50%; background: var(--accent); color: var(--on-accent);
  display: grid; place-items: center; font-weight: 700; }
.btn-link { display: inline-block; font-weight: 700; padding: .55rem 1rem; border-radius: var(--r);
  background: var(--accent-soft); color: var(--ink); text-decoration: none; }
.pair-code { font: 700 2.4rem/1.2 var(--font-mono); letter-spacing: .3em; color: var(--ink); margin: .8rem 0 0; }
.block.danger { border-color: var(--critical); }
button.danger { background: transparent; color: var(--critical); border: 1px solid var(--critical); }
`;
