/**
 * Le case (ADR-061), dal pannello.
 *
 * Esistevano solo come `ugo casa nuova` sulla riga di comando: la promessa
 * «una persona può avere più case e più negozi» era scritta negli ADR e non
 * raggiungibile da chi il pannello lo usa — e senza una seconda casa non ha
 * senso nemmeno scegliere dove sta, che ore sono lì, o che tempo fa.
 *
 * Le stanze restano della casa: il vincolo è `unique(account_id, slug)`,
 * quindi uno «Studio» in Casa Città e uno «Studio» in Casa Mare sono due
 * stanze diverse e non si pestano i piedi.
 */
export const ACCOUNTS_JS = `
// KIND_LABEL esiste gia in archive.ts per i ricordi: qui serve un nome suo,
// e lo script del pannello e uno solo (un test lo verifica proprio per questo)
const ACCOUNT_KIND_LABEL = { home: "famiglia", business: "azienda" };

async function loadAccountsPage() {
  const houses = (await call("/v1/accounts", {})).accounts ?? [];
  // il router lo rilegge per scrivere il nome in testa a ogni pagina
  ACCOUNTS = houses;
  $("accounts-list").innerHTML = houses.map((h) =>
    '<div class="deed"><div class="act">' + (h.kind === "business" ? "🏢 " : "🏠 ") +
    escape(h.name) + ' <span class="deed-act">· ' + escape(h.slug) + "</span>" +
    '<a class="ghost" href="#/a/' + encodeURIComponent(h.slug) + '/sommario">apri</a></div>' +
    '<div class="because">' + escape(ACCOUNT_KIND_LABEL[h.kind] ?? h.kind) + " · " + escape(h.timezone) +
    (h.dailyBudgetUsd ? " · tetto $" + h.dailyBudgetUsd : "") + "</div></div>").join("") ||
    '<p class="empty">Nessuna casa: qui sotto se ne fa nascere una.</p>';

  // i campi della casa CORRENTE, così «salva» non parte da vuoto
  const mine = houses.find((h) => h.slug === ACCOUNT || h.id === ACCOUNT) ?? houses[0];
  if (mine) {
    $("account-name").value = mine.name;
    $("account-kind").value = mine.kind;
    $("account-tz").value = mine.timezone;
    $("account-budget").value = mine.dailyBudgetUsd ?? "";
  }
}

$("account-save").addEventListener("click", async () => {
  const body = {
    name: $("account-name").value.trim(),
    kind: $("account-kind").value,
    timezone: $("account-tz").value.trim(),
  };
  const budget = $("account-budget").value.trim();
  if (budget !== "") body.dailyBudgetUsd = Number(budget);
  try {
    await call(forWho("/v1/account"), { method: "PATCH", body: JSON.stringify(body) });
    say("account-msg", "Salvato.", "ok");
    await loadAccountsPage();
  } catch (error) { say("account-msg", "Non salvato: " + error.message, "err"); }
});

$("new-house").addEventListener("click", async () => {
  const slug = $("new-account-slug").value.trim();
  const name = $("new-account-name").value.trim();
  if (!slug || !name) { say("new-account-msg", "Servono lo slug e il nome.", "err"); return; }
  const body = { slug, name, kind: $("new-account-kind").value };
  const tz = $("new-account-tz").value.trim();
  if (tz) body.timezone = tz;
  try {
    const born = await call("/v1/accounts", { method: "POST", body: JSON.stringify(body) });
    // UNA volta sola, e lo si dice: in archivio c'è solo l'impronta
    $("new-account-msg").innerHTML =
      '<div class="deed"><div class="act">Casa creata: ' + escape(born.slug) + "</div>" +
      '<div class="because">' + escape(born.persona) + "</div>" +
      '<div class="because"><b>Token del proprietario, mostrato una volta sola:</b><br>' +
      "<code>" + escape(born.ownerToken) + "</code></div></div>";
    $("new-account-slug").value = ""; $("new-account-name").value = "";
    await loadAccountsPage();
  } catch (error) { say("new-account-msg", "Non creata: " + error.message, "err"); }
});
`;
