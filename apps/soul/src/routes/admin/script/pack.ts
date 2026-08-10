/** The pack table: render, create, and amend the protections. */
export const PACK_JS = `
// --- il branco -------------------------------------------------------------
let pack = [];
// Two quick actions start two refreshes, and without this the SLOWER one wins
// and repaints the panel with data from before the last change. Latest call
// wins, every earlier one drops its result on the floor.
let refreshSeq = 0;

async function refresh() {
  const mine = ++refreshSeq;
  const data = await call("/v1/pack", {});
  if (mine !== refreshSeq) return;
  pack = data.beings;
  $("species-list").innerHTML = data.knownSpecies.map((s) => '<option value="' + s + '">').join("");
  const rows = pack.map((b) => {
    const flags = [b.isMinor ? "minorenne" : "", b.noAudio ? "non ascoltare" : "", b.noVision ? "non guardare" : ""]
      .filter(Boolean).join(" · ");
    const bond = b.familiarity >= 0.75 ? "vi conoscete bene" : b.familiarity >= 0.4 ? "un po'" : "poco";
    const voice = b.hasVoiceProfile ? "sì (" + b.voiceSamples + ")" : (b.isMinor || b.noAudio ? "—" : "no");
    const toggle = (field, label) => '<label class="flags" style="display:inline-block;margin-right:.6rem">' +
      '<input type="checkbox" data-toggle="' + field + '" data-being="' + b.id + '"' +
      (b[field] ? " checked" : "") + "> " + label + "</label>";
    const drop = b.hasVoiceProfile
      ? '<button class="ghost" data-drop-voice="' + b.id + '" data-testid="drop-voice">scorda la voce</button>'
      : "";
    return '<tr data-testid="pack-row"><td>' + escape(b.displayName) +
      (flags ? '<div class="flags">' + flags + "</div>" : "") + "</td><td>" +
      (SPECIES_LABEL[b.species] ?? escape(b.species)) + "</td><td>" + bond + "</td><td>" + voice + "</td><td>" +
      toggle("isMinor", "minorenne") + toggle("noAudio", "non ascoltare") + toggle("noVision", "non guardare") +
      "</td><td>" + drop + "</td></tr>";
  });
  document.querySelector('[data-testid="pack-rows"]').innerHTML = rows.join("") ||
    '<tr><td colspan="5">Nessuno, ancora. UGO risponderà a tutti come a sconosciuti.</td></tr>';
  for (const select of ["enroll-being", "corr-being", "forget-being", "rel-a", "rel-b"]) {
    $(select).innerHTML = pack.map((b) => '<option value="' + b.id + '">' + escape(b.displayName) + "</option>").join("");
  }
  if (mine !== refreshSeq) return;
  await loadRelations();
  await loadMeetings();
  await loadStats();
}

// tutele: cambiarle è un'azione, non una preferenza salvata da qualche parte
document.addEventListener("change", async (event) => {
  const box = event.target.closest?.("[data-toggle]");
  if (!box) return;
  const field = box.dataset.toggle;
  try {
    const report = await call("/v1/beings/" + box.dataset.being, {
      method: "PATCH", body: JSON.stringify({ [field]: box.checked }),
    });
    say("pack-msg", report.biometricsDestroyed > 0
      ? "Fatto — e l'impronta vocale è stata distrutta: revocare il consenso non è smettere di usare un dato."
      : "Fatto.", "ok");
    await refresh();
  } catch (error) { say("pack-msg", "Non aggiornato: " + error.message, "err"); box.checked = !box.checked; }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-drop-voice]");
  if (!button) return;
  try {
    const res = await call("/v1/beings/" + button.dataset.dropVoice + "/recognition/voice", { method: "DELETE" });
    say("pack-msg", "Impronta cancellata (" + res.destroyed + "). Resta nel branco, ma UGO non lo " +
      "riconoscerà più dalla voce finché non glielo reinsegni.", "ok");
    await refresh();
  } catch (error) { say("pack-msg", "Non cancellata: " + error.message, "err"); }
});

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
    await refresh();
    say("add-msg", displayName + " fa parte del branco. Il legame parte da zero: UGO deve guadagnarselo.", "ok");
  } catch (error) { say("add-msg", "Non aggiunto: " + error.message, "err"); }
});
`;
