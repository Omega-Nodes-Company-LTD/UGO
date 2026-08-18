/**
 * Il libro dei ricordi nel pannello (ADR-086).
 *
 * Accanto alla ricerca, che risponde a «cosa ripescherebbe se gli chiedessi
 * questo», e che serve solo a chi sa già cosa cercare. Questa è la costa del
 * libro: i mesi, con quanto c'è dentro, e il mese aperto per intero.
 */
export const BOOK_JS = `
const BOOK_MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** «marzo 2026» invece di «2026-03»: è un libro, non un log. */
function bookLabel(period) {
  const parts = String(period).split("-");
  if (parts.length === 1) return parts[0];
  const name = BOOK_MONTHS[Number(parts[1]) - 1];
  return name ? name + " " + parts[0] : period;
}

async function loadBook() {
  const data = await call(forWho("/v1/memories/book"), {});
  const months = data.months ?? [];
  $("book-spine").innerHTML = months.length === 0
    ? '<p class="empty">Non c\\'è ancora niente da sfogliare: i ricordi li scrive il sogno, una notte per volta.</p>'
    : months.map((m) =>
        '<button class="ghost" data-period="' + escape(m.month) + '">' +
        escape(bookLabel(m.month)) + " <b>" + String(m.count) + "</b></button>").join(" ");
  $("book-page").innerHTML = "";
}

async function openBookPage(period) {
  const data = await call(forWho("/v1/memories/book?periodo=" + encodeURIComponent(period)), {});
  const rows = data.memories ?? [];
  $("book-page").innerHTML =
    '<h3>' + escape(bookLabel(period)) + "</h3>" +
    (rows.length === 0
      ? '<p class="empty">Niente, in quel mese.</p>'
      : rows.map((row) =>
          '<div class="deed"><span class="when">' +
          escape(String(row.createdAt).slice(0, 10)) + " · " +
          escape(KIND_LABEL[row.kind] ?? row.kind) + "</span>" +
          '<div class="act">' + escape(row.text) +
          (row.invalid ? ' <b>(non è più vero)</b>' : "") + "</div></div>").join(""));
}

$("book-spine").addEventListener("click", (event) => {
  const period = event.target?.dataset?.period ?? event.target?.parentElement?.dataset?.period;
  if (!period) return;
  void section(() => openBookPage(period), "book-msg");
});
`;
