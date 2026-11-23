/** Portability and erasure — the two rights, behind buttons. */
export const DATA_JS = `
// --- i dati ----------------------------------------------------------------
$("export").addEventListener("click", async () => {
  try {
    const bundle = await call("/v1/privacy/export", {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "ugo-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click(); URL.revokeObjectURL(url);
  } catch (error) { say("forget-msg", "Export fallito: " + error.message, "err"); }
});

// --- A casa tua (ADR-132) --------------------------------------------------
/** Spento (404) il blocco non esiste: un bottone che promette ciò che non c'è è peggio di niente. */
async function loadSoulExport() {
  const box = $("soul-box");
  let data;
  try { data = await call("/v1/privacy/soul-export/options"); }
  catch (error) {
    if (error.status === 404) { box.hidden = true; return; }
    throw error;
  }
  const select = $("soul-who");
  select.innerHTML = "";
  select.appendChild(new Option("— quale creatura? —", ""));
  for (const creature of data.creatures) select.appendChild(new Option(creature.name, creature.id));
  box.hidden = false;
}

$("soul-export").addEventListener("click", async () => {
  const gosinoId = $("soul-who").value;
  if (gosinoId === "") { say("soul-msg", "Scegli prima quale creatura.", "err"); return; }
  const confirmName = $("soul-confirm").value;
  if (confirmName.trim() === "") { say("soul-msg", "Scrivi il suo nome per confermare.", "err"); return; }
  $("soul-code-box").hidden = true;
  say("soul-msg", "Preparo l'archivio…", "info");
  try {
    const { blob, headers } = await call("/v1/privacy/soul-export", {
      method: "POST", raw: true,
      body: JSON.stringify({ gosinoId, mode: $("soul-mode").value, confirmName }),
    });
    const named = /filename="([^"]+)"/.exec(headers.get("content-disposition") ?? "");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = named ? named[1] : "anima.ugosoul";
    link.click(); URL.revokeObjectURL(url);
    $("soul-confirm").value = "";
    $("soul-code").textContent = headers.get("x-ugo-recovery-code") ?? "";
    $("soul-code-box").hidden = false;
    say("soul-msg", "Archivio scaricato. Scrivi il codice qui sotto prima di chiudere la pagina.", "ok");
  } catch (error) {
    say("soul-msg", error.status === 422 ? "Il nome non combacia." :
      error.status === 429 ? "Troppe richieste: " + error.message : "Non è andata: " + error.message, "err");
  }
});

$("forget").addEventListener("click", async () => {
  if ($("forget-confirm").value.trim() !== "DIMENTICA") {
    say("forget-msg", "Scrivi DIMENTICA per confermare. È irreversibile, e voglio esserne sicuro.", "err");
    return;
  }
  const beingId = $("forget-being").value;
  try {
    const report = await call("/v1/privacy/forget", {
      method: "POST", body: JSON.stringify({ beingId, confirm: true }),
    });
    $("forget-confirm").value = "";
    say("forget-msg", "Dimenticato. Messaggi ripuliti: " + report.messagesRedacted +
      ", ricordi riscritti: " + report.memoriesRedacted +
      ", impronte biometriche distrutte: " + report.biometricProfilesDestroyed + ".", "ok");
    await refresh();
  } catch (error) { say("forget-msg", "Non dimenticato: " + error.message, "err"); }
});
`;
