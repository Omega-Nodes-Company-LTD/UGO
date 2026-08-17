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
  const card = (b) => {
    const guard = (field, label) => '<label class="check"><input type="checkbox" data-toggle="' + field +
      '" data-being="' + b.id + '"' + (b[field] ? " checked" : "") + "> " + label + "</label>";
    const voice = b.hasVoiceProfile
      ? "impronta vocale · " + b.voiceSamples + " campion" + (b.voiceSamples === 1 ? "e" : "i")
      : b.isMinor || b.noAudio ? "nessuna impronta, per scelta" : "voce non ancora insegnata";
    const drop = b.hasVoiceProfile
      ? '<button class="ghost" data-drop-voice="' + b.id + '" data-testid="drop-voice">scorda la voce</button>'
      : "";
    return '<article class="being" data-testid="pack-row"><h4>' + escape(b.displayName) + "</h4>" +
      '<div class="species">' + (SPECIES_LABEL[b.species] ?? escape(b.species)) + " · " + voice + "</div>" +
      '<div class="bond"><div><span>conoscenza</span>' + meter(b.familiarity) + "</div>" +
      // affinity is signed, so it is drawn on a 0..1 scale centred on neutral
      '<div><span>affinità</span>' + meter((b.affinity + 1) / 2, 0.5) + "</div></div>" +
      '<div class="guards">' + guard("isMinor", "minorenne") + guard("noAudio", "non ascoltare") +
      guard("noVision", "non guardare") + "</div>" +
      (drop ? '<div style="margin-top:.5rem">' + drop + "</div>" : "") + "</article>";
  };
  document.querySelector('[data-testid="pack-rows"]').innerHTML = pack.map(card).join("") ||
    '<p class="empty">Nessuno, ancora. UGO risponderà a tutti come a sconosciuti.</p>';

  // a chi dire la correzione: le creature della casa, non le persone
  $("corr-who").innerHTML = GOSINI.map((g) =>
    '<option value="' + g.id + '">' + escape(g.name) + "</option>").join("");
  for (const select of ["enroll-being", "corr-being", "forget-being", "rel-a", "rel-b"]) {
    $(select).innerHTML = pack.map((b) => '<option value="' + b.id + '">' + escape(b.displayName) + "</option>").join("");
  }
  if (mine !== refreshSeq) return;
  // ADR-035: the pack, and nothing else. What each page needs, that page
  // loads when you open it — chaining them here is how one 404 on relations
  // used to leave the whole panel blank.
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

// Le virgolette le codifica a mano, e non è pedanteria: \`textContent\` da solo
// copre il contesto TESTO e non quello di ATTRIBUTO, e in \`feeds.ts\` questo
// stesso helper finisce dentro un \`data-name="…"\`. Un feed etichettato
// \`x" onmouseover="…\` usciva dall'attributo, e il token dell'operatore sta in
// \`localStorage\` sulla stessa origin. Una funzione sola per due contesti deve
// essere sicura nel più stretto dei due.
function escape(value) {
  const d = document.createElement("div");
  d.textContent = value;
  return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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
