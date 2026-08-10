/** Money, mood, and the health of the machinery underneath. */
export const STATUS_JS = `
// --- stato -----------------------------------------------------------------
const PSYCHE_LABEL = {
  energia: "energia", umore: "umore", affetto: "affetto",
  noia: "noia", stress: "stress", curiosita: "curiosità",
};
// resting points from packages/psyche (energia is circadian, so it has none)
const PSYCHE_BASELINE = { umore: 0.55, affetto: 0.5, noia: 0.4, stress: 0.3, curiosita: 0.5 };

async function loadPsyche() {
  const psyche = await call("/v1/psyche", {});
  $("mood-label").textContent = psyche.label;
  $("mood-phrase").textContent = psyche.phrase;
  $("psyche-bars").innerHTML = Object.entries(psyche.vars).map(([name, value]) =>
    '<div class="var"><span class="name">' + (PSYCHE_LABEL[name] ?? name) + "</span>" +
    meter(value, PSYCHE_BASELINE[name]) +
    '<span class="num">' + value.toFixed(2) + "</span></div>").join("");
}

async function loadStats() {
  const s = await call("/v1/stats", {});
  const usd = (n) => "$" + Number(n).toFixed(3);
  const spent = s.budget.spentUsd;
  const state = s.budget.degraded ? "critical" : spent > s.budget.limitUsd * 0.8 ? "warning" : "good";
  const STATE_WORD = { good: "nel budget", warning: "quasi al limite", critical: "budget finito" };

  $("tiles").innerHTML =
    tile("speso oggi", usd(spent), '<span class="pill ' + state + '">' + STATE_WORD[state] + "</span>") +
    tile("risparmio cache", s.cacheHitRatio === null ? "—" : Math.round(s.cacheHitRatio * 100) + "%",
      "sul prefisso cached") +
    tile("ricordi", s.counts.memories, s.counts.messages + " messaggi") +
    tile("ultimo sogno", s.lastDream ? s.lastDream.at.slice(5, 10) : "mai",
      s.lastDream ? "" : "non ha ancora sognato");

  // mood over the last two days: one series, so no legend — the title names it
  const mood = (s.mood ?? []).filter((m) => typeof m.vars?.umore === "number");
  lineChart($("mood-chart"), mood.map((m) => ({
    x: new Date(m.at).getTime(), y: m.vars.umore,
    label: new Date(m.at).toLocaleString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
  })));

  const bars = (s.history ?? []).map((d) => ({
    label: d.date, value: d.costUsd, over: d.costUsd >= s.budget.limitUsd,
  }));
  barChart($("spend-chart"), bars, { reference: s.budget.limitUsd });
  $("spend-table").innerHTML = bars.length === 0 ? "" :
    "<table><thead><tr><th>giorno</th><th>speso</th><th>chiamate</th></tr></thead><tbody>" +
    s.history.map((d) => "<tr><td>" + d.date + "</td><td>$" + d.costUsd.toFixed(4) +
      "</td><td>" + d.calls + "</td></tr>").join("") + "</tbody></table>";
}
const tile = (label, value, note) =>
  '<div class="tile"><small>' + label + "</small><b>" + value + "</b><span>" + (note ?? "") + "</span></div>";

async function loadHealth() {
  const res = await fetch("/health");
  const body = await res.json();
  const WORD = { ok: "risponde", degraded: "arranca", error: "non risponde", off: "non configurato" };
  $("health").innerHTML = Object.entries(body.checks ?? {}).map(([name, state]) =>
    '<span class="pill ' + (state === "ok" || state === "off" ? "good" : state === "degraded" ? "warning" : "critical") +
    '">' + name + " · " + (WORD[state] ?? state) + "</span>").join("");
}

$("refresh").addEventListener("click", async () => {
  try {
    await refresh(); await loadPsyche(); await loadHealth();
    say("stats-msg", "Aggiornato.", "ok");
  } catch (error) { say("stats-msg", error.message, "err"); }
});

$("dream").addEventListener("click", async () => {
  say("stats-msg", "Lo sto facendo sognare, ci mette un po'…", "info");
  try {
    const report = await call("/v1/jobs/dream", { method: "POST", body: JSON.stringify({}) });
    say("stats-msg", report.status === "queued"
      ? "In coda: partirà alla prossima esecuzione schedulata."
      : "Fatto. Aggiorna per vedere cosa ha scritto.", "ok");
  } catch (error) { say("stats-msg", "Il sogno non è partito: " + error.message, "err"); }
});
`;
