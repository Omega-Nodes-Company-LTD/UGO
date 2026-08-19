/**
 * Il giornale e la cronaca (ADR-099), lato pannello.
 *
 * Tre liste con un cursore ciascuna: «più indietro» continua da dove si era
 * arrivati invece di ricaricare tutto, perché un anno di registro non entra
 * in una pagina e caricarlo per intero sarebbe il modo di non guardarlo mai.
 */
export const JOURNAL_JS = `
const CURSOR = { audit: undefined, msg: undefined, perc: undefined };

/** Quando è successo, come lo direbbe una persona. */
function whenLabel(iso) {
  const at = new Date(iso);
  return at.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

async function loadAudit(more) {
  if (!more) { CURSOR.audit = undefined; $("audit-rows").innerHTML = ""; }
  const query = "/v1/audit?limite=50" + (CURSOR.audit ? "&prima=" + encodeURIComponent(CURSOR.audit) : "");
  const rows = (await call(query)).righe ?? [];
  const html = rows.map((row) =>
    '<div class="line"><span class="when">' + whenLabel(row.at) + '</span>' +
    '<b>' + row.verb + '</b> <span class="tag ' + (row.outcome === "ok" ? "ok" : "warn") + '">' +
    row.outcome + '</span>' +
    (row.role ? ' <span class="lede">' + row.role + '</span>' : "") +
    (row.resourceType ? ' <span class="lede">' + row.resourceType + '</span>' : "") +
    '</div>').join("");
  $("audit-rows").insertAdjacentHTML("beforeend", html || (more ? "" : '<p class="lede">Ancora niente.</p>'));
  const last = rows[rows.length - 1];
  CURSOR.audit = last ? last.at : undefined;
  $("audit-more").hidden = rows.length < 50;
}

async function loadHouseMessages(more) {
  if (!more) { CURSOR.msg = undefined; $("msg-rows").innerHTML = ""; }
  const who = $("msg-who").value;
  const query = "/v1/messages?limite=50" + (who ? "&gosino=" + encodeURIComponent(who) : "") +
    (CURSOR.msg ? "&prima=" + encodeURIComponent(CURSOR.msg) : "");
  const rows = (await call(query)).messaggi ?? [];
  const html = rows.map((row) =>
    '<div class="line"><span class="when">' + whenLabel(row.ts) + '</span>' +
    '<b>' + (row.role === "user" ? (row.who || "tu") : "UGO") + '</b> ' +
    '<span class="tag">' + row.channel + '</span> ' +
    escape(row.text) + '</div>').join("");
  $("msg-rows").insertAdjacentHTML("beforeend", html || (more ? "" : '<p class="lede">Ancora niente.</p>'));
  const last = rows[rows.length - 1];
  CURSOR.msg = last ? last.ts : undefined;
  $("msg-more").hidden = rows.length < 50;
}

async function loadPerception(more) {
  if (!more) { CURSOR.perc = undefined; $("perc-rows").innerHTML = ""; }
  const query = "/v1/perception?limite=50" + (CURSOR.perc ? "&prima=" + encodeURIComponent(CURSOR.perc) : "");
  const rows = (await call(query)).incontri ?? [];
  const html = rows.map((row) => {
    const seen = row.observed && row.observed.label ? " — " + escape(String(row.observed.label)) : "";
    const sure = row.confidence === null ? "" : ' <span class="lede">' + Math.round(row.confidence * 100) + '%</span>';
    return '<div class="line"><span class="when">' + whenLabel(row.ts) + '</span>' +
      '<span class="tag">' + row.modality + '</span> ' +
      '<b>' + (row.who ? escape(row.who) : "sconosciuto") + '</b>' + sure + seen + '</div>';
  }).join("");
  $("perc-rows").insertAdjacentHTML("beforeend", html || (more ? "" : '<p class="lede">Ancora niente.</p>'));
  const last = rows[rows.length - 1];
  CURSOR.perc = last ? last.ts : undefined;
  $("perc-more").hidden = rows.length < 50;
}

/** Il selettore di chi: gli esemplari di casa, più «tutti». */
function fillMessageWho() {
  $("msg-who").innerHTML = '<option value="">Tutti</option>' +
    GOSINI.map((g) => '<option value="' + g.id + '">' + escape(g.name) + '</option>').join("");
}

$("audit-more").addEventListener("click", () => { void section(() => loadAudit(true), "audit-msg"); });
$("msg-more").addEventListener("click", () => { void section(() => loadHouseMessages(true), "msg-msg"); });
$("perc-more").addEventListener("click", () => { void section(() => loadPerception(true), "perc-msg"); });
$("msg-who").addEventListener("change", () => { void section(() => loadHouseMessages(false), "msg-msg"); });
`;
