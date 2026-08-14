/** Helpers and the way in: token handling, HTTP, and messages. */
export const CORE_JS = `
const $ = (id) => document.getElementById(id);

/**
 * Where the token lives (ADR-035).
 *
 * It used to be sessionStorage only — typed again on every new tab, which for
 * a panel you glance at from the sofa is a wall, not a protection. The owner
 * chooses at the door now: ticked, it survives on this device until "Esci";
 * unticked, it dies with the tab, which is what you want on a machine that is
 * not yours. localStorage is a real widening of the window — anything that can
 * run script on this origin can read it — and the honest mitigation is the
 * explicit way out, said in those words on the door.
 */
const KEY = "ugo_token";
const store = () => (localStorage.getItem(KEY) === null ? sessionStorage : localStorage);
const token = () => localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? "";
const keepToken = (value, persist) => {
  localStorage.removeItem(KEY); sessionStorage.removeItem(KEY);
  (persist ? localStorage : sessionStorage).setItem(KEY, value);
};
const dropToken = () => { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); };

// content-type only when there IS a body: Fastify rejects an empty body sent
// as application/json, which silently broke every DELETE from this panel
const headers = (hasBody, contentType) => ({
  ...(hasBody ? { "content-type": contentType ?? "application/json" } : {}),
  authorization: "Bearer " + token(),
});
const say = (where, text, kind) => { $(where).innerHTML = ""; const d = document.createElement("div");
  d.className = "msg " + (kind ?? "info"); d.textContent = text; d.dataset.testid = where + "-text";
  $(where).appendChild(d); };

const SPECIES_LABEL = { human: "persona", dog: "cane", parrot: "pappagallo", reptile: "rettile" };

async function call(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: headers(options?.body !== undefined, options?.contentType),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body is fine */ }
  if (!res.ok) {
    const detail = body?.detail ?? body?.title ?? ("HTTP " + res.status);
    const error = new Error(detail); error.status = res.status; throw error;
  }
  return body;
}

/**
 * Runs a section loader without letting it take the panel down with it.
 *
 * The panel is what the owner uses when something is already wrong, so one
 * broken section must cost exactly that section. Before this, every loader sat
 * on the critical path of logging in: a section that threw left a blank page
 * and a token prompt, which reads as "UGO is gone".
 */
async function section(load, where) {
  try { await load(); }
  catch (error) { if (where && $(where)) say(where, "Questa parte non si è caricata: " + error.message, "err"); }
}

// --- accesso ---------------------------------------------------------------
/** Everything the panel needs whoever you are and wherever you land. */
async function boot() {
  $("app").hidden = false;
  $("gate").hidden = true;
  await section(refresh, "pack-msg");
  // le case per prime: la popolazione dipende da quale casa si sta guardando
  await section(loadCase, "stats-msg");
  await section(loadGosini, "stats-msg");
  await go();
}

$("save-token").addEventListener("click", async () => {
  keepToken($("token").value.trim(), $("stay").checked);
  try {
    await call("/v1/stats", {});
    await boot();
  } catch (error) {
    dropToken();
    say("auth-msg", error.status === 401 ? "Token non valido." : "Non riesco a parlare con UGO: " + error.message, "err");
  }
});

$("logout").addEventListener("click", () => {
  dropToken();
  location.hash = "";
  location.reload();
});

// a token kept from last time gets you straight in — and if it has been
// revoked meanwhile, you land on the door instead of on a broken panel
window.addEventListener("DOMContentLoaded", async () => {
  if (token() === "") return;
  try { await call("/v1/stats", {}); await boot(); }
  catch { dropToken(); }
});
`;
