// La finestra di UGO Dettatura: abbinamento, permessi, impostazioni, risposta.
// Tutta la logica sta in Rust; qui si mostra e si chiede.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
const SECTIONS = ["pair", "permissions", "settings", "reply"];

function showSection(name) {
  for (const section of SECTIONS) $(section).hidden = section !== name;
}

function say(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", isError);
}

async function refresh() {
  const status = await invoke("get_status");
  const { settings } = status;
  $("mode-hold").checked = settings.mode === "hold";
  $("mode-toggle").checked = settings.mode === "toggle";
  $("dictate-shortcut").value = settings.dictateShortcut;
  $("answer-shortcut").value = settings.answerShortcut;
  $("device-label").value = settings.deviceLabel;
  $("base-url").value = settings.baseUrl;
  $("unpair").hidden = !status.paired;
  return status;
}

$("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  say("pair-result", "abbino…");
  try {
    await invoke("pair_device", { code: $("pair-code").value });
    $("pair-code").value = "";
    say("pair-result", "Fatto: questo Mac è abbinato. Prova la scorciatoia in qualunque app.");
    const status = await refresh();
    if (!status.accessibility) showSection("permissions");
  } catch (error) {
    say("pair-result", String(error), true);
  }
});

$("ask-accessibility").addEventListener("click", async () => {
  const granted = await invoke("request_accessibility");
  say(
    "status",
    granted
      ? "permesso concesso: il testo si incolla da solo"
      : "concedi il permesso nelle Impostazioni, poi torna qui",
  );
});

$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = {
    baseUrl: $("base-url").value.trim(),
    mode: $("mode-toggle").checked ? "toggle" : "hold",
    dictateShortcut: $("dictate-shortcut").value.trim(),
    answerShortcut: $("answer-shortcut").value.trim(),
    deviceLabel: $("device-label").value.trim(),
  };
  try {
    await invoke("save_settings", { settings });
    say("settings-result", "Salvate.");
  } catch (error) {
    say("settings-result", String(error), true);
  }
});

$("unpair").addEventListener("click", async () => {
  await invoke("unpair_device");
  await refresh();
  showSection("pair");
});

listen("section", (event) => {
  showSection(event.payload);
  void refresh();
});
listen("status", (event) => say("status", event.payload));
listen("reply", (event) => {
  $("reply-question").textContent = `«${event.payload.question}»`;
  $("reply-text").textContent = event.payload.reply;
});

void refresh().then((status) => showSection(status.paired ? "settings" : "pair"));
