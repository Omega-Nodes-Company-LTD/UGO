/**
 * Il libro della vita nel pannello (ADR-079).
 *
 * Il diario esisteva da sempre e non l'aveva mai letto nessuno: finiva nel
 * prompt, in una frase nel sonno e in un dump JSON. Qui è un libro — le notti
 * in ordine, ognuna con l'umore medio di quel giorno accanto alle sue parole.
 */
export const DIARY_JS = `
/** Le sei variabili come le chiamiamo agli umani, per la riga dell'umore. */
const MOOD_LABEL = {
  umore: "umore", energia: "energia", stress: "stress",
  noia: "noia", affetto: "affetto", curiosita: "curiosità",
};

/** «12 agosto» invece di «2026-08-12»: è un diario, non un log. */
function diaryDay(iso) {
  const parsed = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

/** L'umore di quella giornata, in parole e numeri, se il sogno l'ha registrato. */
function moodLine(mood) {
  if (!mood) return "";
  const parts = [];
  if (mood.last_label) parts.push("<b>" + escape(String(mood.last_label)) + "</b>");
  for (const key of Object.keys(MOOD_LABEL)) {
    const value = mood[key];
    if (typeof value !== "number" && typeof value !== "string") continue;
    parts.push(escape(MOOD_LABEL[key]) + " " + Number(value).toFixed(2));
  }
  return parts.length === 0 ? "" : '<div class="why">' + parts.join(" · ") + "</div>";
}

async function loadDiary() {
  const days = $("diary-days").value;
  const data = await call(forWho("/v1/diary?giorni=" + encodeURIComponent(days)), {});
  const pages = data.pages ?? [];
  $("diary-book").innerHTML = pages.length === 0
    ? '<p class="empty">Nessuna pagina, per ora. Le scrive il sogno: se non è mai girato, il libro è vuoto.</p>'
    : pages.map((page) =>
        '<div class="deed"><span class="when">' + escape(diaryDay(page.date)) + "</span>" +
        '<div class="act">' + escape(page.text || "(pagina vuota)") + "</div>" +
        moodLine(page.mood) + "</div>").join("");
}

$("diary-days").addEventListener("change", () => {
  void section(loadDiary, "diary-msg");
});
`;
