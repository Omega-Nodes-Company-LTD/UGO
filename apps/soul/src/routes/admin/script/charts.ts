/**
 * Small SVG charts. No library: the panel has no build step, and a dependency
 * for four shapes would cost more than it saves.
 *
 * Every chart here is SINGLE-SERIES — a magnitude or a change over time — so
 * identity never rides on hue and the categorical-palette problem does not
 * arise. The one data colour is validated against the surface in both themes.
 *
 * Both charts carry a value axis. Without one a plot says "it went up" and
 * refuses to say from what to what, which is the difference between a picture
 * and an instrument.
 */
export const CHARTS_JS = `
const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
const text = (value, attrs) => { const t = el("text", attrs); t.textContent = value; return t; };

/** Room for the value labels on the left and the date labels underneath. */
const GUTTER = 44;
const FOOT = 20;

/** "Nice" round steps, so an axis reads 0,25 and never 0,2333. */
function ticks(top, count = 4) {
  const raw = top / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? power * 10;
  const out = [];
  for (let v = 0; v <= top + step * 0.001; v += step) out.push(v);
  return out;
}

/** Area+line over time, with a value axis and a crosshair that follows the pointer. */
function lineChart(host, points, options = {}) {
  const { width = 640, height = 190, format = (v) => v.toFixed(2), top: fixedTop } = options;
  host.innerHTML = "";
  if (points.length < 2) {
    host.innerHTML = '<p class="empty">Ancora troppo poco per disegnare una linea. Torna dopo che UGO ha vissuto un po\\'.</p>';
    return;
  }
  const svg = el("svg", { viewBox: "0 0 " + width + " " + height, class: "chart", role: "img" });
  const xs = points.map((p) => p.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const span = x1 - x0 || 1;
  const top = fixedTop ?? 1;
  const plotBottom = height - FOOT;
  const sx = (x) => GUTTER + ((x - x0) / span) * (width - GUTTER - 10);
  const sy = (y) => plotBottom - (y / top) * (plotBottom - 10);

  // recessive grid, each line labelled: a gridline nobody can read is decoration
  for (const level of ticks(top)) {
    const y = sy(level);
    svg.appendChild(el("line", { x1: GUTTER, x2: width - 10, y1: y, y2: y, class: "grid" }));
    svg.appendChild(text(format(level), { x: GUTTER - 8, y: y + 3.5, class: "tick", "text-anchor": "end" }));
  }

  const line = points.map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1)).join(" ");
  svg.appendChild(el("path", {
    d: line + " L" + sx(x1).toFixed(1) + "," + sy(0) + " L" + sx(x0).toFixed(1) + "," + sy(0) + " Z",
    class: "area",
  }));
  svg.appendChild(el("path", { d: line, class: "line" }));

  // the ends are the two dates a reader actually wants: from when, to when
  svg.appendChild(text(points[0].label, { x: GUTTER, y: height - 5, class: "tick" }));
  svg.appendChild(text(points[points.length - 1].label,
    { x: width - 10, y: height - 5, class: "tick", "text-anchor": "end" }));

  const last = points[points.length - 1];
  svg.appendChild(el("circle", { cx: sx(last.x), cy: sy(last.y), r: 4.5, class: "endpoint" }));

  const crosshair = el("line", { y1: 10, y2: plotBottom, class: "crosshair", opacity: 0 });
  const dot = el("circle", { r: 4.5, class: "cursor", opacity: 0 });
  svg.append(crosshair, dot);
  host.appendChild(svg);

  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  host.appendChild(tip);

  svg.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const target = x0 + ratio * span;
    const near = points.reduce((a, b) => (Math.abs(b.x - target) < Math.abs(a.x - target) ? b : a));
    crosshair.setAttribute("x1", sx(near.x)); crosshair.setAttribute("x2", sx(near.x));
    crosshair.setAttribute("opacity", 1);
    dot.setAttribute("cx", sx(near.x)); dot.setAttribute("cy", sy(near.y)); dot.setAttribute("opacity", 1);
    tip.hidden = false;
    tip.textContent = near.label + " · " + format(near.y);
    tip.style.left = Math.min(Math.max(0, (sx(near.x) / width) * box.width - 60), box.width - 130) + "px";
  });
  svg.addEventListener("pointerleave", () => {
    crosshair.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); tip.hidden = true;
  });
}

/**
 * Bars over time with the daily budget marked.
 *
 * The scale follows the DATA, not the budget. Scaling to the budget was the
 * bug that made this chart useless: spending three cents against a fifty-cent
 * limit drew every bar as a 7-pixel smear along the floor, so the one question
 * the chart exists to answer — is today unlike the other days — became
 * unanswerable. When the limit falls outside the scale it is stated in words
 * instead, which is the honest way to show something off the top.
 */
function barChart(host, bars, options = {}) {
  const { width = 640, height = 190, reference, format = (v) => "$" + v.toFixed(3) } = options;
  host.innerHTML = "";
  if (bars.length === 0) {
    host.innerHTML = '<p class="empty">Nessuna spesa registrata: UGO non ha ancora parlato con nessuno.</p>';
    return;
  }
  const peak = Math.max(...bars.map((b) => b.value));
  const inScale = reference !== undefined && reference <= peak * 1.6;
  const top = Math.max(peak, inScale ? reference : 0) * 1.15 || 1;
  const plotBottom = height - FOOT;
  const svg = el("svg", { viewBox: "0 0 " + width + " " + height, class: "chart", role: "img" });
  const slot = (width - GUTTER - 10) / bars.length;
  const sy = (v) => plotBottom - (v / top) * (plotBottom - 10);

  for (const level of ticks(top)) {
    const y = sy(level);
    svg.appendChild(el("line", { x1: GUTTER, x2: width - 10, y1: y, y2: y, class: "grid" }));
    svg.appendChild(text(format(level), { x: GUTTER - 8, y: y + 3.5, class: "tick", "text-anchor": "end" }));
  }
  if (inScale) {
    svg.appendChild(el("line", {
      x1: GUTTER, x2: width - 10, y1: sy(reference), y2: sy(reference), class: "reference",
    }));
    svg.appendChild(text("limite", { x: width - 10, y: sy(reference) - 5, class: "tick", "text-anchor": "end" }));
  }

  bars.forEach((bar, index) => {
    // 2px gap between bars, 3px rounded top anchored to the baseline
    const w = Math.max(2, slot - 2);
    const x = GUTTER + index * slot + 1;
    const y = sy(bar.value);
    const rect = el("rect", {
      x, y, width: w, height: Math.max(1, plotBottom - y), rx: 3,
      class: bar.over ? "bar over" : "bar",
    });
    const title = el("title");
    title.textContent = bar.label + " · " + format(bar.value);
    rect.appendChild(title);
    svg.appendChild(rect);
  });

  // only the ends are labelled: fourteen dates under fourteen bars is noise
  svg.appendChild(text(bars[0].label, { x: GUTTER, y: height - 5, class: "tick" }));
  if (bars.length > 1) {
    svg.appendChild(text(bars[bars.length - 1].label,
      { x: width - 10, y: height - 5, class: "tick", "text-anchor": "end" }));
  }
  host.appendChild(svg);

  if (reference !== undefined && !inScale) {
    // NOT class "empty": that means "there is nothing to draw", and this note
    // travels WITH a drawn chart. Reusing it told the e2e the plot was missing.
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Il limite giornaliero è " + format(reference) +
      ": molto sopra questa scala, quindi non è disegnato.";
    host.appendChild(note);
  }
}
`;
