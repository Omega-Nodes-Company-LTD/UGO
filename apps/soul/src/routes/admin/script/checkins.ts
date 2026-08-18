/**
 * Le domande che tornano, nel pannello (ADR-085).
 *
 * Si mettono a voce, e qui si vedono e si tolgono. La ragione per cui questo
 * blocco esiste è la stessa per cui esiste il pannello: una cosa che si fa
 * viva da sola tutti i giorni, e che da nessuna parte si può guardare, è una
 * cosa che si scopre solo quando parla.
 */
export const CHECKINS_JS = `
const CHECKIN_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/** «ogni giorno alle 21:00», come lo direbbe una persona. */
function checkinWhen(row) {
  const day = row.weekday === null || row.weekday === undefined
    ? "ogni giorno"
    : "ogni " + (CHECKIN_DAYS[row.weekday] ?? "giorno");
  const minute = String(row.minute ?? 0).padStart(2, "0");
  return day + " alle " + String(row.hour) + ":" + minute;
}

async function loadCheckins() {
  const data = await call(forWho("/v1/checkins"), {});
  const rows = data.checkins ?? [];
  $("checkin-list").innerHTML = rows.length === 0
    ? '<p class="empty">Non ti chiede niente di preciso. Se vuoi, diglielo: «ogni sera alle nove chiedimi com\\'è andata».</p>'
    : rows.map((row) =>
        '<div class="deed"><span class="when">' + escape(checkinWhen(row)) + "</span>" +
        '<div class="act">«' + escape(row.question) + "»</div>" +
        '<button class="ghost" data-checkin="' + escape(row.id) + '">non chiedermelo più</button>' +
        "</div>").join("");
}

$("checkin-list").addEventListener("click", (event) => {
  const id = event.target?.dataset?.checkin;
  if (!id) return;
  void section(async () => {
    await call("/v1/checkins/" + encodeURIComponent(id), { method: "DELETE" });
    await loadCheckins();
    say("checkin-msg", "Non te lo chiede più.");
  }, "checkin-msg");
});
`;
