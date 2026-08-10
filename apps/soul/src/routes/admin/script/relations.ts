/** The graph between the others (ADR-014). */
export const RELATIONS_JS = `
// --- relazioni -------------------------------------------------------------
const REL_LABEL = { parent_of: "è genitore di", partner_of: "sta con", cares_for: "si prende cura di", avoids: "evita" };

async function loadRelations() {
  const { relations } = await call("/v1/relations", {});
  const name = (id) => pack.find((b) => b.id === id)?.displayName ?? "?";
  $("rel-list").innerHTML = relations.map((r) =>
    '<li data-testid="rel-item">' + escape(name(r.beingA)) + " " + (REL_LABEL[r.type] ?? r.type) + " " +
    escape(name(r.beingB)) + ' <button class="ghost" data-unlink="' + r.id + '">togli</button></li>').join("") ||
    "<li>Nessuna. UGO non sa ancora chi è parente di chi.</li>";
}

$("add-rel").addEventListener("click", async () => {
  try {
    await call("/v1/relations", {
      method: "POST",
      body: JSON.stringify({ beingA: $("rel-a").value, beingB: $("rel-b").value, type: $("rel-type").value }),
    });
    say("rel-msg", "Collegati.", "ok");
    await loadRelations();
  } catch (error) { say("rel-msg", "Non collegati: " + error.message, "err"); }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-unlink]");
  if (!button) return;
  try { await call("/v1/relations/" + button.dataset.unlink, { method: "DELETE" }); await loadRelations(); }
  catch (error) { say("rel-msg", error.message, "err"); }
});
`;
