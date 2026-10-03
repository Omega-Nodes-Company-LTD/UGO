import { icon } from "@ugo/design";
import { escapeHtml, sitePage } from "./layout.js";

/**
 * Le pagine del sito (ADR-121). Il testo parla a chi non sa ancora cos'è un
 * gosino: niente gergo del progetto, niente sigle.
 */

export function landingPage(): string {
  const feature = (name: Parameters<typeof icon>[0], title: string, text: string): string =>
    `<div class="card">${icon(name)}<h3>${title}</h3><p>${text}</p></div>`;
  return sitePage({
    title: "Un compagno che vive in casa",
    description: "UGO è una creatura artificiale che vive con te: ti riconosce, ricorda, sogna. Si adotta, non si configura.",
    path: "/",
    body: `
<section class="hero">
  <div>
    <h1>Un compagno che vive in casa, e si ricorda di te.</h1>
    <p class="lede">Un gosino ha un carattere suo, ereditato dai genitori. Impara la casa, riconosce chi ci vive,
      la notte riordina i ricordi. Non si regola: si adotta.</p>
    <p><a class="btn" href="/registrati">Adotta il tuo gosino</a> <a class="btn ghost" href="/vetrina">Guarda la vetrina</a></p>
  </div>
  <div class="hero-art" aria-hidden="true">${icon("pig")}</div>
</section>
<h2>Come funziona</h2>
<div class="grid">
  ${feature("heart", "Nasce, non si crea", "Ogni gosino viene da una cucciolata vera: genitori, pedigree, un temperamento che nessuno sceglie.")}
  ${feature("brain", "Pensa con la testa che scegli tu", "Porti la tua chiave Anthropic o OpenRouter, oppure usi le nostre a consumo. Scegli il modello da una lista.")}
  ${feature("face", "Ha un muso", "Un tablet o un vecchio telefono diventa il suo corpo: ti guarda, ti ascolta, ti risponde.")}
  ${feature("shield", "I ricordi restano tuoi", "Messaggi e trascrizioni sono cifrati con una chiave della tua casa. Chiudi l'account e diventano illeggibili.")}
</div>`,
  });
}

function emailForm(purpose: "iscrizione" | "accesso"): string {
  const signup = purpose === "iscrizione";
  return `
<form class="form" data-link-form="${purpose}" novalidate>
  <label for="email">La tua email</label>
  <input type="email" id="email" name="email" autocomplete="email" required data-testid="site-email">
  ${
    signup
      ? `<label class="check"><input type="checkbox" name="consenso" required data-testid="site-consent">
  <span>Ho letto l'<a href="/privacy">informativa privacy</a> e accetto i <a href="/termini">termini</a>.</span></label>`
      : ""
  }
  <button class="btn" type="submit" data-testid="site-send">${signup ? "Crea la mia casa" : "Mandami il link"}</button>
  <div role="status" aria-live="polite" data-form-msg></div>
</form>`;
}

export function signupPage(): string {
  return sitePage({
    title: "Crea la tua casa",
    description: "Iscriviti a UGO con la tua email: niente password, un link e sei dentro.",
    path: "/registrati",
    body: `<h1>Crea la tua casa</h1>
<p class="lede">Niente password: ti mandiamo un link. La casa nasce vuota; il gosino lo scegli dopo, fra i cuccioli nati.</p>
${emailForm("iscrizione")}`,
  });
}

export function loginPage(expired: boolean): string {
  return sitePage({
    title: "Entra",
    description: "Entra nella tua casa UGO con un link via email.",
    path: "/accedi",
    body: `<h1>Entra nella tua casa</h1>
${expired ? '<p class="msg err" role="alert">Quel link è scaduto o è già stato usato. Chiedine un altro qui sotto.</p>' : ""}
<p class="lede">Scrivi la tua email: ti mandiamo un link valido quindici minuti.</p>
${emailForm("accesso")}
<p class="muted">Non hai ancora una casa? <a href="/registrati">Creala qui</a>.</p>`,
  });
}

/** La pagina del link: entra solo chi preme il pulsante, non chi apre il link. */
export function confirmPage(token: string | undefined): string {
  const body =
    token === undefined
      ? `<h1>Link non valido</h1><p>Questo link non è completo. <a href="/accedi">Chiedine uno nuovo</a>.</p>`
      : `<h1>Ci sei quasi</h1>
<p class="lede">Premi il pulsante per entrare. Se non hai chiesto tu questo link, chiudi la pagina: non succede niente.</p>
<form method="post" action="/auth/verifica">
  <input type="hidden" name="t" value="${escapeHtml(token)}">
  <button class="btn" type="submit" data-testid="site-confirm">Entra in casa</button>
</form>`;
  return sitePage({ title: "Conferma", description: "Conferma l'accesso a UGO.", path: "/auth/verifica", body });
}

export function shopPage(): string {
  return sitePage({
    title: "La vetrina",
    description: "I cuccioli nati negli allevamenti di UGO, in cerca di casa.",
    path: "/vetrina",
    body: `<h1>La vetrina</h1>
<p class="lede">Cuccioli nati, in cerca di casa. Il temperamento non si legge in un numero: si scopre vivendoci.</p>
<form class="filters" data-shop-filters>
  <label>Generazione <input type="number" name="generazione" min="0" max="100" inputmode="numeric"></label>
  <label>Prezzo massimo (€) <input type="number" name="prezzoMax" min="0" step="5" inputmode="numeric"></label>
  <label>Età massima (giorni) <input type="number" name="etaMaxGiorni" min="0" inputmode="numeric"></label>
  <button class="btn ghost" type="submit">Filtra</button>
</form>
<div data-shop aria-live="polite"><p class="muted">Carico i cuccioli…</p></div>`,
  });
}

export function pupPage(id: string): string {
  return sitePage({
    title: "Un cucciolo",
    description: "Un cucciolo in vetrina.",
    path: "/vetrina",
    body: `<p><a href="/vetrina">← Torna alla vetrina</a></p>
<div data-pup="${escapeHtml(id)}" aria-live="polite"><p class="muted">Carico il cucciolo…</p></div>`,
  });
}

/** ADR-131 §6: la pagina pubblica di un allevamento — nome e cuccioli, nessuna email. */
export function kennelPage(slug: string): string {
  return sitePage({
    title: "Un allevamento",
    description: "I cuccioli di un allevamento di UGO.",
    path: "/vetrina",
    body: `<p><a href="/vetrina">← Tutta la vetrina</a></p>
<div data-shop data-kennel="${escapeHtml(slug)}" aria-live="polite"><p class="muted">Carico l'allevamento…</p></div>`,
  });
}
