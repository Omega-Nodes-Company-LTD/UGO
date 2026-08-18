/**
 * The customers section (ADR-052): list, detail, assignment, tokens, triage.
 *
 * The detail skeleton is static markup; loaders only fill containers, so
 * every listener is attached exactly once. The clear token value appears
 * exactly once — in the response of its creation — and the panel says so.
 */
export const CUSTOMERS_JS = `
const TICKET_LABEL = { open: "aperto", in_progress: "in lavorazione", waiting: "in attesa", closed: "chiuso" };
let CUSTOMER = "";
let CUSTOMER_ARCHIVED = false;

async function loadCustomers() {
  const found = (await call("/v1/customers", {})).customers ?? [];
  const card = (c) =>
    '<div class="deed"><div class="act">' + escape(c.name) +
    (c.archivedAt !== null ? ' <span class="deed-act">· archiviato</span>' : "") +
    (c.openTickets > 0 ? ' <span class="deed-act">· ' + c.openTickets + " ticket aperti</span>" : "") +
    '<button class="ghost cust-open" data-cust="' + c.id + '" data-testid="cust-open">apri</button>' +
    '</div><div class="because"><code>' + escape(c.slug) + "</code></div></div>";
  $("cust-list").innerHTML = found.length === 0
    ? '<p class="empty">Nessun cliente, per ora. Creane uno qui sopra.</p>'
    : found.map(card).join("");
  if (CUSTOMER !== "" && found.some((c) => c.id === CUSTOMER)) {
    await loadCustomerDetail();
  } else {
    CUSTOMER = "";
    $("cust-detail").hidden = true;
  }
}

async function loadCustomerDetail() {
  const c = await call("/v1/customers/" + encodeURIComponent(CUSTOMER), {});
  const stats = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/stats", {});
  const box = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/tickets", {});
  const assigned = new Set(c.gosini.map((g) => g.id));
  CUSTOMER_ARCHIVED = c.archivedAt !== null;

  $("cust-detail").hidden = false;
  $("cust-title").textContent = c.name;
  $("cust-slug").innerHTML = "<code>" + escape(c.slug) + "</code>" +
    (c.archivedAt !== null ? " · archiviato" : "");
  $("cust-budget").value = c.dailyBudgetUsd ?? "";
  $("cust-hourly").value = c.hourlyMessageLimit ?? "";
  $("cust-apples").value = c.weeklyRewardLimit ?? "";
  // ADR-058: lo stesso conteggio a finestra mobile che la reception applica
  $("cust-apples-given").textContent = c.rewardsThisWeek === 0
    ? "Non ha ancora dato mele negli ultimi 7 giorni."
    : "Ha dato " + c.rewardsThisWeek + (c.rewardsThisWeek === 1 ? " mela" : " mele") +
      " negli ultimi 7 giorni: le dà quando una risposta è davvero ottima.";
  $("cust-archive").textContent = c.archivedAt === null ? "Archivia il cliente" : "Riapri il cliente";

  $("cust-gosini-list").innerHTML = GOSINI.length === 0
    ? '<p class="empty">Non è ancora nato nessuno.</p>'
    : GOSINI.map((g) =>
        '<label class="row" style="gap:.4rem"><input type="checkbox" class="cust-gosino" value="' + g.id + '"' +
        (assigned.has(g.id) ? " checked" : "") + "> " + escape(g.name) +
        (g.where ? ' <span class="persona">· ' + escape(g.where) + "</span>" : "") + "</label>").join("");

  $("cust-tokens").innerHTML = c.tokens.length === 0
    ? '<p class="empty">Nessun token: il cliente non può ancora entrare.</p>'
    : c.tokens.map((t) =>
        '<div class="deed"><div class="act">' + escape(t.label) +
        (t.revokedAt !== null ? ' <span class="deed-act">· revocato</span>'
          : '<button class="ghost cust-token-del" data-token="' + t.id + '" data-testid="cust-token-del">revoca</button>') +
        '</div><div class="because">creato ' + t.createdAt.slice(0, 10) +
        (t.lastUsedAt !== null ? " · usato " + t.lastUsedAt.slice(0, 10) : " · mai usato") +
        "</div></div>").join("");

  $("cust-tickets").innerHTML = box.tickets.length === 0
    ? '<p class="empty">Nessuna richiesta raccolta finora.</p>'
    : box.tickets.map((t) =>
        '<div class="deed"><div class="act">' + escape(t.title) +
        ' <select class="cust-ticket-status" data-ticket="' + t.id + '" data-testid="cust-ticket-status">' +
        Object.keys(TICKET_LABEL).map((s) =>
          '<option value="' + s + '"' + (s === t.status ? " selected" : "") + ">" + TICKET_LABEL[s] + "</option>").join("") +
        "</select></div>" +
        '<div class="because">' + escape(t.body ?? "") + "</div>" +
        '<div class="because">' + t.createdAt.slice(0, 10) + "</div></div>").join("");

  $("cust-stats").innerHTML = stats.perGosino.length === 0 ? ""
    : "<h3>Chi ascolta questo cliente</h3>" + stats.perGosino.map((s) =>
        '<div class="because">' + escape(s.name) + ": " + s.messages + " domande, " +
        s.tickets + " ticket, " + s.cachedReplies + " risposte dalla cache, $" +
        s.costUsd.toFixed(4) + "</div>").join("");

  await loadCustomerSources();
}

const SOURCE_STATE = { pending: "in attesa", ok: "aggiornata", error: "in errore" };

async function loadCustomerSources() {
  const src = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/sources", {});
  const line = (kindClass, id, label, meta) =>
    '<div class="deed"><div class="act">' + label +
    '<button class="ghost ' + kindClass + '" data-src="' + id + '" data-testid="' + kindClass + '">scollega</button>' +
    '</div><div class="because">' + meta + "</div></div>";
  const parts = [];
  for (const r of src.repos) {
    parts.push(line("cust-repo-del", r.id, escape(r.remoteUrl),
      SOURCE_STATE[r.status] + (r.lastCommitSha ? " · " + r.lastCommitSha.slice(0, 7) : "") +
      (r.lastIndexedAt ? " · indicizzato " + r.lastIndexedAt.slice(0, 10) : " · mai indicizzato")));
  }
  for (const m of src.mailAccounts) {
    parts.push(line("cust-mail-del", m.id, escape(m.username) + " @ " + escape(m.imapHost),
      SOURCE_STATE[m.status] + " · solo lettura · UID " + m.lastUid +
      (m.senders ? " · solo da/per " + escape(m.senders) : " · tutta la cartella")));
  }
  for (const d of src.documents) {
    parts.push(line("cust-doc-del", d.id, escape(d.filename),
      SOURCE_STATE[d.status] + " · " + Math.ceil(d.sizeBytes / 1024) + " KB" +
      (d.indexedAt ? " · indicizzato" : "")));
  }
  $("cust-sources").innerHTML = parts.length === 0
    ? '<p class="empty">Nessuna fonte: il gosino risponder\\u00e0 solo di ticket e conversazioni.</p>'
    : parts.join("");
}

$("cust-go").addEventListener("click", async () => {
  const name = $("cust-name").value.trim();
  if (name === "") { say("cust-msg", "Serve un nome.", "info"); return; }
  $("cust-go").disabled = true;
  try {
    const made = await call("/v1/customers", { method: "POST", body: JSON.stringify({ name }) });
    $("cust-name").value = "";
    CUSTOMER = made.id;
    say("cust-msg", "Creato. Ora assegnagli un gosino e un token, qui sotto.", "ok");
    await loadCustomers();
  } catch (error) {
    say("cust-msg", error.message, "err");
  } finally { $("cust-go").disabled = false; }
});

$("cust-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".cust-open");
  if (button === null) return;
  CUSTOMER = button.dataset.cust;
  $("cust-token-once").innerHTML = "";
  await section(loadCustomerDetail, "cust-detail-msg");
});

$("cust-assign").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll(".cust-gosino:checked")].map((box) => box.value);
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/gosini",
      { method: "PUT", body: JSON.stringify({ gosinoIds: ids }) });
    say("cust-detail-msg", ids.length === 0
      ? "Nessun ascoltatore: la reception per lui è chiusa."
      : "Adesso lo ascoltano in " + ids.length + ".", "ok");
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-limits").addEventListener("click", async () => {
  const budget = $("cust-budget").value.trim();
  const hourly = $("cust-hourly").value.trim();
  const apples = $("cust-apples").value.trim();
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER), {
      method: "PATCH",
      body: JSON.stringify({
        dailyBudgetUsd: budget === "" ? null : Number(budget),
        hourlyMessageLimit: hourly === "" ? null : Number(hourly),
        weeklyRewardLimit: apples === "" ? null : Number(apples),
      }),
    });
    say("cust-detail-msg", "Limiti salvati.", "ok");
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-token-go").addEventListener("click", async () => {
  const label = $("cust-token-label").value.trim();
  if (label === "") { say("cust-detail-msg", "Di' per cosa è il token.", "info"); return; }
  try {
    const made = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/tokens",
      { method: "POST", body: JSON.stringify({ label }) });
    $("cust-token-label").value = "";
    // the one and only appearance of the clear value (ADR-052)
    $("cust-token-once").innerHTML =
      '<div class="msg ok" data-testid="cust-token-value">Consegna questo token al cliente, ora: ' +
      "<code>" + escape(made.token) + "</code><br>Non verrà mostrato mai più.</div>";
    await loadCustomerDetail();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-forget").addEventListener("click", () => {
  void section(async () => {
    const typed = $("cust-forget-confirm").value;
    const report = await call("/v1/customers/" + CUSTOMER, {
      method: "DELETE",
      body: JSON.stringify({ confirmName: typed }),
    });
    $("cust-forget-confirm").value = "";
    say("cust-detail-msg",
      "Dimenticato: " + String(report.documentsFound) + " documenti tolti anche dal bucket.", "ok");
    $("cust-detail").hidden = true;
    await loadCustomers();
  }, "cust-detail-msg");
});

$("cust-archive").addEventListener("click", async () => {
  const closing = !CUSTOMER_ARCHIVED;
  if (closing && !confirm("Archiviare questo cliente? I suoi token smettono di valere subito.")) return;
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER),
      { method: "PATCH", body: JSON.stringify({ archived: closing }) });
    await loadCustomers();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-repo-go").addEventListener("click", async () => {
  const remoteUrl = $("cust-repo-url").value.trim();
  if (remoteUrl === "") { say("cust-detail-msg", "Serve l'URL del repository.", "info"); return; }
  const pat = $("cust-repo-pat").value.trim();
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/repos", {
      method: "POST",
      body: JSON.stringify({
        remoteUrl,
        defaultBranch: $("cust-repo-branch").value.trim() || "main",
        ...(pat === "" ? {} : { pat }),
      }),
    });
    $("cust-repo-url").value = ""; $("cust-repo-pat").value = "";
    say("cust-detail-msg", "Repo collegato: verr\\u00e0 clonato e indicizzato al prossimo giro.", "ok");
    await loadCustomerSources();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-mail-go").addEventListener("click", async () => {
  const imapHost = $("cust-mail-host").value.trim();
  const username = $("cust-mail-user").value.trim();
  const password = $("cust-mail-pass").value;
  if (imapHost === "" || username === "" || password === "") {
    say("cust-detail-msg", "Servono host, utente e password della casella.", "info"); return;
  }
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/mail", {
      method: "POST",
      body: JSON.stringify({
        imapHost,
        imapPort: Number($("cust-mail-port").value.trim() || "993"),
        username,
        password,
        folder: $("cust-mail-folder").value.trim() || "INBOX",
        // il pre-filtro: solo le mail di QUEL cliente, non tutta la casella
        ...($("cust-mail-senders").value.trim() !== "" &&
          { senders: $("cust-mail-senders").value.trim() }),
      }),
    });
    $("cust-mail-pass").value = "";
    say("cust-detail-msg", "Casella collegata, in sola lettura.", "ok");
    await loadCustomerSources();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-doc-go").addEventListener("click", async () => {
  const file = $("cust-doc-file").files?.[0];
  if (file === undefined) { say("cust-detail-msg", "Scegli prima un file.", "info"); return; }
  $("cust-doc-go").disabled = true;
  try {
    const signed = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/documents/presign", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, mime: file.type || "text/plain" }),
    });
    const put = await fetch(signed.url, { method: "PUT", body: file,
      headers: { "content-type": file.type || "text/plain" } });
    if (!put.ok) throw new Error("upload fallito (HTTP " + put.status + ")");
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/documents", {
      method: "POST",
      body: JSON.stringify({ s3Key: signed.key, filename: file.name,
        mime: file.type || "text/plain", sizeBytes: file.size }),
    });
    $("cust-doc-file").value = "";
    say("cust-detail-msg", "Caricato: verr\\u00e0 letto e indicizzato al prossimo giro.", "ok");
    await loadCustomerSources();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
  finally { $("cust-doc-go").disabled = false; }
});

$("cust-sync-go").addEventListener("click", async () => {
  try {
    const result = await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/sync", { method: "POST", body: "{}" });
    say("cust-detail-msg", result.status === "triggered"
      ? "Sincronizzazione partita."
      : (result.detail ?? "Richiesta registrata."), "ok");
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-sources").addEventListener("click", async (event) => {
  const target = event.target;
  const kinds = [
    ["cust-repo-del", "/repos/"],
    ["cust-mail-del", "/mail/"],
    ["cust-doc-del", "/documents/"],
  ];
  for (const [className, segment] of kinds) {
    const button = target.closest("." + className);
    if (button === null) continue;
    if (!confirm("Scollegare questa fonte? L'indice che ne deriva sparisce con lei.")) return;
    try {
      await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + segment + encodeURIComponent(button.dataset.src),
        { method: "DELETE" });
      await loadCustomerSources();
    } catch (error) { say("cust-detail-msg", error.message, "err"); }
    return;
  }
});

$("cust-tokens").addEventListener("click", async (event) => {
  const del = event.target.closest(".cust-token-del");
  if (del === null) return;
  if (!confirm("Revocare questo token? Il cliente che lo usa resta fuori.")) return;
  try {
    await call("/v1/customers/" + encodeURIComponent(CUSTOMER) + "/tokens/" + encodeURIComponent(del.dataset.token),
      { method: "DELETE" });
    await loadCustomerDetail();
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});

$("cust-tickets").addEventListener("change", async (event) => {
  const select = event.target.closest(".cust-ticket-status");
  if (select === null) return;
  try {
    await call("/v1/tickets/" + encodeURIComponent(select.dataset.ticket),
      { method: "PATCH", body: JSON.stringify({ status: select.value }) });
    say("cust-detail-msg", "Adesso è «" + TICKET_LABEL[select.value] + "».", "ok");
  } catch (error) { say("cust-detail-msg", error.message, "err"); }
});
`;
