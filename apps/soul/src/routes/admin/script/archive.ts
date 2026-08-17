/** Read-only windows: what he remembers, which meetings he sat through. */
export const ARCHIVE_JS = `
// --- memoria ---------------------------------------------------------------
const KIND_LABEL = { fact: "fatto", preference: "preferenza", episode: "episodio", insight: "intuizione" };

async function loadMemories() {
  const q = $("mem-q").value.trim();
  const kind = $("mem-kind").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  const data = await call(forWho("/v1/memories?" + params.toString()), {});
  $("mem-list").innerHTML = data.memories.map((m) => {
    const retired = m.invalidatedAt != null;
    // the search view re-ranks like the chat does, so it only ever shows
    // living memories: no point offering to retire what is already retired
    const actions = data.mode === "search" ? "" :
      ' <button class="link" data-mem="' + m.id + '" data-act="' + (retired ? "revive" : "retire") +
      '" data-testid="mem-toggle">' + (retired ? "è ancora vero" : "non è più vero") + "</button>" +
      ' <button class="link danger" data-mem="' + m.id + '" data-act="drop" ' +
      'data-testid="mem-drop">cancella</button>';
    return '<li data-testid="mem-item"' + (retired ? ' class="retired"' : "") + '><b>' +
      (KIND_LABEL[m.kind] ?? m.kind) + "</b> — " + escape(m.text) +
      (m.score === undefined ? "" : ' <span class="flags">(' + m.score.toFixed(2) + ")</span>") +
      (retired ? ' <span class="flags">non più vero' +
        (m.invalidatedReason ? ": " + escape(m.invalidatedReason) : "") + "</span>" : "") +
      actions + "</li>";
  }).join("") ||
    "<li>Niente ancora. I ricordi si formano di notte, dopo che gli hai parlato.</li>";
  say("mem-msg", data.mode === "search" ? "Ecco cosa ripescherebbe." : "Gli ultimi che ha scritto.", "info");
}

$("mem-go").addEventListener("click", async () => {
  try { await loadMemories(); } catch (error) { say("mem-msg", error.message, "err"); }
});

// one listener on the list instead of one per row: the rows are rewritten on
// every search, and per-row listeners would leak with them
$("mem-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-mem]");
  if (!button) return;
  const id = button.dataset.mem;
  try {
    if (button.dataset.act === "drop") {
      if (!confirm("Cancellarlo per sempre? Invalidarlo lo lascia nella sua biografia, cancellarlo no.")) return;
      await call("/v1/memories/" + id, { method: "DELETE" });
      say("mem-msg", "Cancellato. Non esiste più.", "ok");
    } else {
      const valid = button.dataset.act === "revive";
      const reason = valid ? undefined : (prompt("Perché non è più vero? (facoltativo)") ?? undefined);
      await call("/v1/memories/" + id, {
        method: "PATCH",
        body: JSON.stringify(reason === undefined ? { valid } : { valid, reason }),
      });
      say("mem-msg", valid ? "Torna a valere." :
        "Se lo ricorda, ma non lo tirerà più fuori come se fosse vero.", "ok");
    }
    await loadMemories();
  } catch (error) { say("mem-msg", error.message, "err"); }
});

// --- riunioni --------------------------------------------------------------
async function loadMeetings() {
  // CHI ci va si sceglie, non si subisce: prima andava sempre il primo
  // esemplare della casa di boot, qualunque cosa questa pagina lasciasse
  // credere. La scelta sopravvive a un ricarico dell'elenco.
  const chosen = $("meet-who").value;
  $("meet-who").innerHTML = GOSINI.map((g) =>
    '<option value="' + g.id + '">' + escape(g.name) +
    (g.where ? " · " + escape(g.where) : "") + "</option>").join("");
  if (chosen !== "" && GOSINI.some((g) => g.id === chosen)) $("meet-who").value = chosen;

  const { meetings } = await call("/v1/meetings", {});
  $("meet-list").innerHTML = meetings.map((m) =>
    '<li data-testid="meet-item">' + escape(m.title ?? "(senza titolo)") + " — " + m.platform +
    (m.who ? " — " + escape(m.who) : "") +
    ' <span class="flags">' + m.status + "</span></li>").join("") ||
    "<li>Nessuna riunione, ancora.</li>";
}

$("meet-join").addEventListener("click", async () => {
  const url = $("meet-url").value.trim();
  if (!url) { say("meet-msg", "Serve il link della call.", "err"); return; }
  const who = $("meet-who").value;
  if (!who) { say("meet-msg", "Non c'è nessuno da mandare: fai nascere prima un gosino.", "err"); return; }
  const title = $("meet-title").value.trim();
  const name = GOSINI.find((g) => g.id === who)?.name ?? "il gosino";
  try {
    await call("/v1/meetings/join", {
      method: "POST",
      body: JSON.stringify({ url, gosino: who, ...(title ? { title } : {}) }),
    });
    $("meet-url").value = "";
    say("meet-msg", name + " sta entrando. Prende appunti da solo; il digest arriva a fine call.", "ok");
    await loadMeetings();
  } catch (error) {
    say("meet-msg", error.status === 404
      ? "Le riunioni non sono configurate su questo server (manca lo stack Vexa)."
      : "Non è entrato: " + error.message, "err");
  }
});
`;
