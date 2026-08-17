/**
 * Le case (ADR-061), dal pannello.
 *
 * Esistevano solo come `ugo casa nuova` sulla riga di comando: la promessa
 * «una persona può avere più case e più negozi» era scritta negli ADR e non
 * raggiungibile da chi il pannello lo usa — e senza una seconda casa non ha
 * senso nemmeno scegliere dove sta, che ore sono lì, o che tempo fa.
 *
 * Le stanze restano della casa: il vincolo è `unique(household_id, slug)`,
 * quindi uno «Studio» in Casa Città e uno «Studio» in Casa Mare sono due
 * stanze diverse e non si pestano i piedi.
 */
export const HOUSES_JS = `
// KIND_LABEL esiste gia in archive.ts per i ricordi: qui serve un nome suo,
// e lo script del pannello e uno solo (un test lo verifica proprio per questo)
const HOUSE_KIND_LABEL = { home: "casa", business: "azienda" };

async function loadHouses() {
  const houses = (await call("/v1/households", {})).households ?? [];
  $("houses-list").innerHTML = houses.map((h) =>
    '<div class="deed"><div class="act">' + (h.kind === "business" ? "🏢 " : "🏠 ") +
    escape(h.name) + ' <span class="deed-act">· ' + escape(h.slug) + "</span>" +
    '<a class="ghost" href="#/c/' + encodeURIComponent(h.slug) + '/casa">apri</a></div>' +
    '<div class="because">' + escape(HOUSE_KIND_LABEL[h.kind] ?? h.kind) + " · " + escape(h.timezone) +
    (h.place ? " · " + escape(h.place) : " · <b>non sa ancora dove sta</b>") +
    (h.dailyBudgetUsd ? " · tetto $" + h.dailyBudgetUsd : "") + "</div></div>").join("") ||
    '<p class="empty">Nessuna casa: qui sotto se ne fa nascere una.</p>';

  // i campi della casa CORRENTE, così «salva» non parte da vuoto
  const mine = houses.find((h) => h.slug === HOUSE || h.id === HOUSE) ?? houses[0];
  if (mine) {
    $("house-name").value = mine.name;
    $("house-kind").value = mine.kind;
    $("house-tz").value = mine.timezone;
    $("house-budget").value = mine.dailyBudgetUsd ?? "";
  }
}

$("house-save").addEventListener("click", async () => {
  const body = {
    name: $("house-name").value.trim(),
    kind: $("house-kind").value,
    timezone: $("house-tz").value.trim(),
  };
  const budget = $("house-budget").value.trim();
  if (budget !== "") body.dailyBudgetUsd = Number(budget);
  try {
    await call(forWho("/v1/household"), { method: "PATCH", body: JSON.stringify(body) });
    say("house-msg", "Salvato.", "ok");
    await loadHouses();
  } catch (error) { say("house-msg", "Non salvato: " + error.message, "err"); }
});

$("new-house").addEventListener("click", async () => {
  const slug = $("new-house-slug").value.trim();
  const name = $("new-house-name").value.trim();
  if (!slug || !name) { say("new-house-msg", "Servono lo slug e il nome.", "err"); return; }
  const body = { slug, name, kind: $("new-house-kind").value };
  const tz = $("new-house-tz").value.trim();
  if (tz) body.timezone = tz;
  const gosino = $("new-house-gosino").value.trim();
  if (gosino) body.gosinoName = gosino;
  try {
    const born = await call("/v1/households", { method: "POST", body: JSON.stringify(body) });
    // UNA volta sola, e lo si dice: in archivio c'è solo l'impronta
    $("new-house-msg").innerHTML =
      '<div class="deed"><div class="act">Casa creata: ' + escape(born.slug) + "</div>" +
      '<div class="because">' + escape(born.persona) + "</div>" +
      '<div class="because"><b>Token del proprietario, mostrato una volta sola:</b><br>' +
      "<code>" + escape(born.ownerToken) + "</code></div></div>";
    $("new-house-slug").value = ""; $("new-house-name").value = "";
    await loadHouses();
  } catch (error) { say("new-house-msg", "Non creata: " + error.message, "err"); }
});
`;
