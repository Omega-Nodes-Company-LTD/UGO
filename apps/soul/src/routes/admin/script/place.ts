/**
 * Dove sta la casa (gruppo 12, correzione del 2026-08-17).
 *
 * Stava in `UGO_HOME_LAT`/`UGO_HOME_LON`, cioè nell'ambiente del processo: per
 * dare un cielo giusto a due famiglie servivano due server, che è il contrario
 * di ADR-019. Qui il posto si cerca per nome — le coordinate non le sa
 * nessuno a memoria, «Torino» sì — si sceglie da una lista con regione e
 * paese (sei Torini diverse sono sei righe identiche senza il contorno), e
 * finisce sulla riga della casa insieme all'etichetta scelta, così il pannello
 * può rimostrare il posto invece di due decimali muti.
 */
export const PLACE_JS = `
async function showPlace() {
  try {
    // forWho() porta la casa scelta, come ogni altra chiamata del pannello:
    // senza, con due famiglie si mostrerebbe il posto di quella sbagliata
    const where = (await call(forWho("/v1/household/place"), {})).place;
    $("place-now").textContent = where
      ? "Adesso: " + where
      : "Non l'hai ancora detto: il cielo resta sereno per finta finché non lo scegli.";
  } catch (error) { /* il blocco resta muto: non è la pagina, è una riga */ }
}

$("place-find").addEventListener("click", async () => {
  const query = $("place-q").value.trim();
  if (query.length < 2) { say("place-msg", "Scrivi almeno due lettere.", "err"); return; }
  say("place-msg", "Cerco…", "ok");
  try {
    const found = (await call(forWho("/v1/places?q=" + encodeURIComponent(query)), {})).places ?? [];
    if (found.length === 0) { say("place-msg", "Nessun posto con questo nome.", "err"); return; }
    say("place-msg", "", "ok");
    $("place-results").innerHTML = found.map((p, i) =>
      '<div class="deed"><div class="act">' + escape(p.label) +
      '<button class="ghost place-pick" data-i="' + i + '" data-testid="place-pick">scegli</button>' +
      '</div><div class="because">' + p.lat.toFixed(3) + ", " + p.lon.toFixed(3) + "</div></div>").join("");
    for (const button of document.querySelectorAll(".place-pick")) {
      button.addEventListener("click", async () => {
        const chosen = found[Number(button.dataset.i)];
        try {
          await call(forWho("/v1/household/place"), {
            method: "PUT",
            body: JSON.stringify({ place: chosen.label, lat: chosen.lat, lon: chosen.lon }),
          });
          $("place-results").innerHTML = "";
          $("place-q").value = "";
          say("place-msg", "Fatto: il cielo adesso è quello di " + chosen.label + ".", "ok");
          await showPlace();
        } catch (error) { say("place-msg", "Non salvato: " + error.message, "err"); }
      });
    }
  } catch (error) { say("place-msg", "Ricerca non riuscita: " + error.message, "err"); }
});
`;
