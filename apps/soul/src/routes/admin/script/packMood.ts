/**
 * Come sta il branco, nel tempo (ADR-087).
 *
 * **Una sparkline per creatura**, non tre linee su un grafico: è la stessa
 * dottrina delle sei piccole di `sparks.ts`, e per la stessa ragione — tre
 * serie su un asse hanno bisogno di tre colori, e l'identità appesa al colore
 * smette di funzionare per chi non li distingue. Qui i nomi stanno accanto
 * alle loro linee, e non serve nessuna legenda.
 */
export const PACK_MOOD_JS = `
let PACK_MOOD = [];
let PACK_PICK = "umore";
let PACK_DAYS = 14;

function drawPackMood() {
  const host = $("pack-mood");
  if (PACK_MOOD.length === 0) {
    host.innerHTML = '<p class="empty">Ancora niente da guardare: le istantanee della psiche si accumulano vivendo.</p>';
    return;
  }
  host.innerHTML = PACK_MOOD.map((creature) => {
    const points = (creature.days ?? [])
      .filter((d) => typeof d.vars?.[PACK_PICK] === "number")
      .map((d) => ({ x: new Date(d.day + "T12:00:00Z").getTime(), y: d.vars[PACK_PICK], label: d.day }));
    const last = points.length === 0 ? null : points[points.length - 1].y;
    return '<div class="spark-card"><small>' + escape(creature.name) + "</small>" +
      "<b>" + (last === null ? "—" : last.toFixed(2)) + "</b>" +
      sparkline(points) + "</div>";
  }).join("");
}

async function loadPackMood() {
  const data = await call(forWho("/v1/psyche/branco?giorni=" + String(PACK_DAYS)), {});
  PACK_MOOD = data.creatures ?? [];
  $("pack-mood-vars").innerHTML = PSYCHE_ORDER.map((name) =>
    '<button type="button" class="ghost' + (name === PACK_PICK ? " on" : "") +
    '" data-packvar="' + name + '">' + escape(PSYCHE_LABEL[name] ?? name) + "</button>").join(" ");
  drawPackMood();
}

$("pack-mood-vars").addEventListener("click", (event) => {
  const name = event.target?.dataset?.packvar;
  if (!name) return;
  PACK_PICK = name;
  void section(loadPackMood, "pack-mood-msg");
});

$("pack-mood-days").addEventListener("change", () => {
  PACK_DAYS = Number($("pack-mood-days").value) || 14;
  void section(loadPackMood, "pack-mood-msg");
});
`;
