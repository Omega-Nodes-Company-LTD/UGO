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
 * La cucciolata (ADR-069, riscritta da ADR-103).
 *
 * «Si adotta, non si configura», e adesso per davvero: qui non c'è né una
 * manopola sul carattere né una sul **numero**. Si guardano i cuccioli che il
 * seme ha fatto, si dà un nome a ognuno, e nascono tutti — la scelta di chi
 * tenere vicino è a posteriori, guardandoli crescere, non a priori scartando
 * fratelli mai esistiti.
 */
let LITTER_STATE = null; // { seed, parentIds, cubs, costUsd, generation }

async function drawLitterParents() {
  const all = (await call("/v1/gosini", {})).gosini ?? [];
  const options = all.map((g) =>
    '<option value="' + escape(g.id) + '">' + escape(g.name) + "</option>").join("");
  $("litter-a").innerHTML = options;
  $("litter-b").innerHTML = options;
  if (all.length > 1) $("litter-b").selectedIndex = 1;
}

/**
 * Una scheda per cucciolo, e dentro il campo del nome.
 *
 * Il nome sta NELLA scheda e non in una riga sotto perché con sei cuccioli una
 * casella sola avrebbe chiesto «il nome del cucciolo scelto» quando non c'è
 * più niente da scegliere: si battezza chi si sta guardando.
 */
function drawLitterCubs() {
  const cubs = LITTER_STATE?.cubs ?? [];
  $("litter-cubs").innerHTML = cubs.map((cub) => {
    const coat = "chiazze " + cub.traits.spots.toFixed(2) +
      " · coda " + cub.traits.tail.toFixed(2) + " · tinta " + cub.traits.hue.toFixed(2);
    return '<div class="cub" data-cub="' + cub.index + '"' +
      ' data-viable="' + cub.viable + '">' +
      "<h4>Cucciolo " + (cub.index + 1) + "</h4>" +
      '<div class="persona">' + escape(cub.persona) + "</div>" +
      '<div class="coat">' + coat + "</div>" +
      (cub.viable
        ? '<input class="cub-name" data-name="' + cub.index + '" placeholder="un nome">'
        : '<div class="warn">non vitale: ' + escape((cub.reasons ?? []).join("; ")) + "</div>") +
      "</div>";
  }).join("");
}

/** Quanti nomi mancano: il bottone si accende solo quando ci sono tutti. */
function litterReady() {
  const cubs = LITTER_STATE?.cubs ?? [];
  const missing = cubs.filter((cub) =>
    cub.viable && ($("litter-cubs").querySelector('[data-name="' + cub.index + '"]')?.value ?? "").trim() === "");
  $("litter-adopt").disabled = cubs.length === 0 || missing.length > 0;
  return missing.length;
}

$("litter-cubs").addEventListener("input", () => { litterReady(); });

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
    LITTER_STATE = { seed: litter.seed, parentIds, cubs: litter.cubs,
      costUsd: litter.costUsd, generation: litter.generation };
    drawLitterCubs();
    litterReady();
    const quanti = litter.cubs.length;
    const conto = litter.costUsd > 0
      ? " Costa " + litter.costUsd.toFixed(2) + " dollari, divisi fra i genitori."
      : " Sono figli di capostipiti: non costano niente.";
    say("litter-msg", "Ne sono venuti " + quanti + ". Dai un nome a ognuno." + conto, "info");
  } catch (error) {
    LITTER_STATE = null; $("litter-cubs").innerHTML = ""; $("litter-adopt").disabled = true;
    say("litter-msg", error.message, "err");
  } finally { $("litter-go").disabled = false; }
});

$("litter-adopt").addEventListener("click", async () => {
  if (LITTER_STATE === null) return;
  if (litterReady() > 0) { say("litter-msg", "Manca un nome.", "info"); return; }
  // un nome per INDICE, nati morti compresi: il server allinea i nomi ai
  // cuccioli dell'anteprima, e un buco sposterebbe tutti i nomi di uno
  const names = LITTER_STATE.cubs.map((cub) =>
    ($("litter-cubs").querySelector('[data-name="' + cub.index + '"]')?.value ?? "").trim()
      || "Cucciolo " + (cub.index + 1));
  $("litter-adopt").disabled = true;
  try {
    const litter = await call("/v1/gosini/births", {
      method: "POST",
      body: JSON.stringify({
        parentIds: LITTER_STATE.parentIds,
        seed: LITTER_STATE.seed,
        names,
      }),
    });
    const nati = litter.born.map((c) => c.name).join(", ");
    const morti = litter.stillborn.length > 0
      ? " Non ce l'hanno fatta in " + litter.stillborn.length + "."
      : "";
    say("litter-msg", "Sono nati (generazione " + litter.generation + "): " + nati + "." + morti, "ok");
    const primo = litter.born[0];
    LITTER_STATE = null;
    $("litter-cubs").innerHTML = "";
    await drawLitterParents();
    await loadGosini();
    if (primo) { WHO = primo.id; location.hash = "#/g/" + primo.id + "/stato"; }
  } catch (error) {
    say("litter-msg", error.message, "err");
    $("litter-adopt").disabled = false;
  }
});

/**
 * ADR-081: chi non conia e chi non alleva non deve vedere le due porte.
 *
 * Un pannello che offre un pulsante che risponde sempre 403 insegna al
 * proprietario che il sistema è rotto; qui invece dice l'unica cosa vera —
 * **un gosino non si crea, si adotta fra quelli nati**.
 */
function myHouse() {
  if (ACCOUNTS.length === 1) return ACCOUNTS[0];
  return ACCOUNTS.find((c) => c.id === ACCOUNT);
}

function drawBirthDoors() {
  const house = myHouse();
  // casa sconosciuta: non si nasconde niente, e il server dirà la sua
  const conia = house === undefined || house.isFoundry === true;
  const alleva = house === undefined || house.canBreed === true || house.isFoundry === true;
  $("birth-mint").hidden = !conia;
  $("birth-litter").hidden = !alleva;
  $("birth-none").hidden = conia || alleva;
}
`;