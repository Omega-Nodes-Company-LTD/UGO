/**
 * The memory graph (backlog gruppo 1). Drawn by hand in SVG, like `charts.ts`:
 * the panel has no build step and no libraries, and a domestic pack does not
 * need a physics engine.
 *
 * A radial layout by node type, not a force simulation: it is deterministic,
 * so the same memory sits in the same place twice, and a graph that reshuffles
 * itself on every reload is a graph nobody learns to read.
 *
 * Colour never carries meaning alone (same rule as the charts): shape and
 * label say it, colour only repeats it.
 */
export const GRAPH_JS = `
// --- grafo della memoria ---------------------------------------------------
const GRAPH_W = 720, GRAPH_H = 420;
// stato dell'ultimo giro: i nodi posizionati e gli archi, per l'esplorazione
let lastPlaced = [];
let lastEdges = [];

function graphLayout(nodes) {
  // beings in the middle ring, memories around them: the pack is what the
  // memories point at, so it belongs where the arrows converge
  const beings = nodes.filter((n) => n.type === "being");
  const memories = nodes.filter((n) => n.type === "memory");
  const place = (list, radius) => list.map((node, index) => {
    const angle = (index / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: GRAPH_W / 2 + Math.cos(angle) * radius, y: GRAPH_H / 2 + Math.sin(angle) * radius };
  });
  return [...place(beings, 90), ...place(memories, 175)];
}

function renderGraph(data) {
  const placed = graphLayout(data.nodes);
  lastPlaced = placed;
  lastEdges = data.edges;
  const at = new Map(placed.map((n) => [n.id, n]));
  const lines = data.edges.map((edge) => {
    const a = at.get(edge.from), b = at.get(edge.to);
    if (!a || !b) return "";
    const dashed = edge.type === "superseded_by" ? ' stroke-dasharray="4 3"' : "";
    const stroke = edge.type === "relation" ? "var(--brand)" : "currentColor";
    const opacity = edge.type === "about" ? "0.35" : "0.7";
    return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
      '" stroke="' + stroke + '" stroke-opacity="' + opacity + '" stroke-width="1.5"' + dashed + "></line>";
  }).join("");

  const dots = placed.map((node) => {
    const title = "<title>" + escape(node.label) + "</title>";
    const hit = ' data-id="' + escape(node.id) + '" data-label="' + escape(node.label) + '" data-type="' + node.type + '"';
    if (node.type === "being") {
      // a square for a person, a circle for a memory: the shape is the legend
      return '<g data-testid="graph-node" class="graph-hit"' + hit + ' style="cursor:pointer"><rect x="' + (node.x - 7) + '" y="' + (node.y - 7) +
        '" width="14" height="14" rx="3" fill="var(--brand)"></rect>' + title + "</g>";
    }
    const fill = node.retired ? "transparent" : "currentColor";
    return '<g data-testid="graph-node" class="graph-hit"' + hit + ' style="cursor:pointer"><circle cx="' + node.x + '" cy="' + node.y + '" r="5" fill="' + fill +
      '" stroke="currentColor" stroke-width="1.5" opacity="' + (node.retired ? "0.5" : "0.85") + '"></circle>' +
      title + "</g>";
  }).join("");

  const names = placed.filter((n) => n.type === "being").map((node) =>
    '<text x="' + node.x + '" y="' + (node.y - 12) + '" text-anchor="middle" font-size="11" fill="currentColor">' +
    escape(node.label) + "</text>").join("");

  $("graph-svg").innerHTML =
    '<svg viewBox="0 0 ' + GRAPH_W + " " + GRAPH_H + '" width="100%" role="img" aria-label="Grafo della memoria">' +
    lines + dots + names + "</svg>";
}

/** Cliccando un nodo si esplorano i SUOI vicini: il grafo smette di essere una
 *  cartolina e diventa una lente. Tanti click sullo stesso nodo non spostano
 *  nulla: la posizione resta una (il layout è deterministico, §6-quinquies). */
function describeNeighbours(event) {
  const hit = event.target.closest?.(".graph-hit") ?? null;
  if (!hit) return;
  const id = hit.getAttribute("data-id");
  const label = hit.getAttribute("data-label") || "nodo";
  const at = new Map(lastPlaced.map((n) => [n.id, n]));
  const neighbours = lastEdges
    .filter((edge) => edge.from === id || edge.to === id)
    .map((edge) => {
      const otherId = edge.from === id ? edge.to : edge.from;
      const other = at.get(otherId);
      return other ? other.label : "";
    })
    .filter((name) => name !== "");
  const list = neighbours.length ? " · " + neighbours.join(" · ") : " — nessun vicino";
  say("graph-msg", "«" + label + "»" + list, "ok");
}

async function loadGraph() {
  try {
    const data = await call("/v1/memories/graph", {});
    if (!data.nodes.length) {
      lastPlaced = [];
      lastEdges = [];
      $("graph-svg").innerHTML = "";
      say("graph-msg", "Ancora niente da disegnare: UGO non ha collegato nessun ricordo a nessuno.", "");
      return;
    }
    renderGraph(data);
    const retired = data.nodes.filter((n) => n.retired).length;
    say("graph-msg",
      data.nodes.length + " nodi, " + data.edges.length + " collegamenti" +
      (retired ? " — " + retired + " ricordi ritirati, vuoti" : "") +
      (data.truncated ? ". Mostrati solo i più recenti." : "."), "ok");
  } catch (error) { say("graph-msg", "Grafo non disponibile: " + error.message, "err"); }
}

$("graph-go").addEventListener("click", loadGraph);
// un solo ascoltatore per tutti i click sul grafo, delegato ai nodi
$("graph-svg").addEventListener("click", describeNeighbours);
`;
