/**
 * La dote nel pannello (ADR-074), e la ricerca nell'album (ADR-109): due rotte
 * che esistevano senza una porta da cui entrare.
 */
export const DOWRY_JS = `
const dowryOptions = () => ({ includeStories: $("dowry-stories").checked });

$("dowry-preview").addEventListener("click", async () => {
  try {
    const p = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/dowry/preview", {
      method: "POST", body: JSON.stringify(dowryOptions()),
    });
    $("dowry-out").innerHTML = '<div class="tiles">' +
      tile("sapere", p.knowledge, "fatti e lezioni") +
      tile("racconti", p.stories, "solo se li includi") +
      tile("restano a casa", p.withheldForOthers, "nominano qualcun altro") + "</div>";
  } catch (error) { say("dowry-out", error.message, "err"); }
});

$("dowry-make").addEventListener("click", async () => {
  if (!confirm("La chiave si vede una volta sola. Pronto a copiarla?")) return;
  try {
    const made = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/dowry", {
      method: "POST", body: JSON.stringify(dowryOptions()),
    });
    // il file e la chiave viaggiano separati: chi trova uno dei due non ha niente
    const url = URL.createObjectURL(new Blob([made.sealed], { type: "text/plain" }));
    $("dowry-out").innerHTML =
      '<p class="lede"><a download="' + escape(made.content.gosinoName) + '.dote" href="' + url +
      '">Scarica il file della dote</a> e, <b>a parte</b>, questa chiave:</p>' +
      '<p><code data-testid="dowry-key-once">' + escape(made.key) + "</code></p>";
  } catch (error) { say("dowry-out", error.message, "err"); }
});

$("dowry-adopt").addEventListener("click", async () => {
  const file = $("dowry-file").files[0];
  const key = $("dowry-key").value.trim();
  const name = $("dowry-name").value.trim();
  if (file === undefined || key === "" || name === "") {
    say("dowry-adopt-msg", "Servono il file, la chiave e un nome.", "info"); return;
  }
  try {
    const sealed = (await file.text()).trim();
    const born = await call("/v1/dowries/adopt", {
      method: "POST", body: JSON.stringify({ sealed, key, name }),
    });
    say("dowry-adopt-msg", name + " è nato, e sa " + born.learned + " cose.", "ok");
    $("dowry-key").value = "";
    await loadGosini();
    drawRail(route().page);
  } catch (error) { say("dowry-adopt-msg", error.message, "err"); }
});

$("album-search").addEventListener("click", async () => {
  const params = new URLSearchParams();
  if ($("album-q").value.trim() !== "") params.set("parole", $("album-q").value.trim());
  if ($("album-from").value !== "") params.set("da", $("album-from").value + "T00:00:00.000Z");
  if ($("album-to").value !== "") params.set("a", $("album-to").value + "T23:59:59.999Z");
  try {
    const found = await call("/v1/album/cerca?" + params.toString(), {});
    $("album-found").innerHTML = found.photos.length === 0
      ? '<p class="empty">Nessuna foto così.</p>'
      : "<ul>" + found.photos.map((p) => "<li>" + escape(p.caption || "(senza didascalia)") +
          ' <span class="muted">' + new Date(p.takenAt).toLocaleString("it-IT") + "</span></li>").join("") + "</ul>";
  } catch (error) { say("album-found", error.message, "err"); }
});
`;
