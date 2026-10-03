/**
 * Impostazioni → AI (ADR-122). Tutto passa da `call()`, quindi dall'account
 * scelto (scoped): le chiavi e i modelli sono di QUELL'account.
 */
export const AI_SETTINGS_JS = `
const AI_PROVIDER = { anthropic: "Anthropic", openrouter: "OpenRouter", openai: "OpenAI",
  elevenlabs: "ElevenLabs" };
const AI_ROLE = {
  chat: ["La conversazione", "quello che dice quando gli parli"],
  think: ["Il pensiero", "sogno, ruminazione, consiglio, storie"],
  vision: ["Gli occhi", "le foto che gli mostri e le occhiate"],
  judge: ["Il giudice", "decide se sa davvero una cosa"],
  tts: ["La voce", "come suona quando parla (ADR-123)"],
  stt: ["Le orecchie", "trascrive quello che gli dici"],
};
const AI_TEXT_PROVIDERS = ["anthropic", "openrouter"];
const AI_VOICE_PROVIDERS = ["openai", "elevenlabs", "openrouter"];
const providersFor = (role) => role === "tts" || role === "stt" ? AI_VOICE_PROVIDERS : AI_TEXT_PROVIDERS;
const KEY_STATE = { ok: ["good", "funziona"], unverified: ["warning", "da provare"],
  invalid: ["critical", "rifiutata"] };
let AI_STATUS = null;

// il credito è in micro-euro (ADR-130); euro() di adoptions parla in centesimi
const creditEuro = (micros) =>
  (Number(micros) / 1e6).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

async function loadAiNudge() {
  const status = await call("/v1/ai/stato", {});
  const chat = status.ruoli.find((r) => r.role === "chat");
  $("ai-nudge").hidden = chat?.configured === true;
}

async function loadAiSettings() {
  AI_STATUS = await call("/v1/ai/stato", {});
  const s = AI_STATUS;
  $("ai-today").innerHTML =
    tile("speso oggi", "$" + s.oggi.spesoUsd.toFixed(2), "su un tetto di $" + s.oggi.tettoUsd.toFixed(2)) +
    tile("credito UGO", creditEuro(s.creditoMicros), "per le chiavi UGO a consumo");
  drawAiKeys(s);
  drawAiRoles(s);
  $("ai-nudge").hidden = s.ruoli.find((r) => r.role === "chat")?.configured === true;
}

function drawAiKeys(s) {
  const mine = Object.fromEntries(s.chiavi.map((k) => [k.provider, k]));
  $("ai-keys").innerHTML = Object.keys(AI_PROVIDER).map((p) => {
    const k = mine[p];
    const state = k === undefined ? "" : '<span class="pill ' + KEY_STATE[k.status][0] + '">' +
      KEY_STATE[k.status][1] + "</span> <code>" + escape(k.hint) + "</code>";
    return '<div class="row ai-key">' +
      '<div style="flex:0 1 9rem"><b>' + AI_PROVIDER[p] + "</b><br>" + state + "</div>" +
      '<input type="password" autocomplete="off" placeholder="incolla la chiave" ' +
        'data-testid="ai-key-input-' + p + '" data-key-input="' + p + '" style="flex:1 1 14rem">' +
      '<button data-key-save="' + p + '" data-testid="ai-key-save-' + p + '">Salva</button>' +
      (k === undefined ? "" : '<button class="ghost" data-key-drop="' + p + '">Togli</button>') +
      "</div>";
  }).join("");
}

function sourceOptions(s, role, chosen) {
  const ugo = providersFor(role).some((p) => s.chiaviUgo[p]);
  return '<option value="byok"' + (chosen === "byok" ? " selected" : "") + ">la mia chiave</option>" +
    (ugo ? '<option value="ugo"' + (chosen === "ugo" ? " selected" : "") + ">chiavi UGO a consumo</option>" : "");
}

function drawAiRoles(s) {
  $("ai-roles").innerHTML = Object.keys(AI_ROLE).map((role) => {
    const r = s.ruoli.find((x) => x.role === role) ?? {};
    const now = r.model === null || r.model === undefined
      ? '<span class="pill critical">nessun modello</span>'
      : '<span class="pill ' + (r.configured ? "good" : "warning") + '">' + escape(r.model) + "</span>" +
        (r.missingKey ? ' <span class="muted">manca la chiave</span>' : "");
    return '<div class="block ai-role" data-role="' + role + '">' +
      "<h3>" + AI_ROLE[role][0] + ' <span class="muted">— ' + AI_ROLE[role][1] + "</span></h3>" +
      '<p>Adesso: ' + now + "</p>" +
      '<div class="row">' +
      '<select data-role-source="' + role + '">' + sourceOptions(s, role, r.source ?? "byok") + "</select>" +
      '<select data-role-provider="' + role + '">' + providersFor(role).map((p) =>
        '<option value="' + p + '"' + (r.provider === p ? " selected" : "") + ">" + AI_PROVIDER[p] + "</option>").join("") +
      "</select>" +
      '<button class="ghost" data-role-list="' + role + '">Mostra i modelli</button>' +
      "</div>" +
      '<div class="row"><select data-role-model="' + role + '" data-testid="ai-model-' + role + '" hidden></select>' +
      (role === "tts" ? '<select data-role-voice="tts" data-testid="ai-voice" hidden></select>' : "") +
      '<button data-role-save="' + role + '" data-testid="ai-role-save-' + role + '" hidden>Usa questo</button>' +
      (role === "tts" && r.configured ? '<button class="ghost" data-voice-preview data-testid="ai-voice-preview">Ascolta</button>' : "") +
      (r.model ? '<button class="ghost" data-role-drop="' + role + '">Togli</button>' : "") +
      "</div>" +
      "</div>";
  }).join("");
}

const price = (m) => m.inputPerMTok === undefined ? "" :
  " — $" + m.inputPerMTok.toFixed(2) + " / $" + (m.outputPerMTok ?? 0).toFixed(2) + " per milione";

async function listModels(role) {
  const source = document.querySelector('[data-role-source="' + role + '"]').value;
  const provider = document.querySelector('[data-role-provider="' + role + '"]').value;
  const found = await call("/v1/ai/modelli?provider=" + provider + "&ruolo=" + role + "&fonte=" + source, {});
  const select = document.querySelector('[data-role-model="' + role + '"]');
  select.innerHTML = found.modelli.map((m) =>
    '<option value="' + escape(m.id) + '">' + escape(m.label) + price(m) + "</option>").join("");
  select.hidden = false;
  document.querySelector('[data-role-save="' + role + '"]').hidden = false;
  if (role === "tts") {
    const voices = await call("/v1/ai/voci?provider=" + provider + "&fonte=" + source, {});
    const pick = document.querySelector('[data-role-voice="tts"]');
    pick.innerHTML = voices.voci.map((v) =>
      '<option value="' + escape(v.id) + '">' + escape(v.label) + "</option>").join("");
    pick.hidden = false;
  }
}

/** L'anteprima: una frase vera, dalla stessa rotta del muso, pagata come le altre. */
async function previewVoice() {
  const audio = await call("/v1/tts", {
    method: "POST",
    blob: true,
    body: JSON.stringify({ text: "Grunf! Ciao, sono io. Ti piace questa voce?", mood: "contento" }),
  });
  if (audio === null) { say("ai-msg", "Nessuna voce: controlla la chiave o il tetto di oggi.", "err"); return; }
  const player = new Audio(URL.createObjectURL(audio));
  await player.play();
}

$("ai-keys").addEventListener("click", async (event) => {
  const save = event.target.closest("[data-key-save]");
  const drop = event.target.closest("[data-key-drop]");
  try {
    if (save) {
      const p = save.dataset.keySave;
      const input = document.querySelector('[data-key-input="' + p + '"]');
      await call("/v1/ai/chiavi/" + p, { method: "PUT", body: JSON.stringify({ secret: input.value.trim() }) });
      input.value = "";
      say("ai-msg", "Chiave " + AI_PROVIDER[p] + " salvata.", "ok");
    } else if (drop) {
      await call("/v1/ai/chiavi/" + drop.dataset.keyDrop, { method: "DELETE" });
      say("ai-msg", "Chiave tolta.", "ok");
    } else return;
    await loadAiSettings();
  } catch (error) {
    say("ai-msg", error.message, "err");
  }
});

$("ai-roles").addEventListener("click", async (event) => {
  const list = event.target.closest("[data-role-list]");
  const save = event.target.closest("[data-role-save]");
  const preview = event.target.closest("[data-voice-preview]");
  const drop = event.target.closest("[data-role-drop]");
  try {
    if (drop) {
      await call("/v1/ai/scelte/" + drop.dataset.roleDrop, { method: "DELETE" });
      say("ai-msg", AI_ROLE[drop.dataset.roleDrop][0] + ": tolto.", "ok");
      await loadAiSettings();
    } else if (preview) {
      await previewVoice();
    } else if (list) {
      await listModels(list.dataset.roleList);
    } else if (save) {
      const role = save.dataset.roleSave;
      const body = {
        source: document.querySelector('[data-role-source="' + role + '"]').value,
        provider: document.querySelector('[data-role-provider="' + role + '"]').value,
        model: document.querySelector('[data-role-model="' + role + '"]').value,
        ...(role === "tts" && { voice: document.querySelector('[data-role-voice="tts"]').value }),
      };
      await call("/v1/ai/scelte/" + role, { method: "PUT", body: JSON.stringify(body) });
      say("ai-msg", AI_ROLE[role][0] + ": " + body.model + ".", "ok");
      await loadAiSettings();
    }
  } catch (error) {
    say("ai-msg", error.message, "err");
  }
});
`;
