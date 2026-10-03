/** Il mercato (ADR-131): il conto Connect e le segnalazioni. Tutto da `call()`. */
export const MARKET_JS = `
async function loadPayout() {
  const p = await call("/v1/allevamento/pagamenti", {});
  const c = p.conto;
  $("payout-now").innerHTML = c === null
    ? tile("conto", "non aperto", "si apre in pochi minuti, presso Stripe")
    : tile("incassa", c.incassa ? "sì" : "non ancora", c.mancano > 0 ? c.mancano + " cose da completare" : "verifica completa") +
      tile("versamenti", c.versamenti ? "attivi" : "in attesa", "li fa Stripe, sul tuo conto");
  $("payout-actions").innerHTML = !p.configurato ? '<p class="muted">Stripe non è configurato su questo server.</p>' :
    '<button id="payout-open" data-testid="payout-open">' + (c === null ? "Attiva i pagamenti" : c.incassa ? "Aggiorna i dati" : "Completa la verifica") + "</button>" +
    (c === null ? "" : '<button class="ghost" id="payout-dashboard" data-testid="payout-dashboard">Versamenti e ricevute</button>');
  if (hashParam("esito") === "ok") say("payout-msg", "Fatto: lo stato si aggiorna appena Stripe ce lo conferma.", "ok");
}

$("payout-actions").addEventListener("click", async (event) => {
  try {
    if (event.target.closest("#payout-open")) {
      location.href = (await call("/v1/allevamento/pagamenti", { method: "POST" })).url;
    } else if (event.target.closest("#payout-dashboard")) {
      window.open((await call("/v1/allevamento/pagamenti/dashboard", { method: "POST" })).url, "_blank", "noopener");
    }
  } catch (error) { say("payout-msg", error.message, "err"); }
});

const REPORT_REASON = { maltrattamento: "maltrattamento", ingannevole: "annuncio ingannevole", prezzo: "prezzo", altro: "altro" };

async function loadReports() {
  const rows = (await call("/v1/operatore/segnalazioni", {})).segnalazioni ?? [];
  $("reports").innerHTML = rows.length === 0 ? '<p class="empty">Nessuna segnalazione.</p>' :
    rows.map((r) => '<div class="deed"><span class="when">' + whenLabel(r.at) + " \\u00b7 " +
      escape(REPORT_REASON[r.motivo] ?? r.motivo) + " \\u00b7 " + escape(r.stato) + "</span>" +
      '<div class="act">' + escape(r.gosinoName) + (r.nota ? ' <span class="muted">' + escape(r.nota) + "</span>" : "") + "</div>" +
      (r.stato !== "aperta" ? "" : '<div class="row"><button class="ghost" data-report="' + r.id + '" data-act="sospendi">Sospendi</button>' +
        '<button class="ghost" data-report="' + r.id + '" data-act="archivia">Archivia</button></div>') + "</div>").join("");
}

$("reports").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-report]");
  if (!button) return;
  try {
    await call("/v1/operatore/segnalazioni/" + button.dataset.report, {
      method: "POST", body: JSON.stringify({ azione: button.dataset.act }),
    });
    await loadReports();
  } catch (error) { say("reports-msg", error.message, "err"); }
});
`;
