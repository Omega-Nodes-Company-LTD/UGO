/**
 * La pagina del `/setup` (ADR-132 §2): quattro passi in parole di tutti i giorni.
 * HTML e script sono file distinti, serviti con una CSP chiusa (`default-src
 * 'self'`): niente script in linea, niente risorse esterne, niente font da
 * fuori. La chiave OpenRouter vive in un campo a sola scrittura che parla solo
 * con questa stessa origine (`127.0.0.1`).
 */
export const SETUP_HTML = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UGO — a casa tua</title>
<link rel="stylesheet" href="/setup/app.css">
</head>
<body>
<main>
  <h1>UGO, a casa tua</h1>
  <p id="lead">Porta qui la tua creatura: ti servono il file che hai scaricato e la frase di recupero che hai scritto su carta.</p>
  <p id="problem" role="alert" hidden></p>

  <section id="step-file">
    <h2>1. Il file</h2>
    <input id="file" type="file" accept=".ugosoul">
    <button id="send-file" type="button">Carica</button>
    <p class="hint">Il file resta su questo computer, cifrato, finché non finisci.</p>
  </section>

  <section id="step-code" hidden>
    <h2>2. La frase di recupero</h2>
    <input id="code" type="text" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">
    <button id="send-code" type="button">Controlla</button>
    <div id="preview"></div>
  </section>

  <section id="step-key" hidden>
    <h2>3. La tua chiave OpenRouter</h2>
    <p class="hint">UGO non ha un canone: paghi tu, direttamente a OpenRouter, quello che usi. Senza chiave la creatura conserva la memoria ma non può rispondere.</p>
    <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-…">
    <label for="budget">Tetto di spesa al giorno (dollari)</label>
    <input id="budget" type="number" min="0.05" max="100" step="0.05" value="0.5">
    <button id="install" type="button">Installa</button>
  </section>

  <section id="step-done" hidden>
    <h2>Fatto</h2>
    <p>La tua creatura è a casa. Questo è il codice del proprietario: <strong>lo vedi una volta sola</strong>, copialo ora.</p>
    <input id="owner-token" type="text" readonly>
    <p id="done-notes"></p>
    <p><a href="/">Apri UGO</a></p>
  </section>
</main>
<script src="/setup/app.js"></script>
</body>
</html>
`;

export const SETUP_CSS = `
:root{color-scheme:light dark;--bg:#fbf8f3;--fg:#2a2420;--soft:#7a6f66;--line:#ddd2c4;--accent:#b4572a}
@media (prefers-color-scheme:dark){:root{--bg:#1d1916;--fg:#f1e9df;--soft:#a99c90;--line:#3a322c;--accent:#e08a5a}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:2rem 1rem}
section{border-top:1px solid var(--line);padding:1rem 0}
input{display:block;width:100%;box-sizing:border-box;margin:.5rem 0;padding:.6rem;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:.4rem}
button{padding:.6rem 1rem;font:inherit;color:#fff;background:var(--accent);border:0;border-radius:.4rem;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}
.hint{color:var(--soft);font-size:.9rem}
#problem{color:#fff;background:#a33;padding:.6rem;border-radius:.4rem}
li{margin:.2rem 0}
`;

export const SETUP_JS = `
"use strict";
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
history.replaceState(null, "", location.pathname);

let onlyKey = false;
function problem(text) { const el = $("problem"); el.textContent = text; el.hidden = text === ""; }
function show(id, on) { $(id).hidden = !on; }
async function call(path, init) {
  const response = await fetch(path, { ...init, headers: { ...(init && init.headers), "x-setup-token": token } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "qualcosa non ha funzionato");
  return body;
}
async function busy(button, work) {
  button.disabled = true; problem("");
  try { await work(); } catch (error) { problem(error.message); } finally { button.disabled = false; }
}
function item(text) { const li = document.createElement("li"); li.textContent = text; return li; }

function renderPreview(info) {
  const box = $("preview"); box.replaceChildren();
  if (!info.compatibility.ok) { problem(info.compatibility.message); return false; }
  const list = document.createElement("ul");
  list.append(item(info.manifest.gosinoIds.length + " creatura/e, " + info.tables.reduce((n, t) => n + t.rows, 0) + " righe in " + info.tables.length + " tabelle"));
  list.append(item(info.manifest.mode === "copia" ? "È una COPIA: la creatura originale continua a vivere altrove, le due vite divergeranno." : "È un trasloco: la creatura si trasferisce qui."));
  list.append(item("Costo stimato per rifare la ricerca nei ricordi: circa " + info.embeddings.estimatedUsd.toFixed(4) + " $ (" + info.embeddings.rows + " testi)."));
  for (const o of info.manifest.omissions) list.append(item("Non è venuto: " + o.reason + " (" + o.count + ")"));
  box.append(list);
  return true;
}

$("send-file").addEventListener("click", (event) => busy(event.target, async () => {
  const file = $("file").files[0];
  if (!file) throw new Error("scegli prima il file");
  await call("/setup/archive", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
  show("step-file", false); show("step-code", true);
}));
$("send-code").addEventListener("click", (event) => busy(event.target, async () => {
  const info = await call("/setup/inspect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recoveryCode: $("code").value }) });
  if (renderPreview(info)) show("step-key", true);
}));
$("install").addEventListener("click", (event) => busy(event.target, async () => {
  if (onlyKey) {
    await call("/setup/key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ openRouterKey: $("key").value }) });
    location.reload();
    return;
  }
  const done = await call("/setup/install", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recoveryCode: $("code").value, openRouterKey: $("key").value, dailyBudgetUsd: Number($("budget").value) }) });
  $("key").value = ""; $("code").value = "";
  $("owner-token").value = done.ownerToken;
  $("done-notes").textContent = done.skippedRows > 0 ? done.skippedRows + " righe non potevano esistere qui e sono state lasciate." : "";
  for (const id of ["step-file", "step-code", "step-key"]) show(id, false);
  show("step-done", true);
}));

call("/setup/state").then((s) => {
  if (s.state === "ready") { $("lead").textContent = "Questa casa è già installata."; show("step-file", false); }
  if (s.state === "needs-key") { $("lead").textContent = "La casa è entrata ma manca la chiave: scrivila e finisci."; show("step-file", false); show("step-key", true); onlyKey = true; show("budget", false); }
}).catch((error) => problem(error.message));
`;
