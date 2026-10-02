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

/**
 * ADR-019 fase 3: la casa viaggia con OGNI chiamata — qui, nel telaio, non
 * nella disciplina di ogni loader. La promessa era scritta sopra 'forWho' e
 * mantenuta da sette chiamate su cinquanta: con due case, mezzo pannello
 * rispondeva 400 e l'altro mezzo mostrava la casa sbagliata sotto il titolo
 * di quella giusta. Con una casa sola ACCOUNT resta vuota e non cambia nulla.
 * Le rotte di vicinato ('/v1/accounts') il parametro lo ignorano per
 * contratto, quindi portarlo sempre non costa niente a nessuno.
 */
const scoped = (path) => {
  if (ACCOUNT === "" || !path.startsWith("/v1/")) return path;
  if (/[?&]account=/.test(path)) return path;
  return path + (path.includes("?") ? "&" : "?") + "account=" + encodeURIComponent(ACCOUNT);
};

async function call(path, options) {
  const res = await fetch(scoped(path), {
    ...options,
    headers: headers(options?.body !== undefined, options?.contentType),
  });
  // ADR-123: l'anteprima della voce vuole i byte, non un JSON — sempre da qui,
  // così porta l'account e il token come ogni altra chiamata
  if (options?.blob === true) {
    if (!res.ok && res.status !== 204) {
      const error = new Error("HTTP " + res.status); error.status = res.status; throw error;
    }
    return res.status === 204 ? null : await res.blob();
  }
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
/**
 * ADR-127: il tema. Automatico (segue il sistema), chiaro o scuro: è una
 * comodità di chi guarda, quindi vive nel browser e basta. Il localStorage può
 * mancare o lanciare (navigazione privata, chiosco blindato): senza, resta
 * «automatico», che è comunque giusto.
 */
const THEMES = ["auto", "light", "dark"];
const THEME_LABEL = { auto: "Tema: automatico", light: "Tema: chiaro", dark: "Tema: scuro" };
let THEME = "auto";
try { THEME = localStorage.getItem("ugo-theme") ?? "auto"; } catch { /* resta automatico */ }
if (!THEMES.includes(THEME)) THEME = "auto";
function applyTheme(theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $("theme-label").textContent = THEME_LABEL[theme];
}
applyTheme(THEME);
$("theme").addEventListener("click", () => {
  THEME = THEMES[(THEMES.indexOf(THEME) + 1) % THEMES.length];
  try { localStorage.setItem("ugo-theme", THEME); } catch { /* pazienza */ }
  applyTheme(THEME);
});

/** ADR-127: chi sei, per mostrare solo le voci che ti riguardano. */
let ME = { role: "operator", account: null };
async function loadMe() {
  ME = await call("/v1/me", {});
  for (const group of document.querySelectorAll("[data-group]")) {
    const kind = group.dataset.group;
    group.hidden = !(ME.role === "operator" ||
      (kind === "business" && ME.account?.kind === "business"));
  }
}

async function boot() {
  $("app").hidden = false;
  $("gate").hidden = true;
  // la casa per PRIMA, davvero: ogni loader qui sotto passa da scoped(), e
  // farli partire prima di sapere quale casa si guarda caricherebbe il branco
  // di una casa e le stanze di un'altra
  const entry = route();
  if (entry.house !== undefined) ACCOUNT = entry.house;
  await section(loadAccounts, "stats-msg");
  ACCOUNT = accountIdOf(ACCOUNT);
  if (ACCOUNT === "" && ACCOUNTS.length >= 2) {
    // con due case «nessuna casa» non è uno stato: le chiamate senza ?account=
    // risponderebbero 400 su tutto. Si entra nella prima, e l'indirizzo lo
    // dice — replaceState, non location.hash: niente doppio giro di go()
    ACCOUNT = ACCOUNTS[0].id;
    const rest = entry.who === undefined ? "#/" + entry.page : "#/g/" + entry.who + "/" + entry.page;
    history.replaceState(null, "", at(rest));
  }
  await section(loadMe, "stats-msg");
  await section(refresh, "pack-msg");
  await section(loadGosini, "stats-msg");
  // ADR-122: se la conversazione non ha una testa, lo si dice su ogni pagina
  await section(loadAiNudge, "stats-msg");
  await go();
}

$("save-token").addEventListener("click", async () => {
  keepToken($("token").value.trim(), $("stay").checked);
  try {
    // la sonda del token è una rotta che non chiede una casa: '/v1/stats'
    // con due case risponde 400 «Which house?», che qui si leggeva come
    // «token non valido» — e con due case non si entrava più nel pannello
    await call("/v1/accounts", {});
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
  try { await call("/v1/accounts", {}); await boot(); }
  catch { dropToken(); }
});
`;
