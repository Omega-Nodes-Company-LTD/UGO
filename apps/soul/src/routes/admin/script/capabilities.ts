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
/**
 * La versione del muso servita da QUESTO soul, accanto a quella del pannello.
 *
 * Le due invecchiano insieme — le serve lo stesso processo — ma quella che si
 * vede sul chiosco no: il dispositivo può tenere in cache un bundle vecchio.
 * Averle una sopra l'altra rende il confronto immediato, e toglie di mezzo la
 * domanda che è costata mezza mattina: «sto guardando le cose nuove o no?».
 * Aperta e senza token, come la rotta.
 */
async function showFaceVersion() {
  try {
    const res = await fetch("/v1/version");
    const body = await res.json();
    const served = typeof body.version === "string" ? body.version : "?";
    $("face-version").innerHTML = "muso <code>" + escape(served) + "</code>";
  } catch (error) {
    $("face-version").innerHTML = "muso <code>non raggiungibile</code>";
  }
}
void showFaceVersion();

async function loadCapabilities() {
  const list = (await call("/v1/capabilities", {})).capabilities ?? [];
  $("capabilities").innerHTML = list.map((c) =>
    '<div class="deed"><div class="act">' + (c.on ? "✅ " : "⬜️ ") + escape(c.label) + "</div>" +
    (c.why ? '<div class="because">' + escape(c.why) + "</div>" : "") + "</div>").join("");
}
`;
