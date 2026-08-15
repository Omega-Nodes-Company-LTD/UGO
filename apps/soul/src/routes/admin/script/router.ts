/**
 * Navigation, and the two levels the panel is built on (ADR-035).
 *
 * The address bar is the state: `#/branco` is the house, `#/g/<id>/stato` is
 * one creature. That is what makes a page reloadable and a link sendable —
 * with a flat scroll and a dropdown, "guarda com'è messo Nino" was not
 * something you could send to anybody, including yourself tomorrow.
 *
 * There is ONE copy of the per-creature markup, repainted for whoever the
 * address names. Four gosini would otherwise be four identical DOMs kept in
 * sync by hand.
 */
export const ROUTER_JS = `
const GOSINO_PAGES = ["stato", "volonta", "memoria"];
const PAGE_TITLE = { stato: "Come sta", volonta: "Cosa ha deciso lui", memoria: "Cosa ricorda" };
let GOSINI = [];
let WHO = "";
/** Le case che questo token può vedere. Quasi sempre una, e allora non si vede. */
let CASE = [];
let HOUSE = "";

function route() {
  let parts = location.hash.replace(/^#\\/?/, "").split("/").filter(Boolean);
  // '#/c/<casa>/...' avvolge tutto il resto: si toglie il prefisso e si legge
  // quel che segue con le stesse regole di prima, cosi' ogni indirizzo che
  // funzionava continua a funzionare senza la casa davanti
  let house = undefined;
  if (parts[0] === "c" && parts[1]) { house = parts[1]; parts = parts.slice(2); }
  if (parts[0] === "g") return { page: GOSINO_PAGES.includes(parts[2]) ? parts[2] : "stato", who: parts[1], house };
  return { page: parts[0] || "casa", who: undefined, house };
}

/** Il prefisso da mettere davanti a ogni link, quando la casa e' scelta. */
const at = (hash) => HOUSE === "" ? hash : "#/c/" + encodeURIComponent(HOUSE) + hash.slice(1);

const withParam = (path, key, value) => value === ""
  ? path
  : path + (path.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(value);

/**
 * ADR-019 fase 3: la casa viaggia con OGNI chiamata, esattamente come
 * l'esemplare. È lo stesso meccanismo, e apposta: un selettore che cambia il
 * titolo e non lo scope mostrerebbe i dati della casa sbagliata sotto il nome
 * di quella giusta, che è il peggiore dei due modi di sbagliare.
 */
const forWho = (path) => withParam(withParam(path, "gosino", WHO), "casa", HOUSE);

/** The rail: the house always, then one entry per creature, sub-pages under the open one. */
function drawRail(page) {
  $("rail-gosini").innerHTML = GOSINI.length === 0
    ? '<p class="rail-note">Nessuno, per ora.</p>'
    : GOSINI.map((g) => {
        const open = g.id === WHO;
        const sub = !open ? "" : GOSINO_PAGES.map((p) =>
          '<a href="' + at("#/g/" + g.id + "/" + p) + '" data-nav="g:' + p + '" style="padding-left:1.6rem">' +
          PAGE_TITLE[p] + "</a>").join("");
        return '<a href="' + at("#/g/" + g.id + "/stato") + '" data-nav="g:' + g.id + '">' +
          '<span class="dot" aria-hidden="true"></span>' + escape(g.name) +
          (g.where ? ' <span class="rail-where">' + escape(g.where) + "</span>" : "") +
          "</a>" + sub;
      }).join("");

  // i link fissi della barra portano la casa scelta come quelli generati: uno
  // solo che la perdesse riporterebbe in silenzio alla casa di default
  for (const link of document.querySelectorAll(".rail a[data-nav]")) {
    const nav = link.dataset.nav;
    if (nav.startsWith("g:") || nav.startsWith("c:")) continue;
    link.setAttribute("href", at("#/" + nav));
  }
  for (const link of document.querySelectorAll(".rail a")) link.removeAttribute("aria-current");
  const current = WHO === ""
    ? document.querySelector('.rail a[data-nav="' + page + '"]')
    : document.querySelector('.rail a[data-nav="g:' + page + '"]')
      ?? document.querySelector('.rail a[data-nav="g:' + WHO + '"]');
  current?.setAttribute("aria-current", "page");
}

/** Every page loads only what it shows, and each loader carries its own guard. */
async function openPage(page) {
  for (const node of document.querySelectorAll(".page")) node.classList.toggle("on", node.dataset.page === page);
  const who = GOSINI.find((g) => g.id === WHO);
  for (const node of document.querySelectorAll("[data-who]")) {
    node.textContent = who === undefined ? "Il gosino" : who.name + (who.where ? " · " + who.where : "");
  }
  document.title = "UGO — " + (PAGE_TITLE[page] ?? page);
  window.scrollTo(0, 0);

  if (page === "casa") {
    await section(loadStats, "stats-msg");
    await section(loadHealth, "stats-msg");
    await section(drawGosiniCards, "stats-msg");
  } else if (page === "conti") {
    await section(loadStats, "stats-msg");
  } else if (page === "riunioni") {
    await section(loadMeetings, "meet-msg");
  } else if (page === "stanze") {
    await section(loadRooms, "rooms-msg");
  } else if (page === "clienti") {
    await section(loadCustomers, "cust-msg");
  } else if (page === "arredi") {
    await section(loadProps, "prop-msg");
  } else if (page === "branco") {
    await section(loadRelations, "rel-msg");
  } else if (page === "volti") {
    await section(loadPrints, "prints-msg");
  } else if (page === "nascita") {
    drawDials();
    await section(drawBirthRooms, "new-msg");
  } else if (page === "stato") {
    // the 48-hour series lives on /v1/stats, so the plot needs it too
    await section(loadPsyche, "stats-msg");
    await section(loadStats, "stats-msg");
  } else if (page === "volonta") {
    await section(loadVolition, "volition-msg");
    await section(loadEfficacy, "efficacy-msg");
  }
}

async function go() {
  const { page, who, house } = route();
  if (house !== undefined && house !== HOUSE) {
    HOUSE = house;
    // cambiare casa vuol dire cambiare popolazione: tenere il gosino di prima
    // significherebbe chiedere alla casa nuova di una creatura che non ha
    WHO = "";
    await loadGosini();
  }
  if (who !== undefined && who !== WHO) WHO = who;
  if (who === undefined && !GOSINO_PAGES.includes(page)) WHO = "";
  drawRail(page);
  await openPage(page);
}

window.addEventListener("hashchange", () => { void go(); });

/**
 * Le case, e il selettore che compare solo quando ce n'è più d'una.
 *
 * Il proprietario di una casa sola non vede alcun cambiamento — è la promessa
 * di ADR-019 §107, e si spegne da sé il giorno in cui arriva la seconda
 * famiglia invece che richiedere una decisione oggi.
 */
async function loadCase() {
  try { CASE = (await call("/v1/households", {})).households ?? []; } catch { CASE = []; }
  // Con UNA casa 'HOUSE' resta vuota, e non e' una svista: vuota significa
  // indirizzi senza prefisso e chiamate senza '?casa=', cioe' esattamente il
  // pannello di prima. Il server la risolve da se' ('soleHousehold'), e i link
  // gia' salvati continuano a funzionare. Riempirla «tanto la casa e' quella»
  // riscriverebbe ogni indirizzo per un vicinato che non esiste — ed e'
  // precisamente cio' che ADR-019 §107 promette di non fare.
  const box = $("rail-case");
  if (!box) return;
  box.parentElement.hidden = CASE.length < 2;
  if (CASE.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = CASE.map((c) =>
    '<a href="#/c/' + encodeURIComponent(c.id) + '/casa" data-nav="c:' + c.id + '">' +
    '<span class="dot" aria-hidden="true"></span>' + escape(c.name) +
    ' <span class="rail-where">' + escape(c.slug) + "</span></a>").join("");
}

/** Loads the population; the eldest is who you land on when you name nobody. */
async function loadGosini() {
  try { GOSINI = (await call("/v1/gosini", {})).gosini ?? []; } catch { GOSINI = []; }
  if (WHO === "" && GOSINI.length > 0) WHO = GOSINI[0].id;
}

/** The house's front page: each creature with the mood he is actually in. */
async function drawGosiniCards() {
  const cards = [];
  for (const g of GOSINI) {
    let mood = "—";
    try { mood = (await call("/v1/psyche?gosino=" + encodeURIComponent(g.id), {})).label; }
    catch { /* one that cannot be read still gets a row, with a dash */ }
    cards.push('<a class="gosino-card" href="' + at("#/g/" + g.id + "/stato") + '">' +
      "<div><h4>" + escape(g.name) + (g.where ? ' <span class="persona">· ' + escape(g.where) + "</span>" : "") +
      '</h4><div class="persona">' + escape(g.persona ?? "") + "</div></div>" +
      '<div class="mood">' + escape(mood) + "</div></a>");
  }
  $("gosini-cards").innerHTML = cards.length === 0
    ? '<p class="empty">Non è ancora nato nessuno. <a href="#/nascita">Fanne nascere uno.</a></p>'
    : cards.join("");
}
`;
