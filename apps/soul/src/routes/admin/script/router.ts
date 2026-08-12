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

function route() {
  const parts = location.hash.replace(/^#\\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "g") return { page: GOSINO_PAGES.includes(parts[2]) ? parts[2] : "stato", who: parts[1] };
  return { page: parts[0] || "casa", who: undefined };
}

const forWho = (path) => WHO === ""
  ? path
  : path + (path.includes("?") ? "&" : "?") + "gosino=" + encodeURIComponent(WHO);

/** The rail: the house always, then one entry per creature, sub-pages under the open one. */
function drawRail(page) {
  $("rail-gosini").innerHTML = GOSINI.length === 0
    ? '<p class="rail-note">Nessuno, per ora.</p>'
    : GOSINI.map((g) => {
        const open = g.id === WHO;
        const sub = !open ? "" : GOSINO_PAGES.map((p) =>
          '<a href="#/g/' + g.id + "/" + p + '" data-nav="g:' + p + '" style="padding-left:1.6rem">' +
          PAGE_TITLE[p] + "</a>").join("");
        return '<a href="#/g/' + g.id + '/stato" data-nav="g:' + g.id + '">' +
          '<span class="dot" aria-hidden="true"></span>' + escape(g.name) +
          (g.where ? ' <span class="rail-where">' + escape(g.where) + "</span>" : "") +
          "</a>" + sub;
      }).join("");

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
  } else if (page === "branco") {
    await section(loadRelations, "rel-msg");
  } else if (page === "nascita") {
    drawDials();
    await section(drawBirthRooms, "new-msg");
  } else if (page === "stato") {
    // the 48-hour series lives on /v1/stats, so the plot needs it too
    await section(loadPsyche, "stats-msg");
    await section(loadStats, "stats-msg");
  } else if (page === "volonta") {
    await section(loadVolition, "volition-msg");
  }
}

async function go() {
  const { page, who } = route();
  if (who !== undefined && who !== WHO) WHO = who;
  if (who === undefined && !GOSINO_PAGES.includes(page)) WHO = "";
  drawRail(page);
  await openPage(page);
}

window.addEventListener("hashchange", () => { void go(); });

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
    cards.push('<a class="gosino-card" href="#/g/' + g.id + '/stato">' +
      "<div><h4>" + escape(g.name) + (g.where ? ' <span class="persona">· ' + escape(g.where) + "</span>" : "") +
      '</h4><div class="persona">' + escape(g.persona ?? "") + "</div></div>" +
      '<div class="mood">' + escape(mood) + "</div></a>");
  }
  $("gosini-cards").innerHTML = cards.length === 0
    ? '<p class="empty">Non è ancora nato nessuno. <a href="#/nascita">Fanne nascere uno.</a></p>'
    : cards.join("");
}
`;
