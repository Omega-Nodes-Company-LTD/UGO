/**
 * Le adozioni nel pannello (ADR-084).
 *
 * Mostra la stessa pratica ai due lati — chi cede e chi riceve — e offre i
 * pulsanti solo a chi cede: pagare e consegnare sono gesti dell'allevamento.
 * Il **numero della voce in catena** si mostra perché la sua assenza è la cosa
 * da guardare: consegnato e non registrato è uno stato del mondo, non un
 * dettaglio.
 */
export const ADOPTIONS_JS = `
const ADOPTION_MARK = {
  prenotata: "\u23F3 prenotata", pagata: "\u2713 pagata",
  consegnata: "\u{1F43E} consegnata", annullata: "annullata",
};

const euro = (cents) => cents == null ? "da concordare" : "\u20AC " + (cents / 100).toFixed(2);

async function loadAdoptions() {
  const data = await call(scoped("/v1/adozioni"), {});
  const rows = data.adozioni ?? [];
  $("adozioni-list").innerHTML = rows.length === 0
    ? '<p class="empty">Nessuna pratica aperta.</p>'
    : rows.map((row) => {
        const chain = row.status !== "consegnata"
          ? ""
          : row.chainSeq == null
            ? ' <b class="err">non registrato in catena</b>'
            : ' <span class="muted">in catena, voce ' + escape(String(row.chainSeq)) + "</span>";
        const buttons = row.status === "prenotata"
          ? '<button class="ghost ad-pay" data-ad="' + row.id + '" data-testid="ad-pay">Segna pagata</button>' +
            '<button class="ghost ad-cancel" data-ad="' + row.id + '" data-testid="ad-cancel">Annulla</button>'
          : row.status === "pagata"
            ? '<button class="ad-deliver" data-ad="' + row.id + '" data-testid="ad-deliver">Consegna</button>' +
              '<button class="ghost ad-cancel" data-ad="' + row.id + '" data-testid="ad-cancel">Annulla</button>'
            : "";
        return '<div class="deed"><span class="when">' +
          escape(ADOPTION_MARK[row.status] ?? row.status) + " \u00b7 " + escape(euro(row.priceCents)) +
          chain + "</span>" +
          '<div class="act">' + escape(row.gosinoName) +
          (row.paymentRef ? ' <span class="muted">' + escape(row.paymentRef) + "</span>" : "") +
          "</div>" + (buttons === "" ? "" : '<div class="row">' + buttons + "</div>") + "</div>";
      }).join("");

  for (const button of document.querySelectorAll(".ad-pay")) {
    button.addEventListener("click", async () => {
      const riferimento = prompt("Riferimento del pagamento (bonifico, ricevuta, incasso):");
      if (!riferimento) return;
      await adoptionAction(button.dataset.ad, "pagamento", { riferimento });
    });
  }
  for (const button of document.querySelectorAll(".ad-deliver")) {
    button.addEventListener("click", async () => {
      if (!confirm("La consegna non si annulla: la vita fatta qui resta qui. Procedo?")) return;
      await adoptionAction(button.dataset.ad, "consegna", {});
    });
  }
  for (const button of document.querySelectorAll(".ad-cancel")) {
    button.addEventListener("click", async () => {
      if (!confirm("Annullare rimette il cucciolo in vetrina. Procedo?")) return;
      await adoptionAction(button.dataset.ad, "annulla", {});
    });
  }
}

async function adoptionAction(id, what, body) {
  try {
    await call(scoped("/v1/adozioni/" + encodeURIComponent(id) + "/" + what), {
      method: "POST",
      body: JSON.stringify(body),
    });
    await section(loadAdoptions, "adozioni-msg");
  } catch (error) {
    say("adozioni-msg", error.message, "err");
  }
}
`;
