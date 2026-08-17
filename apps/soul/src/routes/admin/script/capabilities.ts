/**
 * Cosa è acceso e cosa no, col perché accanto.
 *
 * Nasce da tre giri a vuoto di fila: una foto che «la camera non riesce a
 * vedere» perché manca il modello vision, un cielo sereno durante un temporale
 * perché la casa non aveva coordinate, un «cerca:» che non esisteva perché
 * mancava SearXNG. Ogni volta il prodotto ha risposto qualcosa di educato e la
 * diagnosi è finita in una lettura del codice.
 */
export const CAPABILITIES_JS = `
async function loadCapabilities() {
  const list = (await call("/v1/capabilities", {})).capabilities ?? [];
  $("capabilities").innerHTML = list.map((c) =>
    '<div class="deed"><div class="act">' + (c.on ? "✅ " : "⬜️ ") + escape(c.label) + "</div>" +
    (c.why ? '<div class="because">' + escape(c.why) + "</div>" : "") + "</div>").join("");
}
`;
