/**
 * The small forms: six sparklines that double as a selector, a ranked
 * horizontal bar, and the 0..1 meter.
 *
 * Small multiples rather than six lines on one plot: six series on one axis
 * needs six hues, and the moment identity rides on hue alone the chart stops
 * being readable for a colourblind reader. Six little plots side by side say
 * the same thing with one colour and no legend.
 */
export const SPARKS_JS = `
/** A tiny line with no axes: shape only, read next to its own number. */
function sparkline(points, width = 132, height = 34) {
  if (points.length < 2) return '<span class="spark-empty">—</span>';
  const xs = points.map((p) => p.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const span = x1 - x0 || 1;
  const sx = (x) => 1 + ((x - x0) / span) * (width - 2);
  const sy = (y) => height - 3 - Math.max(0, Math.min(1, y)) * (height - 6);
  const d = points.map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1)).join(" ");
  const last = points[points.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + width + " " + height + '" role="img" aria-hidden="true">' +
    '<path class="spark-area" d="' + d + " L" + sx(x1).toFixed(1) + "," + (height - 3) +
      " L" + sx(x0).toFixed(1) + "," + (height - 3) + ' Z"/>' +
    '<path class="spark-line" d="' + d + '"/>' +
    '<circle class="spark-end" cx="' + sx(last.x).toFixed(1) + '" cy="' + sy(last.y).toFixed(1) + '" r="2.5"/>' +
    "</svg>";
}

/**
 * Ranked horizontal bars. Horizontal because the labels are words — "una cosa
 * non detta" does not fit under a vertical bar without turning the reader's
 * head sideways.
 */
function hbar(host, rows) {
  host.innerHTML = "";
  if (rows.length === 0) {
    host.innerHTML = '<p class="empty">Ancora nessuna spinta registrata.</p>';
    return;
  }
  const top = Math.max(...rows.map((r) => r.value)) || 1;
  host.innerHTML = rows.map((row) =>
    '<div class="hbar"><span class="hbar-name">' + escape(row.label) + "</span>" +
    '<span class="hbar-track"><i style="width:' + ((row.value / top) * 100).toFixed(1) + '%"></i></span>' +
    '<span class="hbar-num">' + row.value + "</span></div>").join("");
}

/** A 0..1 magnitude with its resting point marked — the psyche variables. */
function meter(value, baseline) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const mark = baseline === undefined ? "" :
    '<i class="baseline" style="left:' + (Math.max(0, Math.min(1, baseline)) * 100) + '%"></i>';
  return '<span class="meter"><i style="width:' + pct.toFixed(1) + '%"></i>' + mark + "</span>";
}
`;
