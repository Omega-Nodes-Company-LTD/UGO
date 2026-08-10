/**
 * Small SVG chart helpers. No library: the panel has no build step, and a
 * dependency for three chart shapes would cost more than it saves.
 *
 * Every chart here is SINGLE-SERIES — a magnitude or a change over time — so
 * identity never rides on hue and the categorical-palette problem does not
 * arise. The one data colour is validated against the surface in both themes.
 */
export const CHARTS_JS = `
const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

/** Area+line over time, with a crosshair that follows the pointer. */
function lineChart(host, points, options = {}) {
  const { width = 640, height = 160, pad = 18, format = (v) => v.toFixed(2) } = options;
  host.innerHTML = "";
  if (points.length < 2) {
    host.innerHTML = '<p class="empty">Ancora troppo poco per disegnare una linea. Torna dopo che UGO ha vissuto un po\\'.</p>';
    return;
  }
  const svg = el("svg", { viewBox: \`0 0 \${width} \${height}\`, class: "chart", role: "img" });
  const xs = points.map((p) => p.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const span = x1 - x0 || 1;
  const sx = (x) => pad + ((x - x0) / span) * (width - pad * 2);
  const sy = (y) => height - pad - y * (height - pad * 2);

  // recessive grid: quarters, so the eye has a reference without counting
  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    svg.appendChild(el("line", { x1: pad, x2: width - pad, y1: sy(level), y2: sy(level), class: "grid" }));
  }
  const line = points.map((p, i) => \`\${i ? "L" : "M"}\${sx(p.x).toFixed(1)},\${sy(p.y).toFixed(1)}\`).join(" ");
  svg.appendChild(el("path", {
    d: \`\${line} L\${sx(x1).toFixed(1)},\${sy(0)} L\${sx(x0).toFixed(1)},\${sy(0)} Z\`, class: "area",
  }));
  svg.appendChild(el("path", { d: line, class: "line" }));

  const last = points[points.length - 1];
  svg.appendChild(el("circle", { cx: sx(last.x), cy: sy(last.y), r: 4.5, class: "endpoint" }));

  const crosshair = el("line", { y1: pad, y2: height - pad, class: "crosshair", opacity: 0 });
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

/** Bars over time with a dashed reference line (the daily budget). */
function barChart(host, bars, options = {}) {
  const { width = 640, height = 150, pad = 18, reference, format = (v) => v.toFixed(3) } = options;
  host.innerHTML = "";
  if (bars.length === 0) {
    host.innerHTML = '<p class="empty">Nessuna spesa registrata: UGO non ha ancora parlato con nessuno.</p>';
    return;
  }
  const top = Math.max(reference ?? 0, ...bars.map((b) => b.value)) * 1.15 || 1;
  const svg = el("svg", { viewBox: \`0 0 \${width} \${height}\`, class: "chart", role: "img" });
  const slot = (width - pad * 2) / bars.length;
  const sy = (v) => height - pad - (v / top) * (height - pad * 2);

  if (reference !== undefined) {
    svg.appendChild(el("line", { x1: pad, x2: width - pad, y1: sy(reference), y2: sy(reference), class: "reference" }));
  }
  bars.forEach((bar, index) => {
    // 2px gap between bars, 4px rounded top anchored to the baseline
    const w = Math.max(2, slot - 4);
    const x = pad + index * slot + 2;
    const y = sy(bar.value);
    const rect = el("rect", {
      x, y, width: w, height: Math.max(1, height - pad - y), rx: 3,
      class: bar.over ? "bar over" : "bar",
    });
    const title = el("title");
    title.textContent = bar.label + " · " + format(bar.value);
    rect.appendChild(title);
    svg.appendChild(rect);
  });
  host.appendChild(svg);
}

/** A 0..1 magnitude with its resting point marked — the psyche variables. */
function meter(value, baseline) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const mark = baseline === undefined ? "" :
    '<i class="baseline" style="left:' + (Math.max(0, Math.min(1, baseline)) * 100) + '%"></i>';
  return '<span class="meter"><i style="width:' + pct.toFixed(1) + '%"></i>' + mark + "</span>";
}
`;
