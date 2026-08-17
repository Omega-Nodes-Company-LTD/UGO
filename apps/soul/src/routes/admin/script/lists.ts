/**
 * Le liste nel pannello (ADR-076).
 *
 * Il pannello le mostra perché una lista che si può solo sentire non è una
 * lista: la spesa la si guarda al supermercato, non la si fa recitare.
 */
export const LISTS_JS = `
async function loadLists() {
  const items = (await call("/v1/lists", {})).items ?? [];
  if (items.length === 0) {
    $("lists-all").innerHTML = '<p class="empty">Nessuna lista. Provate a dirgli «aggiungi il latte alla spesa».</p>';
    return;
  }
  const byList = new Map();
  for (const item of items) {
    if (!byList.has(item.list)) byList.set(item.list, []);
    byList.get(item.list).push(item);
  }
  $("lists-all").innerHTML = [...byList.entries()].map(([name, rows]) =>
    "<h3>" + escape(name) + "</h3><ul class=\\"plain\\">" + rows.map((row) =>
      '<li data-list-item="' + escape(row.id) + '">' +
      '<input type="checkbox" data-check="' + escape(row.id) + '"' + (row.done ? " checked" : "") + "> " +
      (row.done ? "<s>" + escape(row.text) + "</s>" : escape(row.text)) +
      ' <button class="ghost" data-drop="' + escape(row.id) + '">togli</button></li>'
    ).join("") + "</ul>").join("");
}

$("list-add").addEventListener("click", async () => {
  const list = $("list-name").value.trim() || "spesa";
  const text = $("list-text").value.trim();
  if (text === "") { say("list-msg", "Cosa aggiungo?", "info"); return; }
  try {
    await call("/v1/lists", { method: "POST", body: JSON.stringify({ list, text }) });
    $("list-text").value = "";
    await loadLists();
  } catch (error) { say("list-msg", error.message, "err"); }
});

$("lists-all").addEventListener("click", async (event) => {
  const drop = event.target.dataset.drop;
  if (drop !== undefined) {
    try { await call("/v1/lists/" + encodeURIComponent(drop), { method: "DELETE" }); await loadLists(); }
    catch (error) { say("list-msg", error.message, "err"); }
  }
});

$("lists-all").addEventListener("change", async (event) => {
  const id = event.target.dataset.check;
  if (id === undefined) return;
  try {
    await call("/v1/lists/" + encodeURIComponent(id), {
      method: "PATCH", body: JSON.stringify({ done: event.target.checked }),
    });
    await loadLists();
  } catch (error) { say("list-msg", error.message, "err"); }
});
`;
