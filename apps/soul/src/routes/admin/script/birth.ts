/**
 * Making a new one (ADR-035).
 *
 * `POST /v1/gosini` has existed since ADR-031 and could only be reached with
 * curl, which meant "una famiglia può avere più UGO" was true of the database
 * and false of anything the owner could do.
 *
 * The dials are the genome (ADR-015), and they are **version 1, immutable from
 * here**: a change is a new version, not an edit. So the form says what it is
 * doing rather than pretending it can be undone with a slider later.
 */
export const BIRTH_JS = `
const DIALS = [
  { key: "curiosity", label: "curiosità", hint: "quanto vuole sapere" },
  { key: "boldness", label: "sfacciataggine", hint: "quanto osa cominciare" },
  { key: "affection", label: "affetto", hint: "quanto si attacca" },
  { key: "calm", label: "calma", hint: "quanto poco si agita" },
  { key: "talkativeness", label: "parlantina", hint: "quanto lungo risponde" },
];
/** Left untouched, a dial stays undefined and the archetype keeps the last word. */
const dialTouched = new Set();

/** ADR-039: the rooms are a list now, so being born into one is a choice. */
async function drawBirthRooms() {
  const known = (await call("/v1/rooms", {})).rooms ?? [];
  $("new-where").innerHTML = '<option value="">— nessuna stanza —</option>' +
    known.map((r) => '<option value="' + escape(r.room) + '">' + escape(r.room) + "</option>").join("");
}

function drawDials() {
  if ($("new-dials").children.length > 0) return;
  $("new-dials").innerHTML = DIALS.map((d) =>
    '<label class="dial" title="' + d.hint + '"><span>' + d.label + "</span>" +
    '<input type="range" min="0" max="1" step="0.05" value="0.5" data-dial="' + d.key + '">' +
    "<b>—</b></label>").join("");
}

$("new-dials").addEventListener("input", (event) => {
  const dial = event.target.dataset.dial;
  if (dial === undefined) return;
  dialTouched.add(dial);
  event.target.parentElement.querySelector("b").textContent = Number(event.target.value).toFixed(2);
});

$("new-go").addEventListener("click", async () => {
  const name = $("new-name").value.trim();
  if (name === "") { say("new-msg", "Serve un nome.", "info"); return; }
  const where = $("new-where").value.trim();
  const archetype = $("new-archetype").value;
  const traits = {};
  for (const input of $("new-dials").querySelectorAll("[data-dial]")) {
    if (dialTouched.has(input.dataset.dial)) traits[input.dataset.dial] = Number(input.value);
  }

  $("new-go").disabled = true;
  try {
    const born = await call("/v1/gosini", {
      method: "POST",
      body: JSON.stringify({
        name,
        ...(where === "" ? {} : { locationLabel: where }),
        ...(archetype === "" ? {} : { archetype }),
        ...(Object.keys(traits).length === 0 ? {} : { traits }),
      }),
    });
    say("new-msg", "È nato " + born.name + ": " + born.persona, "ok");
    $("new-name").value = "";
    await drawBirthRooms();
    await loadGosini();
    WHO = born.id;
    location.hash = "#/g/" + born.id + "/stato";
  } catch (error) {
    say("new-msg", error.message, "err");
  } finally { $("new-go").disabled = false; }
});

/**
 * The litter (ADR-069). «Si adotta, non si configura»: no dials here — you
 * pick the parents, look at the born, and adopt one. The seed comes back from
 * the preview and goes into the adoption, so what you saw is what is born.
 */
let LITTER_STATE = null; // { seed, parentIds, cubs } of the litter on screen
let LITTER_PICK = -1;

async function drawLitterParents() {
  const all = (await call("/v1/gosini", {})).gosini ?? [];
  const options = all.map((g) =>
    '<option value="' + escape(g.id) + '">' + escape(g.name) + "</option>").join("");
  $("litter-a").innerHTML = options;
  $("litter-b").innerHTML = options;
  if (all.length > 1) $("litter-b").selectedIndex = 1;
}

function drawLitterCubs() {
  const cubs = LITTER_STATE?.cubs ?? [];
  $("litter-cubs").innerHTML = cubs.map((cub) => {
    const coat = "chiazze " + cub.traits.spots.toFixed(2) +
      " · coda " + cub.traits.tail.toFixed(2) + " · tinta " + cub.traits.hue.toFixed(2);
    return '<button class="cub" data-cub="' + cub.index + '"' +
      ' data-viable="' + cub.viable + '"' +
      ' data-picked="' + (cub.index === LITTER_PICK) + '">' +
      "<h4>Cucciolo " + (cub.index + 1) + "</h4>" +
      '<div class="persona">' + escape(cub.persona) + "</div>" +
      '<div class="coat">' + coat + "</div>" +
      (cub.viable ? "" : '<div class="warn">non vitale: ' + escape((cub.reasons ?? []).join("; ")) + "</div>") +
      "</button>";
  }).join("");
}

$("litter-go").addEventListener("click", async () => {
  const parentIds = [$("litter-a").value, $("litter-b").value];
  if (parentIds[0] === "" || parentIds[1] === "" || parentIds[0] === parentIds[1]) {
    say("litter-msg", "Servono due genitori diversi.", "info"); return;
  }
  $("litter-go").disabled = true;
  try {
    const litter = await call("/v1/gosini/litters", {
      method: "POST", body: JSON.stringify({ parentIds }),
    });
    LITTER_STATE = { seed: litter.seed, parentIds, cubs: litter.cubs };
    LITTER_PICK = -1;
    $("litter-adopt").disabled = true;
    drawLitterCubs();
    say("litter-msg", "Cucciolata " + litter.seed + ": scegli chi adottare.", "info");
  } catch (error) {
    LITTER_STATE = null; $("litter-cubs").innerHTML = "";
    say("litter-msg", error.message, "err");
  } finally { $("litter-go").disabled = false; }
});

$("litter-cubs").addEventListener("click", (event) => {
  const card = event.target.closest("[data-cub]");
  if (card === null || LITTER_STATE === null) return;
  const cub = LITTER_STATE.cubs[Number(card.dataset.cub)];
  if (cub === undefined) return;
  if (!cub.viable) { say("litter-msg", "Questo cucciolo non è vitale: non può nascere.", "info"); return; }
  LITTER_PICK = cub.index;
  $("litter-adopt").disabled = false;
  drawLitterCubs();
});

$("litter-adopt").addEventListener("click", async () => {
  if (LITTER_STATE === null || LITTER_PICK < 0) return;
  const name = $("litter-name").value.trim();
  if (name === "") { say("litter-msg", "Serve un nome.", "info"); return; }
  $("litter-adopt").disabled = true;
  try {
    const born = await call("/v1/gosini/births", {
      method: "POST",
      body: JSON.stringify({
        parentIds: LITTER_STATE.parentIds,
        seed: LITTER_STATE.seed,
        cubIndex: LITTER_PICK,
        name,
      }),
    });
    say("litter-msg", "È nato " + born.name + " (generazione " + born.generation + "): " + born.persona, "ok");
    LITTER_STATE = null; LITTER_PICK = -1;
    $("litter-cubs").innerHTML = ""; $("litter-name").value = "";
    await drawLitterParents();
    await loadGosini();
    WHO = born.id;
    location.hash = "#/g/" + born.id + "/stato";
  } catch (error) {
    say("litter-msg", error.message, "err");
    $("litter-adopt").disabled = false;
  }
});
`;
