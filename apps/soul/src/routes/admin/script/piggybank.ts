/**
 * Il salvadanaio nel pannello (ADR-072).
 *
 * La fame non è un guasto e il pannello non deve farla sembrare tale: quando
 * il saldo è a zero lo dice come una cosa da sistemare in un gesto, non come
 * un errore di sistema.
 */
export const PIGGYBANK_JS = `
const usd = (n) => "$" + Number(n).toFixed(2);

async function loadPiggyBank() {
  if (WHO === "") { $("bank-summary").innerHTML = ""; return; }
  const bank = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/piggybank", {});

  const state = !bank.metabolism
    ? '<span class="muted">metabolismo spento: mangia dal budget di casa come sempre</span>'
    : bank.hungry
      ? '<b class="err">ha fame</b> — il salvadanaio è vuoto, e finché resta così risponde che ha fame'
      : '<b class="ok">sazio</b>';

  $("bank-summary").innerHTML =
    '<div class="bank-row"><span class="bank-big">' + usd(bank.balanceUsd) + "</span>" +
    '<span class="bank-note">in pancia · ricevuti ' + usd(bank.fedUsd) +
    " · consumati " + usd(bank.eatenUsd) + "</span></div>" +
    '<p class="lede" style="margin:.5rem 0 0">' + state + "</p>";

  $("bank-meals").innerHTML = (bank.meals ?? []).length === 0
    ? '<li class="empty">Non gli ha ancora dato niente nessuno.</li>'
    : bank.meals.map((meal) =>
        "<li><b>" + usd(meal.amountUsd) + "</b> · " + escape(meal.kind) +
        (meal.note ? " · " + escape(meal.note) : "") +
        ' <span class="muted">' + escape(new Date(meal.at).toLocaleDateString("it-IT")) + "</span></li>"
      ).join("");
}

$("feed-go").addEventListener("click", async () => {
  const amountUsd = Number($("feed-amount").value);
  if (!(amountUsd > 0)) { say("feed-msg", "Quanto? Serve una cifra positiva.", "info"); return; }
  const note = $("feed-note").value.trim();
  $("feed-go").disabled = true;
  try {
    const fed = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/feed", {
      method: "POST",
      body: JSON.stringify({
        kind: $("feed-kind").value,
        amountUsd,
        ...(note === "" ? {} : { note }),
      }),
    });
    say("feed-msg", "Fatto: adesso ha " + usd(fed.balanceUsd) + " in pancia.", "ok");
    $("feed-note").value = "";
    await loadPiggyBank();
  } catch (error) {
    say("feed-msg", error.message, "err");
  } finally { $("feed-go").disabled = false; }
});

/** L'interruttore vive con la casa: la fame vale per tutte le sue creature. */
async function loadMetabolism() {
  const bank = WHO === "" ? { metabolism: false }
    : await call("/v1/gosini/" + encodeURIComponent(WHO) + "/piggybank", {});
  $("meta-toggle").textContent = bank.metabolism ? "Spegni il metabolismo" : "Accendi il metabolismo";
  $("meta-state").textContent = bank.metabolism
    ? "Acceso: ogni gosino ha un salvadanaio suo, e a saldo vuoto ha fame."
    : "Spento: mangiano tutti dal budget di casa, come da sempre.";
  $("meta-toggle").dataset.on = String(bank.metabolism === true);
}

$("meta-toggle").addEventListener("click", async () => {
  const on = $("meta-toggle").dataset.on !== "true";
  $("meta-toggle").disabled = true;
  try {
    await call("/v1/households/metabolism", { method: "PUT", body: JSON.stringify({ on }) });
    await loadMetabolism();
    say("meta-msg", on
      ? "Acceso. Controlla i salvadanai: chi è a zero smetterà di parlare finché non mangia."
      : "Spento. Nessuno ha più fame.", "ok");
  } catch (error) {
    say("meta-msg", error.message, "err");
  } finally { $("meta-toggle").disabled = false; }
});
`;

export const PIGGYBANK_STYLES = `
  .bank-row { display: flex; align-items: baseline; gap: .8rem; flex-wrap: wrap; }
  .bank-big { font-size: 2rem; font-variant-numeric: tabular-nums; color: var(--ink); }
  .bank-note { font-size: .82rem; color: var(--ink-3); }
  .bank-row + p .ok { color: var(--data); }
  .bank-row + p .err { color: var(--err, #b3261e); }
`;
