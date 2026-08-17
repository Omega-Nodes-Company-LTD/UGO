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
const GOSINO_PAGES = ["stato", "volonta", "memoria", "salvadanaio", "pedigree", "vita"];
const PAGE_TITLE = { stato: "Come sta", volonta: "Cosa ha deciso lui", memoria: "Cosa ricorda",
  salvadanaio: "Il suo salvadanaio", pedigree: "Da chi discende", vita: "L'arco della vita" };
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

/**
 * Nei link la casa puo' arrivare come slug ('#/c/casa-mare/...') o come id:
 * lo slug e' per gli umani, ma '?casa=' esige un uuid — la validazione di
 * scope.ts scarta uno slug e ricade sulla casa risolta dal token, cioe' sui
 * dati di UN'ALTRA casa senza nessun errore. Qui si normalizza sempre a id.
 */
const houseOf = (raw) =>
  raw === "" ? "" : (CASE.find((c) => c.id === raw || c.slug === raw)?.id ?? raw);

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
    await section(showPlace, "place-msg");
    await section(loadCapabilities, "stats-msg");
  } else if (page === "case") {
    await section(loadHouses, "house-msg");
  } else if (page === "conti") {
    await section(loadStats, "stats-msg");
    // ADR-072: l'interruttore della fame vive coi conti, che è dove si guarda
    await section(loadMetabolism, "meta-msg");
  } else if (page === "riunioni") {
    await section(loadMeetings, "meet-msg");
  } else if (page === "stanze") {
    await section(loadRooms, "rooms-msg");
  } else if (page === "liste") {
    // ADR-076: la spesa e le cose da fare, riempite parlando
    await section(loadLists, "list-msg");
  } else if (page === "feed") {
    await section(loadFeeds, "feed-msg");
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
    // ADR-069: the litter needs to know who the possible parents are
    await section(drawLitterParents, "litter-msg");
  } else if (page === "stato") {
    // the 48-hour series lives on /v1/stats, so the plot needs it too
    await section(loadPsyche, "stats-msg");
    await section(loadStats, "stats-msg");
  } else if (page === "volonta") {
    await section(loadVolition, "volition-msg");
    await section(loadEfficacy, "efficacy-msg");
  } else if (page === "pedigree") {
    // ADR-070: da chi discende, e se le firme dei genitori reggono
    await section(loadPedigree, "pedigree-msg");
  } else if (page === "salvadanaio") {
    // ADR-072: quanto ha in pancia, e i pasti che gli sono stati dati
    await section(loadPiggyBank, "feed-msg");
  } else if (page === "vita") {
    // ADR-077: a che punto è dell'arco, e — se è nato prima — se lo accetta
    await section(loadLife, "life-msg");
  }
}

async function go() {
  const { page, who, house } = route();
  const target = house === undefined ? HOUSE : houseOf(house);
  if (target !== HOUSE) {
    HOUSE = target;
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
  // ADR-061: casa o azienda. Chi possiede entrambe deve vedere in quale
  // mondo sta scrivendo — il glifo e' la differenza fra i due tenant
  box.innerHTML = CASE.map((c) =>
    '<a href="#/c/' + encodeURIComponent(c.id) + '/casa" data-nav="c:' + c.id + '">' +
    '<span class="dot" aria-hidden="true"></span>' +
    (c.kind === "business" ? "\\u{1F3E2} " : "") + escape(c.name) +
    ' <span class="rail-where">' + escape(c.slug) +
    (c.kind === "business" ? " \\u00b7 azienda" : "") + "</span></a>").join("");
}

/** Loads the population; the eldest is who you land on when you name nobody. */
async function loadGosini() {
  try { GOSINI = (await call("/v1/gosini", {})).gosini ?? []; } catch { GOSINI = []; }
  if (WHO === "" && GOSINI.length > 0) WHO = GOSINI[0].id;
}

/**
 * L'età in una riga (ADR-071, riscritta da ADR-077).
 *
 * Diceva anche «quanto la vita può ancora riscriverlo», che era la plasticità
 * in italiano — e la plasticità era la vita attesa divisa per l'età, cioè la
 * data della morte con un passaggio d'algebra in mezzo. Adesso dice le tre
 * cose che si vedono guardando un animale: quanti giorni ha, se è cucciolo o
 * anziano, e com'è messo il pelo.
 */
function ageLine(age) {
  const years = age.days / 365;
  const quanti = age.days < 60
    ? age.days + (age.days === 1 ? " giorno" : " giorni")
    : years < 1 ? Math.round(age.days / 30) + " mesi" : years.toFixed(1) + " anni";
  const coat = age.coat === "grigio" ? " · grigio"
    : age.coat === "brizzolato" ? " · qualche setola grigia" : "";
  return escape(age.stage + " · " + quanti + coat);
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
      '</h4><div class="persona">' + escape(g.persona ?? "") + "</div>" +
      // ADR-071: quanti giorni ha, e quanto la vita può ancora cambiarlo
      (g.age === undefined ? "" : '<div class="persona">' + ageLine(g.age) + "</div>") +
      "</div>" +
      '<div class="mood">' + escape(mood) + "</div></a>");
  }
  $("gosini-cards").innerHTML = cards.length === 0
    ? '<p class="empty">Non è ancora nato nessuno. <a href="#/nascita">Fanne nascere uno.</a></p>'
    : cards.join("");
}
`;
