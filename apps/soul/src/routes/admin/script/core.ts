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
// ADR-124: senza token la richiesta porta il cookie della sessione, da sé
const headers = (hasBody, contentType) => ({
  ...(hasBody ? { "content-type": contentType ?? "application/json" } : {}),
  ...(token() === "" ? {} : { authorization: "Bearer " + token() }),
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

/**
 * Gli errori parlano sempre. Il server ormai risponde con un \`detail\` in
 * italiano; questo copre quello che al server non arriva: la rete che cade,
 * un proxy che risponde con una sua pagina HTML, un corpo vuoto.
 */
const STATUS_SAY = {
  400: "La richiesta non è completa o non è scritta bene: controlla i campi e riprova.",
  401: "Non sei entrato, o l'accesso è scaduto: rientra.",
  402: "Il tuo piano non comprende questa funzione: la trovi in Abbonamento.",
  403: "Non hai il permesso di farlo: serve il proprietario della casa.",
  404: "Non l'ho trovato: forse è stato cancellato o il link è vecchio. Ricarica la pagina.",
  409: "Non si può fare adesso, nello stato in cui è: ricarica la pagina e riprova.",
  413: "È troppo grande per essere inviato.",
  422: "I valori non vanno bene: controllali e riprova.",
  429: "Troppe richieste in poco tempo: aspetta qualche minuto e riprova.",
  500: "Qualcosa si è rotto dalla nostra parte. Riprova fra poco.",
  502: "UGO non risponde bene in questo momento: riprova fra poco.",
  503: "UGO non è disponibile in questo momento: riprova fra poco.",
  504: "UGO ci ha messo troppo a rispondere: riprova fra poco.",
};
const OFFLINE = "Non riesco a raggiungere UGO: controlla la connessione, o che il server sia acceso, e riprova.";

function speakingError(status, body) {
  const said = body?.detail ?? body?.error ?? body?.title;
  if (typeof said === "string" && said !== "" && !/^HTTP \\d+$/.test(said)) return said;
  return STATUS_SAY[status] ?? (status >= 500 ? STATUS_SAY[500] : STATUS_SAY[400]);
}

/**
 * Il pulsante che hai appena premuto, se è lui ad aver chiesto qualcosa al
 * server: lavora e lo dice (aria-busy), e intanto non si preme due volte.
 * Si guarda il click in cattura, prima di qualunque gestore di pagina.
 */
let PRESSED = null;
document.addEventListener("click", (event) => {
  PRESSED = event.target.closest?.("button") ?? null;
}, true);

async function call(path, options) {
  const acting = options?.method !== undefined && options.method !== "GET" ? PRESSED : null;
  PRESSED = null;
  if (acting) { acting.setAttribute("aria-busy", "true"); acting.disabled = true; }
  try { return await send(path, options); }
  finally { if (acting) { acting.removeAttribute("aria-busy"); acting.disabled = false; } }
}

async function send(path, options) {
  let res;
  try {
    res = await fetch(scoped(path), {
      ...options,
      headers: headers(options?.body !== undefined, options?.contentType),
    });
  } catch {
    const error = new Error(OFFLINE); error.status = 0; throw error;
  }
  // ADR-123: l'anteprima della voce vuole i byte, non un JSON — sempre da qui,
  // così porta l'account e il token come ogni altra chiamata
  if (options?.blob === true) {
    if (!res.ok && res.status !== 204) {
      const error = new Error(speakingError(res.status, null)); error.status = res.status; throw error;
    }
    return res.status === 204 ? null : await res.blob();
  }
  let body = null;
  try { body = await res.json(); } catch { /* empty body is fine */ }
  if (!res.ok) {
    const error = new Error(speakingError(res.status, body)); error.status = res.status; throw error;
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
let LOADING = 0;
async function section(load, where) {
  LOADING += 1;
  $("main")?.setAttribute("aria-busy", "true");
  try { await load(); }
  catch (error) { if (where && $(where)) say(where, "Questa parte non si è caricata: " + error.message, "err"); }
  finally {
    LOADING -= 1;
    if (LOADING === 0) $("main")?.removeAttribute("aria-busy");
  }
}

/**
 * Le larghezze calcolate (barre, metri) arrivano come data-w / data-x e si
 * applicano qui: uno stile scritto nel markup è quello che la CSP non deve
 * dover ammettere, mentre il CSSOM da script sì.
 */
function sized(root) {
  for (const node of root.querySelectorAll?.("[data-w],[data-x]") ?? []) {
    if (node.dataset.w !== undefined) node.style.width = Math.max(0, Math.min(100, Number(node.dataset.w))) + "%";
    if (node.dataset.x !== undefined) node.style.left = Math.max(0, Math.min(100, Number(node.dataset.x))) + "%";
  }
}
if (typeof MutationObserver !== "undefined" && $("main")) {
  new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes) if (node.nodeType === 1) { sized(node); if (node.matches?.("[data-w],[data-x]")) sized(node.parentElement); }
  }).observe($("main"), { childList: true, subtree: true });
}

/** Sul telefono il menu è un cassetto: si apre, si chiude, e non ruba il fuoco. */
function menu(open) {
  $("app").classList.toggle("menu-open", open);
  $("menu-open").setAttribute("aria-expanded", String(open));
  $("scrim").hidden = !open;
  if (open) $("rail").querySelector("a, button")?.focus();
}
$("menu-open").addEventListener("click", () => menu(!$("app").classList.contains("menu-open")));
$("scrim").addEventListener("click", () => menu(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("app").classList.contains("menu-open")) { menu(false); $("menu-open").focus(); }
});
window.addEventListener("hashchange", () => menu(false));

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
  // regola 14, ADR-081: una famiglia adotta — far nascere è di chi alleva
  const breeds = ME.role === "operator" || ME.account?.canBreed === true || ME.account?.isFoundry === true;
  for (const node of document.querySelectorAll('[data-needs="breeding"]')) node.hidden = !breeds;
  // ADR-125: quel che il piano non apre resta in vista, col suo cartellino
  for (const node of document.querySelectorAll("[data-plan]")) {
    node.classList.toggle("locked", ME.piano?.capacita?.[node.dataset.plan] === false);
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

$("logout").addEventListener("click", async () => {
  // ADR-124: la sessione si chiude anche sul server, non solo nel browser
  if (token() === "") { try { await call("/v1/auth/esci", { method: "POST" }); } catch { /* era già chiusa */ } }
  dropToken();
  location.hash = "";
  location.reload();
});

// a token kept from last time — or the session cookie of who came in by email
// (ADR-124) — gets you straight in; if it has been revoked meanwhile, you land
// on the door instead of on a broken panel
window.addEventListener("DOMContentLoaded", async () => {
  try { await call("/v1/accounts", {}); await boot(); }
  catch { dropToken(); }
});
`;
