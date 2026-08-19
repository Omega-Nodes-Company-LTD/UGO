/** Money, mood, and the health of the machinery underneath. */
export const STATUS_JS = `
// --- stato -----------------------------------------------------------------
const PSYCHE_LABEL = {
  energia: "energia", umore: "umore", affetto: "affetto",
  noia: "noia", stress: "stress", curiosita: "curiosità",
};
const PSYCHE_ORDER = Object.keys(PSYCHE_LABEL);
// resting points from packages/psyche, used only until the server has told us
// his own: the adaptive baselines of ADR-012 are per exemplar
const PSYCHE_BASELINE = { umore: 0.55, affetto: 0.5, noia: 0.4, stress: 0.3, curiosita: 0.5 };

/**
 * ADR-104 — il ritiro, dalla pagina invece che da psql.
 *
 * Lo stato lo dice il roster GOSINI, che da oggi porta retiredAt: senza,
 * il bottone non poteva sapere in che verso girare, e il pannello mostrava
 * come attivo qualcuno che non risponde più.
 */
function drawRetire() {
  const who = GOSINI.find((g) => g.id === WHO);
  const resting = who?.retiredAt != null;
  $("retire-go").textContent = resting ? "Rimettilo in servizio" : "Mettilo a riposo";
  $("retire-state").textContent = resting
    ? "È a riposo: non risponde e non compare nel branco attivo. C'è ancora, tutto suo compreso."
    : "È in servizio.";
}

$("retire-go").addEventListener("click", async () => {
  if (WHO === "") return;
  const who = GOSINI.find((g) => g.id === WHO);
  const resting = who?.retiredAt != null;
  if (!resting && !confirm("Metterlo a riposo? Smette di rispondere. Non si cancella niente, " +
    "e si torna indietro con lo stesso bottone.")) return;
  $("retire-go").disabled = true;
  try {
    await call("/v1/gosini/" + WHO + "/retire", {
      method: "POST", body: JSON.stringify({ retired: !resting }),
    });
    await loadGosini();
    drawRetire();
    say("retire-msg", resting ? "È tornato in servizio." : "È a riposo. Resta tutto dov'è.", "ok");
  } catch (error) { say("retire-msg", error.message, "err"); }
  finally { $("retire-go").disabled = false; }
});

async function loadPsyche() {
  const psyche = await call(forWho("/v1/psyche"), {});
  // the name is already the eyebrow above: the headline is the mood alone
  drawRetire();
  $("mood-label").textContent = psyche.label;
  $("mood-phrase").textContent = psyche.phrase;
  // the adaptive baseline (ADR-012) wins over the species constant: the tick on
  // the bar has to be HIS resting point, or the arithmetic under it won't add up
  $("psyche-bars").innerHTML = Object.entries(psyche.vars).map(([name, value]) => {
    const why = psyche.breakdown?.[name];
    return '<div class="var"><span class="name">' + (PSYCHE_LABEL[name] ?? name) + "</span>" +
      meter(value, why?.baseline ?? PSYCHE_BASELINE[name]) +
      '<span class="num">' + value.toFixed(2) + "</span>" +
      whyLine(why) + "</div>";
  }).join("");
}

// --- come si sono mosse ----------------------------------------------------
// Six small multiples instead of six lines on one axis: six series would need
// six hues, and identity that rides on hue alone stops working for a
// colourblind reader. They double as the selector for the big plot — overview
// first, then the one you actually want to look at.
let MOOD = [];
let MOOD_PICK = "umore";

const moodPoints = (name) => MOOD
  .filter((m) => typeof m.vars?.[name] === "number")
  .map((m) => ({
    x: new Date(m.at).getTime(),
    y: m.vars[name],
    label: new Date(m.at).toLocaleString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
  }));

function drawMood() {
  $("spark-row").innerHTML = PSYCHE_ORDER.map((name) => {
    const points = moodPoints(name);
    const last = points.length === 0 ? null : points[points.length - 1].y;
    return '<button type="button" class="spark-card' + (name === MOOD_PICK ? " on" : "") +
      '" data-var="' + name + '" aria-pressed="' + (name === MOOD_PICK) + '">' +
      "<small>" + (PSYCHE_LABEL[name] ?? name) + "</small>" +
      "<b>" + (last === null ? "—" : last.toFixed(2)) + "</b>" +
      sparkline(points) + "</button>";
  }).join("");
  $("mood-pick-name").textContent = PSYCHE_LABEL[MOOD_PICK] ?? MOOD_PICK;
  lineChart($("mood-chart"), moodPoints(MOOD_PICK), { top: 1 });
}

$("spark-row").addEventListener("click", (event) => {
  const card = event.target.closest(".spark-card");
  if (card === null) return;
  MOOD_PICK = card.dataset.var;
  drawMood();
});

async function loadStats() {
  // forWho is the plain path on a house page and the scoped one on a
  // creature's: the tiles and the spend are the account's either way,
  // and only the 48-hour series narrows
  const s = await call(forWho("/v1/stats"), {});
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

  MOOD = s.mood ?? [];
  drawMood();

  const bars = (s.history ?? []).map((d) => ({
    label: d.date.slice(5), value: d.costUsd, over: d.costUsd >= s.budget.limitUsd,
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
  // i nomi dei controlli sono chiavi tecniche: chi guarda il pannello non
  // deve dedurre da «ollamaGpu» che c'è una seconda macchina (ADR-110)
  const CHECK_NAME = { db: "database", mqtt: "broker", ollama: "modelli in casa",
    ollamaGpu: "nodo GPU", perception: "percezione" };
  const MARK = { ok: "●", degraded: "▲", error: "■", off: "○" };
  // status never rides on colour alone: a word AND a shape travel with it
  $("health").innerHTML = Object.entries(body.checks ?? {}).map(([name, state]) =>
    '<span class="pill ' + (state === "ok" || state === "off" ? "good" : state === "degraded" ? "warning" : "critical") +
    '"><span aria-hidden="true">' + (MARK[state] ?? "●") + "</span> " + (CHECK_NAME[name] ?? name) + " · " +
    (WORD[state] ?? state) + "</span>").join("");
}

$("refresh").addEventListener("click", async () => {
  await section(refresh, "pack-msg");
  await section(loadGosini, "stats-msg");
  await go();
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
