/** Voice enrollment and corrections (ADR-016). */
export const VOICE_JS = `
// --- enrollment vocale -----------------------------------------------------
const RECORD_MS = 10_000;

$("rec").addEventListener("click", async () => {
  const beingId = $("enroll-being").value;
  if (!beingId) { say("enroll-msg", "Aggiungi prima qualcuno al branco.", "err"); return; }
  const button = $("rec");
  button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) chunks.push(event.data); });
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve));
    recorder.start();
    button.innerHTML = '<span class="rec">● sto ascoltando…</span>';
    say("enroll-msg", "Parla normalmente per dieci secondi.", "info");
    setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, RECORD_MS);
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    await upload(beingId, new Blob(chunks, { type: "audio/webm" }));
  } catch (error) {
    if (error.status === 403) {
      say("enroll-msg", "Rifiutato, ed è giusto così: per questa persona hai chiesto di non " +
        "costruire un'impronta della voce (minorenne o opt-out audio).", "info");
    } else {
      say("enroll-msg", "Non ha funzionato: " + error.message, "err");
    }
  } finally {
    button.disabled = false; button.textContent = "● Registra 10 s";
  }
});

async function upload(beingId, blob) {
  if (blob.size === 0) throw new Error("non è arrivato audio dal microfono");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const filename = "enroll_" + beingId.slice(0, 8) + "_" + stamp + ".webm";
  const presigned = await call("/v1/audio/presign", { method: "POST", body: JSON.stringify({ filename }) });
  const put = await fetch(presigned.url, { method: "PUT", body: blob });
  if (!put.ok) throw new Error("caricamento fallito (" + put.status + ")");
  await call("/v1/beings/" + beingId + "/enroll/voice", {
    method: "POST", body: JSON.stringify({ objectKey: presigned.key }),
  });
  say("enroll-msg", "Me lo segno. L'impronta nasce stanotte, nel sogno — o subito se premi " +
    '"Fallo sognare adesso".', "ok");
}

// --- correzioni ------------------------------------------------------------
$("add-corr").addEventListener("click", async () => {
  try {
    await call("/v1/corrections", {
      method: "POST",
      body: JSON.stringify({ aboutBeing: $("corr-being").value, signal: $("corr-signal").value }),
    });
    say("corr-msg", "Preso. Se lo ricorderà nelle prossime conversazioni.", "ok");
  } catch (error) { say("corr-msg", "Non registrata: " + error.message, "err"); }
});
`;
