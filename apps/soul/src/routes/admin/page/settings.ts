/**
 * Impostazioni → AI (ADR-122, ADR-130): con che testa pensa UGO.
 *
 * La pagina risponde a tre domande, in quest'ordine: **con quali chiavi**
 * (della casa, o di UGO a consumo), **quale modello per ogni lavoro** (dalla
 * lista del provider, mai scritto a mano), **quanto sta costando** oggi.
 * Le righe di chiavi e ruoli le disegna lo script: dipendono da cosa offre
 * questa installazione.
 */
export const SETTINGS_PAGES = `
<div class="nudge" id="ai-nudge" data-testid="ai-nudge" hidden>
  <b>UGO non ha ancora una testa per parlare.</b>
  Scegli un modello per la conversazione in <a href="#/ai" data-nav-link="ai">Impostazioni AI</a>:
  con una tua chiave Anthropic o OpenRouter, oppure con le chiavi UGO a consumo.
</div>

<section class="page" data-page="ai">
  <div class="page-head">
    <p class="eyebrow" data-account>—</p>
    <h1>La testa di UGO</h1>
    <p>Il carattere, i ricordi e l'umore sono di UGO e restano qui. <b>Il modello che lo fa
       parlare lo scegli tu</b>, lavoro per lavoro: con <b>una tua chiave</b> (paghi il
       provider direttamente) o con le <b>chiavi UGO</b>, a consumo sul credito.</p>
  </div>

  <div class="block">
    <h2>Oggi</h2>
    <div class="tiles" id="ai-today" data-testid="ai-today"></div>
  </div>

  <div class="block">
    <h2>Le tue chiavi</h2>
    <p class="lede">Si provano prima di salvarle, si conservano cifrate con la chiave del tuo
       account e non si rileggono più: qui vedi solo le ultime quattro cifre.</p>
    <div id="ai-keys" data-testid="ai-keys"></div>
  </div>

  <div class="block">
    <h2>Un modello per ogni lavoro</h2>
    <p class="lede">La <b>conversazione</b> vuole un modello veloce; il <b>pensiero</b> (il
       sogno, la ruminazione, il consiglio) può essere più lento e più profondo; gli
       <b>occhi</b> vogliono un modello che veda le immagini; il <b>giudice</b> decide se UGO
       sa davvero una cosa, e basta uno piccolo. <b>Voce</b> e <b>orecchie</b> sono facoltative:
       senza, il muso usa quelle del browser.</p>
    <p class="lede">Con voce e orecchie scelte qui, <b>l'audio di casa va al provider che hai
       scelto</b>: è una scelta tua, e la puoi togliere quando vuoi.</p>
    <div id="ai-roles" data-testid="ai-roles"></div>
  </div>
  <div id="ai-msg"></div>
</section>
`;
