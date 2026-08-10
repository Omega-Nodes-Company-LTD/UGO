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
