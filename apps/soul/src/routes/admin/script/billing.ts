import { PLAN_LABEL, PLANS } from "@ugo/shared";

/**
 * Abbonamento e credito (ADR-125, ADR-130). I piani arrivano da
 * `packages/shared/src/plans.ts`, scritti qui dentro alla costruzione: il
 * pannello non può raccontare un piano diverso da quello che il server applica.
 */
export const BILLING_JS = `
const PLAN_TABLE = ${JSON.stringify(PLANS)};
const PLAN_NAMES = ${JSON.stringify(PLAN_LABEL)};
const CAP_LABEL = {
  voice: "voce e orecchie sintetiche", dream: "il sogno di notte", album: "l'album",
  meetings: "le riunioni", plaza: "la piazza", breedingSales: "cucciolate e vendita",
};
const SOURCE_LABEL = { abbonamento: "abbonamento", concessione: "concesso dall'operatore", base: "piano di base" };
const howMany = (n, one, many) => n === null ? "senza limite di " + many : n === 1 ? "1 " + one : n + " " + many;

function planCard(id, current) {
  const caps = PLAN_TABLE[id];
  const list = [howMany(caps.gosini, "gosino", "gosini"), howMany(caps.rooms, "stanza", "stanze")]
    .map((t) => "<li>" + t + "</li>").join("") +
    Object.keys(CAP_LABEL).map((k) => '<li class="' + (caps[k] ? "" : "no") + '">' + CAP_LABEL[k] + "</li>").join("");
  // si compra solo un piano più ricco di quello che si ha già
  const ranks = Object.keys(PLAN_TABLE);
  const buy = ranks.indexOf(id) <= ranks.indexOf(current) ? "" :
    '<div class="row"><button data-plan-buy="' + id + '" data-via="stripe" data-testid="plan-buy-' + id + '">Con carta</button>' +
    '<button class="ghost" data-plan-buy="' + id + '" data-via="paypal">Con PayPal</button></div>';
  return '<div class="plan' + (id === current ? " current" : "") + '"><h3>' + PLAN_NAMES[id] +
    (id === current ? ' <span class="pill good">il tuo</span>' : "") + "</h3><ul>" + list + "</ul>" + buy + "</div>";
}

async function loadPlan() {
  const p = await call("/v1/abbonamento", {});
  const sub = p.abbonamento;
  $("plan-now").innerHTML = tile("piano", PLAN_NAMES[p.piano], SOURCE_LABEL[p.fonte]) +
    (sub === null ? "" : tile("abbonamento", sub.provider === "stripe" ? "carta" : "PayPal",
      sub.disdetto ? "disdetto: vale fino a fine periodo" : sub.stato));
  $("plan-manage").innerHTML = sub === null ? "" :
    (sub.provider === "stripe" ? '<button class="ghost" id="plan-portal" data-testid="plan-portal">Ricevute e carta</button>' : "") +
    (sub.disdetto ? "" : '<button class="ghost" id="plan-cancel" data-testid="plan-cancel">Disdici</button>');
  $("plan-cards").innerHTML = Object.keys(PLAN_TABLE).map((id) => planCard(id, p.piano)).join("");
  if (hashParam("esito") === "ok") say("plan-msg", "Pagamento ricevuto: il piano si aggiorna appena chi incassa ce lo conferma.", "ok");
}

$("plan-cards").addEventListener("click", async (event) => {
  const buy = event.target.closest("[data-plan-buy]");
  if (!buy) return;
  try {
    const opened = await call("/v1/abbonamento/checkout", {
      method: "POST", body: JSON.stringify({ piano: buy.dataset.planBuy, via: buy.dataset.via }),
    });
    location.href = opened.url;
  } catch (error) { say("plan-msg", error.message, "err"); }
});

$("plan-manage").addEventListener("click", async (event) => {
  try {
    if (event.target.closest("#plan-portal")) {
      location.href = (await call("/v1/abbonamento/portale", { method: "POST" })).url;
    } else if (event.target.closest("#plan-cancel")) {
      if (!confirm("Disdire? Il piano resta fino alla fine del periodo già pagato.")) return;
      await call("/v1/abbonamento/disdici", { method: "POST" });
      say("plan-msg", "Disdetta inviata: Stripe o PayPal la confermano fra poco.", "ok");
    }
  } catch (error) { say("plan-msg", error.message, "err"); }
});

const MOVE_LABEL = { topup: "ricarica", usage: "consumo", refund: "rimborso", adjust: "rettifica" };

async function loadCredit() {
  const c = await call("/v1/credito", {});
  const a = c.automatica;
  $("credit-now").innerHTML = tile("saldo", creditEuro(c.saldoMicros), "per le chiavi UGO a consumo");
  $("auto-on").checked = a.attiva;
  $("auto-threshold").value = String(a.sogliaMicros / 1e6);
  $("auto-amount").value = String(a.importoMicros / 1e6);
  $("auto-cap").value = String(a.tettoMeseMicros / 1e6);
  $("auto-state").innerHTML = a.spenta !== null
    ? '<span class="pill critical">spenta da sola</span> la banca ha detto di no (' + escape(a.spenta) + "): ricarica a mano e riaccendila."
    : a.metodo === null ? '<span class="muted">Si attiva dopo la prima ricarica a mano: è lì che si salva il metodo.</span>'
    : '<span class="pill ' + (a.attiva ? "good" : "warning") + '">' + (a.attiva ? "attiva" : "ferma") + "</span> metodo: " +
      (a.metodo === "stripe" ? "carta" : "PayPal");
  $("topup-stripe").hidden = !c.vie.stripe;
  $("topup-paypal").hidden = !c.vie.paypal;
  $("credit-moves").innerHTML = c.movimenti.length === 0 ? '<p class="empty">Nessun movimento.</p>' :
    c.movimenti.map((m) => '<div class="line"><span class="when">' + whenLabel(m.at) + "</span><b>" +
      (MOVE_LABEL[m.kind] ?? m.kind) + "</b> " + creditEuro(m.micros) + "</div>").join("");
  if (hashParam("esito") === "ok") say("credit-msg", "Pagamento ricevuto: il credito arriva appena chi incassa ce lo conferma.", "ok");
}

async function topup(via) {
  try {
    const opened = await call("/v1/credito/ricarica", {
      method: "POST", body: JSON.stringify({ euro: Number($("topup-euro").value), via }),
    });
    location.href = opened.url;
  } catch (error) { say("credit-msg", error.message, "err"); }
}
$("topup-stripe").addEventListener("click", () => { void topup("stripe"); });
$("topup-paypal").addEventListener("click", () => { void topup("paypal"); });

$("auto-save").addEventListener("click", async () => {
  try {
    await call("/v1/credito/impostazioni", {
      method: "PUT",
      body: JSON.stringify({
        automatica: $("auto-on").checked,
        sogliaEuro: Number($("auto-threshold").value),
        importoEuro: Number($("auto-amount").value),
        tettoMeseEuro: Number($("auto-cap").value),
      }),
    });
    say("credit-msg", "Salvato.", "ok");
    await loadCredit();
  } catch (error) { say("credit-msg", error.message, "err"); }
});
`;
