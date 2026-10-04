/** Le cose che segue (ADR-133). Tutto da `call()`. */
export const WATCHES_JS = `
const WATCH_KIND = { curiosita: "curiosità", progetto: "progetto", preoccupazione: "preoccupazione" };
const WATCH_STATE = { attivo: "la segue", chiuso: "chiusa", scaduto: "scaduta" };

async function loadWatches() {
  const select = $("watch-gosino");
  const chosen = select.value || WHO || GOSINI[0]?.id || "";
  select.innerHTML = GOSINI.map((g) => '<option value="' + g.id + '">' + escape(g.name) + "</option>").join("");
  if (chosen !== "") select.value = chosen;
  const w = await call("/v1/tieni-d-occhio", {});
  $("watch-web").innerHTML = '<button class="ghost" id="watch-web-toggle" data-on="' + w.web + '">' +
    (w.web ? "Spegni la ricerca sul web" : "Accendi la ricerca sul web") + "</button>" +
    '<span class="muted">' + (w.web ? "accesa" : "spenta: guarda solo i tuoi feed") + "</span>";
  $("watch-list").innerHTML = w.cose.length === 0
    ? '<p class="empty">Ancora niente. Parlagli di un viaggio, di una curiosità, di quello che ti preoccupa.</p>'
    : w.cose.map((c) => '<div class="deed"><span class="when">' + escape(WATCH_KIND[c.tipo] ?? c.tipo) +
        " \\u00b7 " + escape(WATCH_STATE[c.stato] ?? c.stato) + " \\u00b7 fino al " + new Date(c.fino).toLocaleDateString("it-IT") +
        (c.fonte === "pannello" ? " \\u00b7 aggiunta a mano" : "") + "</span>" +
        '<div class="act"><b>' + escape(c.soggetto ?? "—") + '</b> <span class="muted">' + escape(c.gosino) + "</span></div>" +
        '<button class="ghost" data-forget-watch="' + c.id + '">Dimentica</button></div>').join("");
  $("watch-finds").innerHTML = w.trovati.length === 0
    ? '<p class="empty">Niente ancora: quando esce qualcosa che c\\u2019entra, lo trovi qui.</p>'
    : w.trovati.map((t) => '<div class="deed"><span class="when">' + whenLabel(t.quando) + " \\u00b7 " +
        (t.esito === "proposto" ? "te l\\u2019ha detto" : "non c\\u2019entrava") + "</span>" +
        '<div class="act">' + (t.frase ? escape(t.frase) + "<br>" : "") +
        (t.link && /^https?:\\/\\//.test(t.link)
          ? '<a href="' + escape(t.link) + '" target="_blank" rel="noopener noreferrer">' + escape(t.titolo ?? t.link) + "</a>"
          : escape(t.titolo ?? "")) + "</div></div>").join("");
}

$("watch-web").addEventListener("click", async (event) => {
  const button = event.target.closest("#watch-web-toggle");
  if (!button) return;
  try {
    await call("/v1/tieni-d-occhio/web", { method: "PUT", body: JSON.stringify({ attiva: button.dataset.on !== "true" }) });
    await loadWatches();
  } catch (error) { say("watch-msg", error.message, "err"); }
});
$("watch-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-forget-watch]");
  if (!button) return;
  try {
    await call("/v1/tieni-d-occhio/" + button.dataset.forgetWatch, { method: "DELETE" });
    await loadWatches();
  } catch (error) { say("watch-msg", error.message, "err"); }
});
$("watch-add").addEventListener("click", async () => {
  try {
    await call("/v1/tieni-d-occhio", { method: "POST", body: JSON.stringify({
      gosino: $("watch-gosino").value, soggetto: $("watch-subject").value,
      tipo: $("watch-kind").value, giorni: Number($("watch-days").value),
    }) });
    $("watch-subject").value = "";
    say("watch-msg", "Segnata: da stanotte la tiene d\\u2019occhio.", "ok");
    await loadWatches();
  } catch (error) { say("watch-msg", error.message, "err"); }
});
`;
