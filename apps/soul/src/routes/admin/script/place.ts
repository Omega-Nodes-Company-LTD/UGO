/**
 * I luoghi della casa (ADR-113).
 *
 * Prima era un posto solo: si cercava per nome — le coordinate non le sa
 * nessuno a memoria, «Torino» sì — e finiva sulla riga dell'account. Adesso
 * sono una **lista**, perché chi ha la casa in città e quella al mare aveva un
 * cielo solo, e per forza sbagliato in una delle due.
 *
 * Il dizionario dei posti del mondo è `/v1/places/search`; `/v1/places` è
 * l'elenco dei luoghi di questa casa. Due cose diverse, due indirizzi.
 */
export const PLACE_JS = `
async function showPlace() {
  try {
    const mine = (await call(forWho("/v1/places"), {})).places ?? [];
    if (mine.length === 0) {
      $("place-now").textContent = "Nessun luogo: il cielo resta sereno per finta finche non ne aggiungi uno.";
      $("place-mine").innerHTML = "";
      return;
    }
    $("place-now").textContent = mine.length === 1
      ? "Un luogo: " + mine[0].name
      : mine.length + " luoghi. Ogni stanza sta in uno, e il cielo e quello del suo.";
    $("place-mine").innerHTML = '<ul class="plain">' + mine.map((p) =>
      '<li data-place="' + escape(p.id) + '"><b>' + escape(p.name) + "</b> " +
      '<span class="muted">' + (p.lat === null ? "senza coordinate" : p.lat.toFixed(3) + ", " + p.lon.toFixed(3)) +
      " \u00b7 " + p.rooms + (p.rooms === 1 ? " stanza" : " stanze") + "</span> " +
      '<button class="ghost" data-place-drop="' + escape(p.id) + '">butta</button></li>').join("") + "</ul>";
  } catch (error) { /* il blocco resta muto: non e la pagina, e una riga */ }
}

$("place-mine").addEventListener("click", async (event) => {
  const drop = event.target.dataset.placeDrop;
  if (drop === undefined) return;
  try {
    await call(forWho("/v1/places/" + encodeURIComponent(drop)), { method: "DELETE" });
    await showPlace();
  } catch (error) { say("place-msg", error.message, "err"); }
});

$("place-find").addEventListener("click", async () => {
  const query = $("place-q").value.trim();
  if (query.length < 2) { say("place-msg", "Scrivi almeno due lettere.", "err"); return; }
  say("place-msg", "Cerco\u2026", "ok");
  try {
    const found = (await call(forWho("/v1/places/search?q=" + encodeURIComponent(query)), {})).places ?? [];
    if (found.length === 0) { say("place-msg", "Nessun posto con questo nome.", "err"); return; }
    say("place-msg", "", "ok");
    $("place-results").innerHTML = found.map((p, i) =>
      '<div class="deed"><div class="act">' + escape(p.label) +
      '<button class="ghost place-pick" data-i="' + i + '" data-testid="place-pick">aggiungi</button>' +
      '</div><div class="because">' + p.lat.toFixed(3) + ", " + p.lon.toFixed(3) + "</div></div>").join("");
    for (const button of document.querySelectorAll(".place-pick")) {
      button.addEventListener("click", async () => {
        const chosen = found[Number(button.dataset.i)];
        try {
          await call(forWho("/v1/places"), {
            method: "POST",
            body: JSON.stringify({ name: chosen.label, lat: chosen.lat, lon: chosen.lon }),
          });
          $("place-results").innerHTML = "";
          $("place-q").value = "";
          say("place-msg", "Aggiunto: " + chosen.label + ".", "ok");
          await showPlace();
        } catch (error) { say("place-msg", "Non salvato: " + error.message, "err"); }
      });
    }
  } catch (error) { say("place-msg", "Ricerca non riuscita: " + error.message, "err"); }
});
`;
