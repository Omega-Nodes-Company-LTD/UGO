/**
 * Il comportamento della pagina di diagnostica.
 *
 * Due regole che questo file rispetta e che il pannello ha imparato a caro
 * prezzo (STATE §6-quadragies): ogni chiamata passa da `call()` — che porta la
 * casa (ADR-019 fase 3) e che `script.test.ts` esegue davvero — e ogni id
 * toccato qui esiste nel markup, che lo stesso test verifica.
 *
 * E una che vale solo qui: lo stato non viaggia mai sul colore da solo. Una
 * parola e una forma accompagnano sempre la tinta, perché questa pagina si
 * apre quando qualcosa è rotto, e allora si guarda di fretta e spesso da un
 * telefono al sole.
 */
export const DIAGNOSTICS_JS = `
// --- diagnostica -----------------------------------------------------------
const DIAG_WORD = { ok: "risponde", partial: "a met\\u00e0 servizio", slow: "lento",
  down: "non risponde", off: "spento" };
const DIAG_MARK = { ok: "\\u25cf", partial: "\\u25d0", slow: "\\u25b2", down: "\\u25a0", off: "\\u25cb" };
const DIAG_PILL = { ok: "good", partial: "warning", slow: "warning", down: "critical", off: "good" };
const VERDICT_WORD = {
  ok: "Tutto risponde.",
  degraded: "Qualcosa arranca: le righe gialle e rosse qui sotto dicono chi.",
  unavailable: "Manca un pezzo vitale: senza, UGO non risponde affatto.",
};

/** millisecondi come li legge una persona: 840 ms, 3,2 s, 1 m 06 s. */
function ms(value) {
  if (value === null || value === undefined) return "\\u2014";
  if (value < 1000) return Math.round(value) + " ms";
  if (value < 60000) return (value / 1000).toFixed(1).replace(".", ",") + " s";
  const m = Math.floor(value / 60000);
  return m + " m " + String(Math.round((value % 60000) / 1000)).padStart(2, "0") + " s";
}

function diagRow(s) {
  const hint = s.hint ? '<p class="diag-hint">Cosa fare: ' + escape(s.hint) + "</p>" : "";
  const why = s.why ? '<p class="diag-why">' + escape(s.why) + "</p>" : "";
  const detail = s.detail ? '<p class="diag-detail">' + escape(s.detail) + "</p>" : "";
  return '<div class="diag-row">' +
    '<span class="diag-mark" aria-hidden="true">' + (DIAG_MARK[s.state] ?? "\\u25cf") + "</span>" +
    '<span class="diag-name">' + escape(s.label) +
      " <code>" + escape(s.container) + "</code></span>" +
    '<span class="pill ' + (DIAG_PILL[s.state] ?? "good") + '">' +
      (DIAG_WORD[s.state] ?? s.state) + "</span>" +
    '<p class="diag-what">' + escape(s.what) + "</p>" +
    detail + why + hint +
    '<p class="diag-ms" style="grid-column:2/-1">' +
      (s.ms === null ? "non cronometrato" : ms(s.ms)) + "</p>" +
    "</div>";
}

/**
 * Un turno come una barra spezzata.
 *
 * La barra e i numeri insieme: la barra dice a colpo d'occhio QUALE fase si è
 * mangiata il turno, i numeri dicono quanto — e serve saperlo entrambi, perché
 * «il modello è il 90%» non dice se il turno è durato mezzo secondo o un minuto.
 */
function diagTurn(turn) {
  const total = Math.max(turn.totalMs, 1);
  const bar = turn.stages.map((stage, index) =>
    '<span style="width:' + ((stage.ms / total) * 100).toFixed(1) + "%;background:" +
    ["var(--accent)", "var(--warning, #c98a00)", "var(--ink-3)"][index % 3] + '"></span>').join("");
  const parts = turn.stages.map((stage) => escape(stage.name) + " " + ms(stage.ms)).join(" \\u00b7 ");
  return '<div class="diag-turn"><b>' + ms(turn.totalMs) + "</b> \\u00b7 " +
    escape(new Date(turn.at).toLocaleTimeString("it-IT")) + " \\u00b7 " + escape(turn.channel) +
    '<div class="diag-bar">' + bar + "</div>" +
    '<span class="diag-legend">' + (parts === "" ? "risolto in casa, senza uscire" : parts) + "</span></div>";
}

async function loadDiagnostics() {
  const report = await call("/v1/diagnostics", {});
  $("diag-verdict").textContent = VERDICT_WORD[report.verdict] ?? report.verdict;
  $("diag-verdict").className = "verdict " + (report.verdict === "ok" ? "good" : "critical");
  // il ciclo di eventi per primo: se soul è occupato, ogni altro numero di
  // questa pagina è gonfiato e va letto sapendolo
  $("diag-soul").textContent =
    "soul: acceso da " + Math.round(report.soul.uptimeS / 60) + " min \\u00b7 " +
    report.soul.rssMb + " MB \\u00b7 muso " + report.soul.faceVersion +
    " \\u00b7 ritardo interno " + ms(report.soul.eventLoopMs) +
    (report.soul.eventLoopMs > 50
      ? " \\u2014 soul \\u00e8 occupato: ogni misura qui sotto \\u00e8 gonfiata di altrettanto"
      : "");
  $("diag-services").innerHTML = report.services.map(diagRow).join("");

  const t = report.turns;
  $("diag-median").textContent = ms(t.medianMs);
  $("diag-slowest").textContent = ms(t.slowestMs);
  $("diag-turns").innerHTML = t.turns.length === 0
    ? '<p class="empty">Nessun turno da quando soul \\u00e8 acceso. Parlagli e ricarica.</p>'
    : t.turns.map(diagTurn).join("");

  const c = t.counters;
  const lost = c.heard - c.answered - c.refused - c.failed;
  $("diag-counters").innerHTML =
    tile("sentite", c.heard, "frasi arrivate dal muso") +
    tile("risposte", c.answered, "diventate una risposta") +
    tile("rifiutate", c.refused, "il contratto le ha respinte") +
    tile("fallite", c.failed, "morte in un errore") +
    (lost > 0 ? tile("in volo", lost, "ancora in corso adesso") : "");
}

$("diag-refresh").addEventListener("click", async () => {
  say("diag-msg", "Sto ribussando a tutte le porte\\u2026", "info");
  await section(loadDiagnostics, "diag-msg");
  say("diag-msg", "Aggiornata.", "ok");
});
`;
