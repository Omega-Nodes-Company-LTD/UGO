/**
 * I feed (ADR-060): iscriversi, spegnere, disdire — e vedere se il giro gira.
 *
 * Il download non passa da qui: è dei job, a cadenza propria. Questa pagina
 * scrive la lista e mostra lo stato dell'ultimo giro — «ok» o la classe
 * dell'errore, mai il corpo della risposta.
 */
export const FEEDS_JS = `
async function loadFeeds() {
  const list = (await call("/v1/feeds", {})).feeds ?? [];
  $("feed-list").innerHTML = list.length === 0
    ? '<p class="empty">Nessun feed: UGO legge solo quello che gli iscrivi.</p>'
    : list.map((f) =>
        '<div class="deed"><div class="act">' + escape(f.label) +
        (f.enabled ? "" : ' <span class="deed-act">· spento</span>') +
        '<button class="ghost feed-toggle" data-feed="' + f.id + '" data-on="' + (f.enabled ? "1" : "0") +
        '" data-testid="feed-toggle">' + (f.enabled ? "spegni" : "riaccendi") + "</button>" +
        '<button class="ghost feed-del" data-feed="' + f.id + '" data-name="' + escape(f.label) +
        '" data-testid="feed-del">disdici</button></div>' +
        '<div class="because"><code>' + escape(f.url) + "</code></div>" +
        '<div class="because">' + f.items + (f.items === 1 ? " novità" : " novità") +
        (f.advised > 0 ? " · " + f.advised + (f.advised === 1 ? " consiglio dato" : " consigli dati") : "") +
        (f.lastFetchedAt
          ? " · ultimo giro " + f.lastFetchedAt.slice(0, 16).replace("T", " ") +
            (f.lastStatus && f.lastStatus !== "ok" ? " · <b>errore: " + escape(f.lastStatus) + "</b>" : "")
          : " · mai scaricato: il prossimo giro dei job lo prende") +
        "</div></div>").join("");

  for (const button of document.querySelectorAll(".feed-toggle")) {
    button.addEventListener("click", async () => {
      try {
        await call("/v1/feeds/" + encodeURIComponent(button.dataset.feed), {
          method: "PATCH",
          body: JSON.stringify({ enabled: button.dataset.on !== "1" }),
        });
        await loadFeeds();
      } catch (error) { say("feed-msg", error.message, "err"); }
    });
  }
  for (const button of document.querySelectorAll(".feed-del")) {
    button.addEventListener("click", async () => {
      if (!confirm('Disdire \\u00ab' + button.dataset.name + '\\u00bb? Porta via anche le novit\\u00e0 scaricate.')) return;
      try {
        await call("/v1/feeds/" + encodeURIComponent(button.dataset.feed), { method: "DELETE" });
        await loadFeeds();
      } catch (error) { say("feed-msg", error.message, "err"); }
    });
  }
}

$("feed-go").addEventListener("click", async () => {
  const url = $("feed-url").value.trim();
  const label = $("feed-label").value.trim();
  if (url === "" || label === "") { say("feed-msg", "Servono indirizzo e nome.", "info"); return; }
  try {
    await call("/v1/feeds", { method: "POST", body: JSON.stringify({ url, label }) });
    $("feed-url").value = "";
    $("feed-label").value = "";
    say("feed-msg", "Iscritto: al prossimo giro dei job comincia a leggerlo.", "ok");
    await loadFeeds();
  } catch (error) {
    say("feed-msg", error.message.includes("409") ? "Questo feed è già iscritto." : error.message, "err");
  }
});

/**
 * ADR-080: i titoli veri. Il pannello mostrava due contatori e nessun articolo,
 * quindi un feed rotto o pieno di pubblicità si scopriva solo quando UGO te ne
 * consigliava uno.
 */
async function loadFeedItems() {
  const data = await call(scoped("/v1/feeds/items?limit=20"), {});
  const items = data.items ?? [];
  $("feed-items").innerHTML = items.length === 0
    ? '<p class="empty">Non è ancora arrivato niente. I feed li scarica il sogno: al prossimo giro si popola.</p>'
    : items.map((item) =>
        '<div class="deed"><span class="when">' +
        escape(item.feed) + (item.publishedAt ? " \u00b7 " + when(item.publishedAt) : "") +
        (item.advisedAt ? " \u00b7 gi\u00e0 consigliato" : "") + "</span>" +
        '<div class="act">' +
        (item.link
          ? '<a href="' + escape(item.link) + '" target="_blank" rel="noopener noreferrer">' + escape(item.title) + "</a>"
          : escape(item.title)) +
        "</div></div>").join("");
}
`;