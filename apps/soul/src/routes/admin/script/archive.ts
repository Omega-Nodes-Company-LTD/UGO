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
  const data = await call("/v1/memories?" + params.toString(), {});
  $("mem-list").innerHTML = data.memories.map((m) =>
    '<li data-testid="mem-item"><b>' + (KIND_LABEL[m.kind] ?? m.kind) + "</b> — " + escape(m.text) +
    (m.score === undefined ? "" : ' <span class="flags">(' + m.score.toFixed(2) + ")</span>") +
    "</li>").join("") ||
    "<li>Niente ancora. I ricordi si formano di notte, dopo che gli hai parlato.</li>";
  say("mem-msg", data.mode === "search" ? "Ecco cosa ripescherebbe." : "Gli ultimi che ha scritto.", "info");
}

$("mem-go").addEventListener("click", async () => {
  try { await loadMemories(); } catch (error) { say("mem-msg", error.message, "err"); }
});

// --- riunioni --------------------------------------------------------------
async function loadMeetings() {
  const { meetings } = await call("/v1/meetings", {});
  $("meet-list").innerHTML = meetings.map((m) =>
    '<li data-testid="meet-item">' + escape(m.title ?? "(senza titolo)") + " — " + m.platform +
    ' <span class="flags">' + m.status + "</span></li>").join("") ||
    "<li>Nessuna riunione, ancora.</li>";
}

$("meet-join").addEventListener("click", async () => {
  const url = $("meet-url").value.trim();
  if (!url) { say("meet-msg", "Serve il link della call.", "err"); return; }
  const title = $("meet-title").value.trim();
  try {
    await call("/v1/meetings/join", {
      method: "POST",
      body: JSON.stringify({ url, ...(title ? { title } : {}) }),
    });
    $("meet-url").value = "";
    say("meet-msg", "Sta entrando. Prende appunti da solo; il digest arriva a fine call.", "ok");
    await loadMeetings();
  } catch (error) {
    say("meet-msg", error.status === 404
      ? "Le riunioni non sono configurate su questo server (manca lo stack Vexa)."
      : "Non è entrato: " + error.message, "err");
  }
});
`;
