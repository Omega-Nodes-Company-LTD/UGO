/**
 * Panel behaviour. Kept out of the markup module so neither file grows past
 * what a person can read in one sitting (CLAUDE.md rule 10).
 *
 * Every refusal is shown as what it is: a 403 on enrollment is a protection
 * doing its job, not a malfunction, and the panel says so in those words.
 */
export const ADMIN_SCRIPT = `
const $ = (id) => document.getElementById(id);
const token = () => sessionStorage.getItem("ugo_token") ?? "";
const headers = () => ({ "content-type": "application/json", authorization: "Bearer " + token() });
const say = (where, text, kind) => { $(where).innerHTML = ""; const d = document.createElement("div");
  d.className = "msg " + (kind ?? "info"); d.textContent = text; d.dataset.testid = where + "-text";
  $(where).appendChild(d); };

const SPECIES_LABEL = { human: "persona", dog: "cane", parrot: "pappagallo", reptile: "rettile" };

async function call(path, options) {
  const res = await fetch(path, { ...options, headers: headers() });
  let body = null;
  try { body = await res.json(); } catch { /* empty body is fine */ }
  if (!res.ok) {
    const detail = body?.detail ?? body?.title ?? ("HTTP " + res.status);
    const error = new Error(detail); error.status = res.status; throw error;
  }
  return body;
}

// --- accesso ---------------------------------------------------------------
$("save-token").addEventListener("click", async () => {
  sessionStorage.setItem("ugo_token", $("token").value.trim());
  try {
    await call("/v1/stats", {});
    $("app").hidden = false; $("auth").hidden = true;
    await refresh();
  } catch (error) {
    say("auth-msg", error.status === 401 ? "Token non valido." : "Non riesco a parlare con UGO: " + error.message, "err");
  }
});

// --- il branco -------------------------------------------------------------
let pack = [];

async function refresh() {
  const data = await call("/v1/pack", {});
  pack = data.beings;
  $("species-list").innerHTML = data.knownSpecies.map((s) => '<option value="' + s + '">').join("");
  const rows = pack.map((b) => {
    const flags = [b.isMinor ? "minorenne" : "", b.noAudio ? "non ascoltare" : "", b.noVision ? "non guardare" : ""]
      .filter(Boolean).join(" · ");
    const bond = b.familiarity >= 0.75 ? "vi conoscete bene" : b.familiarity >= 0.4 ? "un po'" : "poco";
    const voice = b.hasVoiceProfile ? "sì (" + b.voiceSamples + ")" : (b.isMinor || b.noAudio ? "—" : "no");
    return '<tr data-testid="pack-row"><td>' + escape(b.displayName) +
      (flags ? '<div class="flags">' + flags + "</div>" : "") + "</td><td>" +
      (SPECIES_LABEL[b.species] ?? escape(b.species)) + "</td><td>" + bond + "</td><td>" + voice + "</td><td></td></tr>";
  });
  document.querySelector('[data-testid="pack-rows"]').innerHTML = rows.join("") ||
    '<tr><td colspan="5">Nessuno, ancora. UGO risponderà a tutti come a sconosciuti.</td></tr>';
  for (const select of ["enroll-being", "corr-being"]) {
    $(select).innerHTML = pack.map((b) => '<option value="' + b.id + '">' + escape(b.displayName) + "</option>").join("");
  }
  await loadStats();
}

function escape(value) { const d = document.createElement("div"); d.textContent = value; return d.innerHTML; }

$("add-being").addEventListener("click", async () => {
  const displayName = $("name").value.trim();
  if (!displayName) { say("add-msg", "Serve almeno un nome.", "err"); return; }
  const body = {
    displayName, species: $("species").value.trim() || "human", kind: $("kind").value,
    isMinor: $("minor").checked, noAudio: $("no-audio").checked, noVision: $("no-vision").checked,
    ...($("arrival").value ? { arrivalAt: $("arrival").value } : {}),
  };
  try {
    await call("/v1/beings", { method: "POST", body: JSON.stringify(body) });
    $("name").value = ""; $("minor").checked = false; $("no-audio").checked = false; $("no-vision").checked = false;
    say("add-msg", displayName + " fa parte del branco. Il legame parte da zero: UGO deve guadagnarselo.", "ok");
    await refresh();
  } catch (error) { say("add-msg", "Non aggiunto: " + error.message, "err"); }
});

// --- enrollment vocale -----------------------------------------------------
const RECORD_MS = 10_000;

$("rec").addEventListener("click", async () => {
  const beingId = $("enroll-being").value;
  if (!beingId) { say("enroll-msg", "Aggiungi prima qualcuno al branco.", "err"); return; }
  const button = $("rec");
  button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) chunks.push(event.data); });
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve));
    recorder.start();
    button.innerHTML = '<span class="rec">● sto ascoltando…</span>';
    say("enroll-msg", "Parla normalmente per dieci secondi.", "info");
    setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, RECORD_MS);
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    await upload(beingId, new Blob(chunks, { type: "audio/webm" }));
  } catch (error) {
    if (error.status === 403) {
      say("enroll-msg", "Rifiutato, ed è giusto così: per questa persona hai chiesto di non " +
        "costruire un'impronta della voce (minorenne o opt-out audio).", "info");
    } else {
      say("enroll-msg", "Non ha funzionato: " + error.message, "err");
    }
  } finally {
    button.disabled = false; button.textContent = "● Registra 10 s";
  }
});

async function upload(beingId, blob) {
  if (blob.size === 0) throw new Error("non è arrivato audio dal microfono");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const filename = "enroll_" + beingId.slice(0, 8) + "_" + stamp + ".webm";
  const presigned = await call("/v1/audio/presign", { method: "POST", body: JSON.stringify({ filename }) });
  const put = await fetch(presigned.url, { method: "PUT", body: blob });
  if (!put.ok) throw new Error("caricamento fallito (" + put.status + ")");
  await call("/v1/beings/" + beingId + "/enroll/voice", {
    method: "POST", body: JSON.stringify({ objectKey: presigned.key }),
  });
  say("enroll-msg", "Me lo segno. L'impronta nasce stanotte, nel sogno — o subito se premi " +
    '"Fallo sognare adesso".', "ok");
}

// --- correzioni ------------------------------------------------------------
$("add-corr").addEventListener("click", async () => {
  try {
    await call("/v1/corrections", {
      method: "POST",
      body: JSON.stringify({ aboutBeing: $("corr-being").value, signal: $("corr-signal").value }),
    });
    say("corr-msg", "Preso. Se lo ricorderà nelle prossime conversazioni.", "ok");
  } catch (error) { say("corr-msg", "Non registrata: " + error.message, "err"); }
});

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

$("refresh").addEventListener("click", async () => {
  try { await refresh(); say("stats-msg", "Aggiornato.", "ok"); }
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
