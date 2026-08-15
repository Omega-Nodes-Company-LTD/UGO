/**
 * Gli arredi: la piantina, e le scorte (ADR-056).
 *
 * **Una piantina e non due cursori.** «Dove sta il cuscino» è una domanda
 * spaziale: rispondere con due numeri costringerebbe il proprietario a fare la
 * conversione in testa e poi ad andare a guardare il chiosco per verificare —
 * cioè a usare la creatura come strumento di misura. Trascinare un'icona su un
 * rettangolo con le proporzioni del recinto vero risponde da solo.
 *
 * Le coordinate sono normalizzate in [-1,1] esattamente come sul filo: la
 * larghezza vera della stanza la decide il muso a partire dal fotogramma, e un
 * pannello che parlasse in unità di scena piazzerebbe le cose fuori dal mondo
 * su un telefono.
 *
 * NB: questo file è un template literal. Un backtick dentro un commento qui
 * chiude la stringa e `tsc` segnala l'errore venti righe più in là.
 */
export const PROPS_JS = `
const PROP_ICON = { cushion: "\\u{1F6CF}", grass: "\\u{1F33F}", bush: "\\u{1F333}",
                    ball: "\\u{1F534}", trough: "\\u{1F963}" };
const PROP_NAME = { cushion: "cuscino", grass: "erba", bush: "cespuglio",
                    ball: "palla", trough: "truogolo" };
const PROP_ORDER = ["cushion", "grass", "bush", "ball", "trough"];
let PROPS = [];
let PROP_PICKED = "";

const propRoom = () => $("prop-room").value;

async function loadPropRooms() {
  const known = (await call("/v1/rooms", {})).rooms ?? [];
  const chosen = propRoom();
  $("prop-room").innerHTML = known.length === 0
    ? '<option value="">— nessuna stanza —</option>'
    : known.map((r) => '<option value="' + escape(r.room) + '">' + escape(r.room) + "</option>").join("");
  // la stanza scelta sopravvive a un ricarico dell'elenco: cambiarla sotto le
  // mani mentre si trascina un cuscino manderebbe la modifica in un'altra stanza
  if (chosen !== "" && known.some((r) => r.room === chosen)) $("prop-room").value = chosen;
  $("prop-kind").innerHTML = PROP_ORDER.map((k) =>
    '<option value="' + k + '">' + PROP_NAME[k] + "</option>").join("");
}

function drawProps() {
  const map = $("prop-map");
  for (const node of map.querySelectorAll(".prop")) node.remove();
  for (const prop of PROPS) {
    const node = document.createElement("div");
    node.className = "prop" + (prop.id === PROP_PICKED ? " on" : "");
    node.dataset.id = prop.id;
    node.dataset.testid = "prop-" + prop.kind;
    node.title = PROP_NAME[prop.kind];
    node.textContent = PROP_ICON[prop.kind] ?? "?";
    // da [-1,1] a percentuali: il rettangolo ha le proporzioni del recinto
    node.style.left = ((prop.x + 1) / 2) * 100 + "%";
    node.style.top = ((prop.z + 1) / 2) * 100 + "%";
    node.style.rotate = String(prop.rot) + "rad";
    map.append(node);
  }
  $("prop-del").disabled = PROP_PICKED === "";
  $("prop-turn").disabled = PROP_PICKED === "";
}

async function loadProps() {
  await loadPropRooms();
  const room = propRoom();
  if (room === "") {
    PROPS = [];
    drawProps();
    say("prop-msg", "Prima fai una stanza: gli arredi stanno in una stanza, non nel vuoto.", "info");
    return;
  }
  PROPS = (await call(withParam("/v1/props", "stanza", room), {})).props ?? [];
  drawProps();
  await loadStock();
}

async function loadStock() {
  const stock = (await call("/v1/props/stock", {})).stock ?? [];
  $("prop-stock").innerHTML = stock.map((s) =>
    '<div class="stock-row"><span>' + (PROP_ICON[s.kind] ?? "") + " " + PROP_NAME[s.kind] + "</span>" +
    '<input type="number" min="0" max="999" data-kind="' + s.kind + '" data-testid="stock-' + s.kind + '"' +
    ' placeholder="illimitato" value="' + (s.remaining === null ? "" : s.remaining) + '">' +
    '<input type="number" min="0" max="99" data-refill="' + s.kind + '" title="quanti ne tornano ogni settimana"' +
    ' placeholder="0/sett" value="' + (s.refillPerWeek || "") + '">' +
    "</div>").join("");
}

$("prop-room").addEventListener("change", () => { PROP_PICKED = ""; void section(loadProps, "prop-msg"); });

$("prop-add").addEventListener("click", async () => {
  const room = propRoom();
  if (room === "") { say("prop-msg", "Serve una stanza.", "info"); return; }
  $("prop-add").disabled = true;
  try {
    // entra al centro-basso e poi lo si trascina: nascere esattamente sotto il
    // maiale lo renderebbe invisibile proprio nel momento in cui lo cerchi
    const made = await call(withParam("/v1/props", "stanza", room), {
      method: "POST",
      body: JSON.stringify({ kind: $("prop-kind").value, x: 0.35, z: 0.45, rot: 0 }),
    });
    PROPS.push(made);
    PROP_PICKED = made.id;
    drawProps();
    say("prop-msg", "Dentro. Trascinalo dove vuoi.", "ok");
    await loadStock();
  } catch (error) {
    say("prop-msg", error.message, "err");
  } finally { $("prop-add").disabled = false; }
});

$("prop-del").addEventListener("click", async () => {
  if (PROP_PICKED === "") return;
  try {
    await call(withParam("/v1/props/" + PROP_PICKED, "stanza", propRoom()), { method: "DELETE" });
    PROPS = PROPS.filter((p) => p.id !== PROP_PICKED);
    PROP_PICKED = "";
    drawProps();
    say("prop-msg", "Tolto. La scorta è tornata indietro.", "ok");
    await loadStock();
  } catch (error) { say("prop-msg", error.message, "err"); }
});

$("prop-turn").addEventListener("click", async () => {
  const prop = PROPS.find((p) => p.id === PROP_PICKED);
  if (prop === undefined) return;
  // un ottavo di giro per clic: continuo sarebbe un cursore in piu' per una
  // cosa che nessuno regola al grado
  prop.rot = Math.round((prop.rot + Math.PI / 4) * 1000) / 1000;
  if (prop.rot > 3.14) prop.rot -= Math.PI * 2;
  drawProps();
  await saveProp(prop);
});

async function saveProp(prop) {
  try {
    await call(withParam("/v1/props/" + prop.id, "stanza", propRoom()), {
      method: "PATCH",
      body: JSON.stringify({ x: prop.x, z: prop.z, rot: prop.rot }),
    });
  } catch (error) { say("prop-msg", error.message, "err"); }
}

/**
 * Il trascinamento. Su puntatore e non su mouse: il pannello si usa anche dal
 * telefono, ed e' esattamente il posto da cui si sposta un cuscino mentre si
 * guarda il chiosco dall'altra parte della stanza.
 */
(() => {
  const map = $("prop-map");
  let dragging = null;

  const place = (event) => {
    const box = map.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
    const z = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
    return { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
  };

  map.addEventListener("pointerdown", (event) => {
    const node = event.target.closest(".prop");
    if (node === null) return;
    PROP_PICKED = node.dataset.id;
    dragging = PROPS.find((p) => p.id === PROP_PICKED) ?? null;
    map.setPointerCapture(event.pointerId);
    drawProps();
  });

  map.addEventListener("pointermove", (event) => {
    if (dragging === null) return;
    const at = place(event);
    dragging.x = at.x;
    dragging.z = at.z;
    drawProps();
  });

  const drop = async () => {
    const moved = dragging;
    dragging = null;
    // si salva al RILASCIO e non a ogni movimento: una PATCH per fotogramma
    // sarebbe una tempesta di scritture e di spinte sul socket, e il chiosco
    // vedrebbe il cuscino tremare invece di seguire il dito
    if (moved !== null) await saveProp(moved);
  };
  map.addEventListener("pointerup", () => { void drop(); });
  map.addEventListener("pointercancel", () => { void drop(); });
})();

$("prop-stock").addEventListener("change", async (event) => {
  const input = event.target;
  const kind = input.dataset.kind ?? input.dataset.refill;
  if (kind === undefined) return;
  const row = input.closest(".stock-row");
  const amount = row.querySelector("[data-kind]").value.trim();
  const refill = row.querySelector("[data-refill]").value.trim();
  try {
    await call("/v1/props/stock", {
      method: "PUT",
      body: JSON.stringify({
        kind,
        remaining: amount === "" ? null : Number(amount),
        refillPerWeek: refill === "" ? 0 : Number(refill),
      }),
    });
    say("stock-msg", amount === ""
      ? PROP_NAME[kind] + ": nessun limite."
      : PROP_NAME[kind] + ": ne restano " + amount + ".", "ok");
    await loadStock();
  } catch (error) { say("stock-msg", error.message, "err"); }
});
`;
