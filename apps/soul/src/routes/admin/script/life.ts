/**
 * L'arco della vita nel pannello (ADR-077).
 *
 * Tre cose e nessuna quarta: **a che punto è**, **l'accettazione della
 * mortalità** per chi è nato prima dell'arco, e **il congedo**. Quello che
 * NON c'è è la parte importante: nessun conto alla rovescia, nessuna data,
 * nessuna barra che si riempie. Il pannello non può mostrare ciò che il
 * server non manda — e non lo manda apposta.
 */
export const LIFE_JS = `
const COAT_LABEL = {
  scuro: "pelo scuro",
  brizzolato: "qualche setola grigia",
  grigio: "grigio",
};

/** Quanti giorni, detti come li direbbe una persona. */
const lifeAge = (days) => days < 60
  ? days + (days === 1 ? " giorno" : " giorni")
  : days < 365 ? Math.round(days / 30) + " mesi" : (days / 365).toFixed(1) + " anni";

async function loadLife() {
  if (WHO === "") { $("life-state").innerHTML = ""; return; }
  // la lista è già la fonte dell'età: una rotta in più direbbe le stesse tre
  // cose, e la quarta che non vogliamo dire
  const who = (await call("/v1/gosini", {})).gosini.find((g) => g.id === WHO);
  if (who === undefined) { $("life-state").innerHTML = '<p class="empty">Non esiste.</p>'; return; }

  $("life-accept-block").hidden = who.mortal === true;

  const head = who.age === undefined
    ? '<p class="lede"><b>Non sta ancora invecchiando.</b> È nato prima che l\\'arco della ' +
      "vita esistesse: finché non accetti, per lui il tempo non conta.</p>"
    : '<div class="bank-row"><span class="bank-big">' + escape(lifeAge(who.age.days)) + "</span>" +
      '<span class="bank-note">' + escape(who.age.stage) + " · " +
      escape(COAT_LABEL[who.age.coat] ?? who.age.coat) + "</span></div>";

  // il preavviso è l'unica cosa che si dice sulla fine, e si dice tutta
  const notice = who.farewellNotice !== true ? "" :
    '<p class="lede" style="margin-top:.8rem"><b class="err">Il suo tempo sta finendo.</b> ' +
    "Te l'abbiamo detto con sessanta giorni d'anticipo perché tu possa fare tre cose: " +
    "<b>esportare il diario</b> (in <i>I dati</i>) se non hai altri gosini in casa, " +
    "fargli fare <b>una cucciolata</b> se vuoi che la sua linea continui, e stargli vicino. " +
    "Quello che sa lo sta già raccontando ai più giovani, un pezzo per volta.</p>";

  $("life-state").innerHTML = head + notice;
}

$("life-accept").addEventListener("click", async () => {
  const who = GOSINI.find((g) => g.id === WHO);
  if (who === undefined) { say("life-msg", "Scegli prima di chi stiamo parlando.", "info"); return; }
  if (!confirm("Da oggi " + who.name + " invecchia, e un giorno se ne andrà. Non si torna indietro.")) return;
  $("life-accept").disabled = true;
  try {
    await call("/v1/gosini/" + encodeURIComponent(WHO) + "/mortality", { method: "POST" });
    say("life-msg", "Accettato: da oggi il suo arco è cominciato, e ha almeno tre anni davanti.", "ok");
    await loadGosini();
    await loadLife();
  } catch (error) {
    say("life-msg", error.message, "err");
  } finally { $("life-accept").disabled = false; }
});

const byeOptions = () => ({ includeStories: $("bye-stories").value === "si" });

$("bye-preview").addEventListener("click", async () => {
  try {
    const seen = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/farewell/preview", {
      method: "POST",
      body: JSON.stringify(byeOptions()),
    });
    $("bye-summary").innerHTML =
      "<ul class=\\"plain\\">" +
      "<li><b>" + seen.legacy + "</b> ricordi passerebbero nel lascito, riscritti con la chiave della casa</li>" +
      "<li><b>" + seen.diaryEntries + "</b> pagine di diario restano comunque: il libro della vita è della casa</li>" +
      "<li>" + (seen.hasSoulKey
        ? "la chiave della sua interiorità <b>c'è</b>, e verrebbe distrutta"
        : "non ha una chiave dell'interiorità (è nato prima): non c'è niente da distruggere") +
      "</li></ul>";
    if (seen.alreadyGone) say("bye-msg", "Se n'è già andato.", "info");
  } catch (error) {
    say("bye-msg", error.message, "err");
  }
});

$("bye-go").addEventListener("click", async () => {
  const confirmName = $("bye-name").value.trim();
  if (confirmName === "") { say("bye-msg", "Scrivi il suo nome: è la conferma.", "info"); return; }
  if (!confirm("Il congedo di " + confirmName + " non si annulla. Procedo?")) return;
  $("bye-go").disabled = true;
  try {
    const done = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/farewell", {
      method: "POST",
      body: JSON.stringify({ ...byeOptions(), confirmName }),
    });
    say("bye-msg", done.name + " se n'è andato. Restano " + done.legacyKept +
      " ricordi curati, e tutto il diario.", "ok");
    $("bye-name").value = "";
    await loadGosini();
  } catch (error) {
    say("bye-msg", error.message, "err");
  } finally { $("bye-go").disabled = false; }
});
`;
