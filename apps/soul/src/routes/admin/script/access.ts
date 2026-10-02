/**
 * Accessi e dispositivi (ADR-121, ADR-124). Tutto passa da `call()`, quindi
 * dall'account scelto: le sessioni e i codici sono di QUELL'account.
 */
export const ACCESS_JS = `
const FACE_URL = location.origin + "/muso/";

function welcomeFaceUrl() {
  $("welcome-face-url").textContent = FACE_URL;
}

async function loadAccess() {
  $("access-face-url").textContent = FACE_URL;
  $("close-slug").textContent = ME.account?.slug ?? "—";
  let rows = [];
  try {
    rows = (await call("/v1/sessioni", {})).sessioni ?? [];
  } catch (error) {
    // con un token (operatore, CLI) le sessioni del browser non sono il punto
    $("access-sessions").innerHTML = '<p class="muted">' + escape(error.message) + "</p>";
    return;
  }
  $("access-sessions").innerHTML = rows.length === 0
    ? '<p class="muted">Nessun browser collegato: sei entrato con un token.</p>'
    : rows.map((s) => '<div class="row ai-key">' +
        '<div style="flex:1 1 14rem"><b>' + escape(s.label) + "</b>" +
        (s.current ? ' <span class="pill good">questo</span>' : "") +
        '<br><span class="muted">aperta ' + whenLabel(s.createdAt) + " · vista " + whenLabel(s.lastSeenAt) + "</span></div>" +
        (s.current ? "" : '<button class="ghost" data-session-drop="' + escape(s.id) + '">Chiudi</button>') +
        "</div>").join("");
}

$("access-sessions").addEventListener("click", async (event) => {
  const drop = event.target.closest("[data-session-drop]");
  if (!drop) return;
  try {
    await call("/v1/sessioni/" + drop.dataset.sessionDrop, { method: "DELETE" });
    say("access-msg", "Sessione chiusa.", "ok");
    await loadAccess();
  } catch (error) {
    say("access-msg", error.message, "err");
  }
});

$("pair-make").addEventListener("click", async () => {
  const name = $("pair-name").value.trim();
  if (name === "") { say("access-msg", "Scrivi dove starà il muso: «cucina», «camera»…", "err"); return; }
  try {
    const made = await call("/v1/dispositivi/codice", { method: "POST", body: JSON.stringify({ nome: name }) });
    $("pair-code").textContent = made.codice;
    say("access-msg", "Scrivi queste sei cifre sul muso entro dieci minuti.", "ok");
  } catch (error) {
    say("access-msg", error.message, "err");
  }
});

$("close-account").addEventListener("click", async () => {
  const typed = $("close-confirm").value.trim();
  if (typed === "") { say("access-msg", "Scrivi il nome della casa per confermare.", "err"); return; }
  try {
    await call("/v1/account/chiudi", { method: "POST", body: JSON.stringify({ conferma: typed }) });
    dropToken();
    location.href = "/";
  } catch (error) {
    say("access-msg", error.message, "err");
  }
});
`;
