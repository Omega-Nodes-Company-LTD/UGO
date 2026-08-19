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

const ROLE_LABEL = { owner: "proprietario", member: "membro", operator: "operatore" };
const SIGNAL_LABEL = { too_loud: "parla troppo forte", leave_alone: "lasciami stare",
  good: "così va bene", wrong_name: "hai sbagliato nome" };

async function loadKeys() {
  const rows = (await call("/v1/tokens")).chiavi ?? [];
  $("key-rows").innerHTML = rows.length === 0
    ? '<p class="lede">Nessuna chiave: questa casa si apre solo dal token di servizio.</p>'
    : rows.map((row) => {
        const dead = row.revokedAt !== null;
        const seen = row.lastUsedAt ? "vista " + whenLabel(row.lastUsedAt) : "mai usata";
        return '<div class="line"><span class="when">' + whenLabel(row.createdAt) + '</span>' +
          '<b>' + escape(row.label) + '</b> ' +
          '<span class="tag">' + (ROLE_LABEL[row.role] ?? row.role) + '</span> ' +
          '<span class="lede">' + seen + '</span>' +
          (dead ? ' <span class="tag warn">revocata</span>'
                : ' <button class="ghost" data-burn="' + row.id + '">Revoca</button>') +
          '</div>';
      }).join("");
}

async function loadCorrections() {
  const rows = (await call("/v1/corrections")).correzioni ?? [];
  $("corr-rows").innerHTML = rows.length === 0
    ? '<p class="lede">Nessuna correzione: nessuno gli ha ancora detto di cambiare qualcosa.</p>'
    : rows.map((row) =>
        '<div class="line"><span class="when">' + whenLabel(row.createdAt) + '</span>' +
        '<b>' + escape(row.name) + '</b> ' +
        '<span class="tag">' + (SIGNAL_LABEL[row.signal] ?? row.signal) + '</span>' +
        ' <button class="ghost" data-undo-corr="' + row.id + '">Ritira</button></div>').join("");
}

const STEP_LABEL = { backup: "il backup", hygiene: "la pulizia", compaction: "il compattamento",
  contradictions: "le contraddizioni", reflect: "la riflessione", entities: "le entità",
  embeddings: "gli embedding", feeds: "i feed" };

async function loadJobReports() {
  const steps = (await call("/v1/jobs/reports")).passi ?? [];
  $("jobs-rows").innerHTML = steps.length === 0
    ? '<p class="lede">Nessun passo ancora registrato: il sogno non ha mai girato.</p>'
    : steps.map((row) =>
        '<div class="line"><span class="when">' + whenLabel(row.at) + '</span>' +
        '<b>' + escape(STEP_LABEL[row.step] ?? row.step) + '</b> ' +
        '<span class="lede">notte del ' + escape(row.date) + '</span>' +
        (row.mode === "light" ? ' <span class="tag">leggero</span>' : "")
        + '</div>').join("");

  const kiosks = (await call("/v1/kiosks")).chioschi ?? [];
  $("kiosk-rows").innerHTML = kiosks.length === 0
    ? '<p class="lede">Nessuno schermo collegato in questo momento.</p>'
    : kiosks.map((row) =>
        '<div class="line"><span class="when">adesso</span><b>' + escape(row.room) + '</b> ' +
        '<span class="tag ok">' + row.screens + (row.screens === 1 ? " schermo" : " schermi") +
        '</span></div>').join("");
}

$("key-new").addEventListener("click", () => {
  void section(async () => {
    const label = $("key-label").value.trim();
    if (label === "") throw new Error("dì a cosa serve, o fra un mese non lo saprai");
    const made = await call("/v1/tokens", {
      method: "POST",
      body: JSON.stringify({ label, role: $("key-role").value }),
    });
    // in chiaro una volta sola, e la pagina lo dice a chiare lettere
    $("key-fresh").hidden = false;
    $("key-fresh").className = "msg ok";
    $("key-fresh").textContent = "Copiala adesso, non si rivede: " + made.token;
    $("key-label").value = "";
    await loadKeys();
  }, "key-msg");
});

$("key-rows").addEventListener("click", (event) => {
  const id = event.target.dataset ? event.target.dataset.burn : undefined;
  if (!id) return;
  void section(async () => {
    await call("/v1/tokens/" + id, { method: "DELETE" });
    await loadKeys();
  }, "key-msg");
});

$("corr-rows").addEventListener("click", (event) => {
  const id = event.target.dataset ? event.target.dataset.undoCorr : undefined;
  if (!id) return;
  void section(async () => {
    await call("/v1/corrections/" + id, { method: "DELETE" });
    await loadCorrections();
  }, "corr-msg");
});

$("audit-more").addEventListener("click", () => { void section(() => loadAudit(true), "audit-msg"); });
$("msg-more").addEventListener("click", () => { void section(() => loadHouseMessages(true), "msg-msg"); });
$("perc-more").addEventListener("click", () => { void section(() => loadPerception(true), "perc-msg"); });
$("msg-who").addEventListener("change", () => { void section(() => loadHouseMessages(false), "msg-msg"); });
`;
