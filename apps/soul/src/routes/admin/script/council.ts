/** Asking all of them at once, and watching them disagree. */
export const COUNCIL_JS = `
// --- il consiglio ----------------------------------------------------------
// ADR-031: two rounds, the first blind. The transcript has to show that, or it
// reads like a chat log and the interesting part — who moved, and after
// hearing what — is invisible.
$("council-go").addEventListener("click", async () => {
  const question = $("council-q").value.trim();
  if (question.length < 2) { say("council-msg", "Scrivi una domanda.", "info"); return; }
  $("council-go").disabled = true;
  say("council-msg", "Sto chiedendo a tutti… il modello locale ci mette un po'.", "info");
  try {
    const result = await call("/v1/council", {
      method: "POST", body: JSON.stringify({ question }),
    });
    $("council-out").innerHTML = result.voices.map((v) =>
      // the mood belongs in the header: two of them answering differently is
      // the whole point, and half the reason is what kind of day each is having
      '<div class="voice"><h4>' + escape(v.name) +
      ' <span class="lede" style="margin:0">· ' +
      escape([v.where, v.mood].filter(Boolean).join(" · ")) + "</span></h4>" +
      '<p class="said">' + escape(v.first) + "</p>" +
      (v.second === undefined ? ""
        : '<p class="again"><span class="lede" style="margin:0">dopo aver sentito gli altri</span><br>' +
          escape(v.second) + "</p>") +
      "</div>").join("");
    say("council-msg", result.changedMind
      ? "Qualcuno ha cambiato idea dopo aver sentito gli altri."
      : "Nessuno ha cambiato idea.", "ok");
  } catch (error) {
    say("council-msg", error.status === 503
      ? "Non ha risposto nessuno: il modello locale è giù?"
      : error.message, "err");
  } finally { $("council-go").disabled = false; }
});
`;
