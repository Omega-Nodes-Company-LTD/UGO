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
    $("new-name").value = ""; $("new-where").value = "";
    await loadGosini();
    WHO = born.id;
    location.hash = "#/g/" + born.id + "/stato";
  } catch (error) {
    say("new-msg", error.message, "err");
  } finally { $("new-go").disabled = false; }
});
`;
