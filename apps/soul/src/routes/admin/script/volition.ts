/** The times he started something himself, and the switch that stops him. */
export const VOLITION_JS = `
// --- cosa ha deciso lui ----------------------------------------------------
// ADR-027 wrote down every initiative with its driver and its \`because\` in
// Italian, expressly so it could be explained afterwards. Nothing read it back
// until now: "perché me l'ha chiesto?" had no answer short of a psql session.
const ACT_LABEL = {
  initiative_taken: "ha cominciato lui", initiative_worked: "e ha funzionato",
  initiative_flat: "e non è servito", reminder_voiced: "ti ha ricordato una cosa",
  wants_out: "ha chiesto di uscire",
};
const DRIVER_LABEL = {
  boredom: "noia", loneliness: "solitudine", curiosity: "curiosità",
  unspoken: "una cosa non detta", worry: "preoccupazione", outing: "voglia di uscire",
};

const when = (iso) => new Date(iso).toLocaleString("it-IT",
  { weekday: "short", hour: "2-digit", minute: "2-digit" });

async function loadVolition() {
  let data;
  try { data = await call(forWho("/v1/volition"), {}); }
  catch (error) {
    // the switch only exists when initiative is wired: say so plainly
    say("volition-msg", error.status === 404
      ? "L'iniziativa non è configurata su questo server."
      : error.message, "info");
    return;
  }

  const state = data.initiative;
  $("init-toggle").textContent = state.enabled ? "Fermalo" : "Lascialo cominciare";
  $("init-state").textContent = state.enabled
    ? "Adesso può cominciare lui."
    : "Adesso risponde soltanto, non comincia mai."
    ;
  if (state.overridden) {
    $("init-state").textContent += " Deciso da qui, quindi torna a «"
      + (state.fromEnv ? "può" : "non può") + "» al prossimo riavvio.";
  }

  $("desire-list").innerHTML = data.desires.length === 0
    ? '<p class="lede">Niente in sospeso.</p>'
    : data.desires.map((d) => '<div class="deed"><span class="when">' +
        (d.dueAt ? "per " + when(d.dueAt) : escape(d.dueHint ?? "quando capita")) +
        '</span><div class="act">' + escape(d.text) + "</div></div>").join("");

  $("initiative-list").innerHTML = data.journal.length === 0
    ? '<p class="lede">Non ha ancora cominciato niente da solo.</p>'
    : data.journal.map((row) => {
        const p = row.payload ?? {};
        const driver = p.driver ? (DRIVER_LABEL[p.driver] ?? p.driver) : "";
        return '<div class="deed"><span class="when">' + when(row.ts) + "</span>" +
          '<div class="act">' + escape(ACT_LABEL[row.type] ?? row.type) +
          (p.act ? " · " + escape(p.act) : "") + "</div>" +
          (p.because ? '<div class="because">« ' + escape(p.because) + " »</div>" : "") +
          (driver ? '<div class="because">spinto da: ' + escape(driver) + "</div>" : "") +
          "</div>";
      }).join("");
}

$("init-toggle").addEventListener("click", async () => {
  try {
    const now = $("init-toggle").textContent === "Fermalo";
    await call("/v1/volition/enabled", {
      method: "POST", body: JSON.stringify({ enabled: !now }),
    });
    await loadVolition();
    say("volition-msg", now ? "Adesso sta zitto finché non gli parli." : "Adesso può cominciare lui.", "ok");
  } catch (error) { say("volition-msg", error.message, "err"); }
});
`;
