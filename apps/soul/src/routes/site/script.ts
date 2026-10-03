/**
 * Lo script del sito (ADR-121): un file esterno, perché la CSP non ammette
 * script inline. Due compiti: mandare il form dell'email e disegnare la
 * vetrina da `GET /v1/vetrina`. Tutto il testo che arriva dal server passa da
 * `textContent`, mai da `innerHTML`.
 */
export const SITE_JS = `
"use strict";

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (key === "text") node.textContent = value; else node.setAttribute(key, value);
  }
  for (const child of children ?? []) node.appendChild(child);
  return node;
}

function say(box, text, kind) {
  box.replaceChildren(el("p", { class: "msg " + kind, text }));
}

for (const form of document.querySelectorAll("[data-link-form]")) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = form.querySelector("[data-form-msg]");
    const email = form.querySelector('input[name="email"]').value.trim();
    const consent = form.querySelector('input[name="consenso"]');
    if (email === "" || !email.includes("@")) { say(box, "Scrivi un indirizzo email valido.", "err"); return; }
    if (consent && !consent.checked) { say(box, "Per creare la casa accetta termini e informativa.", "err"); return; }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const res = await fetch("/v1/auth/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, scopo: form.dataset.linkForm, ...(consent && { consenso: true }) }),
      });
      if (res.status === 202) {
        say(box, "Fatto: controlla la posta. Il link vale quindici minuti.", "ok");
        form.querySelector('input[name="email"]').value = "";
      } else if (res.status === 429) {
        say(box, "Troppe richieste. Riprova fra un quarto d'ora.", "err");
      } else {
        const body = await res.json().catch(() => ({}));
        say(box, body.detail ?? "Qualcosa non è andato. Riprova.", "err");
      }
    } catch {
      say(box, "Non riesco a raggiungere UGO. Controlla la connessione.", "err");
    } finally {
      button.disabled = false;
    }
  });
}

const euro = (cents) => cents === null ? "prezzo da concordare"
  : cents === 0 ? "in adozione gratuita" : "\\u20AC " + (cents / 100).toFixed(2).replace(".", ",");
const age = (days) => days < 1 ? "nato oggi" : days === 1 ? "un giorno" : days + " giorni";

function cubCard(kennel, cub) {
  return el("article", { class: "card pup", "data-testid": "shop-cub" }, [
    el("h3", {}, [el("a", { href: "/vetrina/" + encodeURIComponent(cub.gosinoId), text: cub.name })]),
    el("p", { text: cub.persona }),
    el("p", { class: "muted" }, [
      document.createTextNode("Generazione " + cub.generation + " · " + age(cub.ageDays) + " · "),
      el("a", { href: "/allevamenti/" + encodeURIComponent(kennel.slug), text: kennel.name }),
    ]),
    el("p", { class: "price", text: euro(cub.priceCents) }),
  ]);
}

/** I filtri del form diventano la query della vetrina; i prezzi in euro diventano centesimi. */
function shopQuery() {
  const params = new URLSearchParams();
  const box = document.querySelector("[data-shop]");
  if (box?.dataset.kennel) params.set("allevamento", box.dataset.kennel);
  const form = document.querySelector("[data-shop-filters]");
  for (const input of form ? form.querySelectorAll("input") : []) {
    if (input.value === "") continue;
    params.set(input.name, input.name === "prezzoMax" ? String(Math.round(Number(input.value) * 100)) : input.value);
  }
  const query = params.toString();
  return "/v1/vetrina" + (query === "" ? "" : "?" + query);
}

async function showPedigree(box, id) {
  try {
    const res = await fetch("/v1/vetrina/" + encodeURIComponent(id) + "/pedigree");
    if (!res.ok) return;
    const { pedigree } = await res.json();
    const ancestors = pedigree.filter((node) => node.id !== id);
    if (ancestors.length === 0) return;
    box.appendChild(el("h2", { text: "Da chi discende" }));
    box.appendChild(el("ul", { class: "tree" }, ancestors.map((node) =>
      el("li", { text: node.name + " · generazione " + node.generation }))));
  } catch { /* il pedigree è un di più: la scheda vale anche senza */ }
}

async function report(box, id) {
  const reason = box.querySelector('select[name="motivo"]').value;
  const res = await fetch("/v1/vetrina/" + encodeURIComponent(id) + "/segnala", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motivo: reason }),
  });
  const out = box.querySelector("[data-report-msg]");
  if (res.status === 201) say(out, "Grazie: la guardiamo noi. L'allevamento non sa chi l'ha segnalato.", "ok");
  else if (res.status === 401) say(out, "Per segnalare entra nella tua casa: così sappiamo che non è uno scherzo.", "err");
  else say(out, "Non sono riuscito a mandarla. Riprova.", "err");
}

function reportForm(id) {
  const select = el("select", { name: "motivo", "aria-label": "Motivo" }, [
    ["ingannevole", "annuncio ingannevole"], ["maltrattamento", "maltrattamento"], ["prezzo", "prezzo"], ["altro", "altro"],
  ].map(([value, label]) => el("option", { value, text: label })));
  const button = el("button", { class: "btn ghost", type: "button", text: "Segnala" });
  const box = el("details", { class: "muted" }, [
    el("summary", { text: "Qualcosa non va con questo annuncio?" }),
    el("div", { class: "filters" }, [select, button]),
    el("div", { "data-report-msg": "" }),
  ]);
  button.addEventListener("click", () => { void report(box, id); });
  return box;
}

async function loadShop() {
  const shop = document.querySelector("[data-shop]");
  const pup = document.querySelector("[data-pup]");
  if (!shop && !pup) return;
  const box = shop ?? pup;
  try {
    const res = await fetch(shop ? shopQuery() : "/v1/vetrina");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const { allevamenti } = await res.json();
    if (shop) {
      const cubs = allevamenti.flatMap((k) => k.cubs.map((c) => cubCard(k, c)));
      if (cubs.length === 0) { say(shop, "Nessun cucciolo in vetrina in questo momento. Torna presto.", "info"); return; }
      shop.replaceChildren(el("div", { class: "grid" }, cubs));
      return;
    }
    const wanted = pup.dataset.pup;
    for (const kennel of allevamenti) {
      const cub = kennel.cubs.find((c) => c.gosinoId === wanted);
      if (cub === undefined) continue;
      pup.replaceChildren(
        el("h1", { text: cub.name }),
        el("p", { class: "lede", text: cub.persona }),
        el("p", { class: "muted" }, [
          el("a", { href: "/allevamenti/" + encodeURIComponent(kennel.slug), text: kennel.name }),
          document.createTextNode(" · generazione " + cub.generation + " · " + age(cub.ageDays)),
        ]),
        el("p", { class: "price", text: euro(cub.priceCents) }),
        el("p", {}, [el("a", { class: "btn", href: "/casa#/adozioni?cucciolo=" + encodeURIComponent(cub.gosinoId), text: "Voglio adottarlo" })]),
        el("p", { class: "muted", text: "Per adottarlo serve una casa: se non ce l'hai, la crei in un minuto." }),
      );
      await showPedigree(pup, wanted);
      pup.appendChild(reportForm(wanted));
      return;
    }
    say(pup, "Questo cucciolo non è più in vetrina: forse ha già trovato casa.", "info");
  } catch {
    say(box, "La vetrina non si è caricata. Riprova fra poco.", "err");
  }
}
const filters = document.querySelector("[data-shop-filters]");
filters?.addEventListener("submit", (event) => { event.preventDefault(); void loadShop(); });
loadShop();
`;
