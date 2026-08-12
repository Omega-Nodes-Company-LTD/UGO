/** Which of them you are looking at, and why each variable reads what it does. */
export const EXEMPLARS_JS = `
// --- chi stai guardando ----------------------------------------------------
// ADR-034: before this, /v1/psyche answered from the unscoped instance, so with
// two gosini the panel showed whoever had snapshotted last — a mood belonging
// to nobody. Every read below now names its owner.
let WHO = "";

async function loadGosini() {
  let list = [];
  try { list = (await call("/v1/gosini", {})).gosini ?? []; } catch { /* one-exemplar house */ }
  // a chooser with a single choice is furniture: hide it
  $("who-pick").hidden = list.length < 2;
  if (list.length === 0) return;
  if (WHO === "" || !list.some((g) => g.id === WHO)) WHO = list[0].id;
  $("who").innerHTML = list.map((g) =>
    '<option value="' + g.id + '"' + (g.id === WHO ? " selected" : "") + ">" +
    escape(g.name) + (g.where ? " · " + escape(g.where) : "") + "</option>").join("");
}

const forWho = (path) => WHO === "" ? path : path + (path.includes("?") ? "&" : "?") + "gosino=" + encodeURIComponent(WHO);

$("who").addEventListener("change", async (event) => {
  WHO = event.target.value;
  await section(loadPsyche, "stats-msg");
  await section(loadVolition, "volition-msg");
});

// --- da cosa arriva l'umore ------------------------------------------------
// The event names are the psyche's own vocabulary (packages/psyche/events.ts).
// Anything not listed is shown raw rather than hidden: an unlabelled cause is
// a gap in this map, and pretending it does not exist would be worse.
const CAUSE_LABEL = {
  conversation_turn: "conversazione", presence_detected: "ti ha visto",
  compliment: "un complimento", ignored_day: "giornate ignorato",
  high_humidity: "umidità", heat_stress: "caldo", loud_noise: "rumore",
  shake: "urti", meeting_completed: "una riunione", new_topic: "argomenti nuovi",
  peer_met: "ha conosciuto un simile", peer_greeted: "ha rivisto un simile",
  solitude_hour: "solitudine", went_out: "è uscito", came_home: "è tornato",
};
const causeName = (cause) => cause == null ? "da prima del riavvio" : (CAUSE_LABEL[cause] ?? cause);
const signed = (n) => (n > 0 ? "+" : "−") + Math.abs(n).toFixed(2);

/** "riposa a 0,30 · rumore +0,44 · caldo +0,15" — the arithmetic of the bar. */
function whyLine(breakdown) {
  if (!breakdown) return "";
  const parts = ['<span class="rest">riposa a ' + breakdown.baseline.toFixed(2) + "</span>"];
  for (const c of breakdown.causes) {
    parts.push(escape(causeName(c.cause)) + " <b>" + signed(c.amount) + "</b>");
  }
  // a pinned variable has causes summing past the top: say so, it is the
  // interesting case, not a rounding error
  const sum = breakdown.baseline + breakdown.causes.reduce((t, c) => t + c.amount, 0);
  if (sum > 1.001) parts.push('<span class="rest">(sarebbe ' + sum.toFixed(2) + ", è al massimo)</span>");
  return '<div class="why">' + parts.join(" · ") + "</div>";
}
`;
