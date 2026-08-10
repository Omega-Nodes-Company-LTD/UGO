/** Money, cache and the health of the machinery underneath. */
export const STATUS_JS = `
// --- stato -----------------------------------------------------------------
async function loadStats() {
  const s = await call("/v1/stats", {});
  const usd = (n) => "$" + Number(n).toFixed(3);
  $("stats").innerHTML =
    stat("speso oggi", usd(s.budget.spentUsd) + " / " + usd(s.budget.limitUsd)) +
    stat("risparmio cache", s.cacheHitRatio === null ? "—" : Math.round(s.cacheHitRatio * 100) + "%") +
    stat("ricordi", s.counts.memories) +
    stat("ultimo sogno", s.lastDream ? s.lastDream.at.slice(0, 10) : "mai") +
    (s.budget.degraded ? '<div class="msg err">Budget finito: fino a mezzanotte UGO lo dice invece di rispondere peggio.</div>' : "");
}
const stat = (label, value) => '<div class="stat"><b>' + value + "</b>" + label + "</div>";

async function loadHealth() {
  const res = await fetch("/health");
  const body = await res.json();
  const dot = (ok) => (ok === "ok" ? "🟢" : ok === "degraded" ? "🟡" : "🔴");
  $("health").innerHTML = Object.entries(body.checks ?? {})
    .map(([name, state]) => dot(state) + " " + name + " ")
    .join("") + (body.status === "ok" ? "" : " — qualcosa non va: guarda i log della risorsa.");
}

$("refresh").addEventListener("click", async () => {
  try { await refresh(); await loadHealth(); say("stats-msg", "Aggiornato.", "ok"); }
  catch (error) { say("stats-msg", error.message, "err"); }
});

$("dream").addEventListener("click", async () => {
  say("stats-msg", "Lo sto facendo sognare, ci mette un po'…", "info");
  try {
    const report = await call("/v1/jobs/dream", { method: "POST", body: JSON.stringify({}) });
    say("stats-msg", report.status === "queued"
      ? "In coda: partirà alla prossima esecuzione schedulata."
      : "Fatto. Ricarica per vedere le voci imparate.", "ok");
  } catch (error) { say("stats-msg", "Il sogno non è partito: " + error.message, "err"); }
});
`;
