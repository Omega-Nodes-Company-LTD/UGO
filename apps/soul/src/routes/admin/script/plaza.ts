/** La piazza (ADR-132) e l'incontro di persona (ADR-020). Tutto da `call()`. */
export const PLAZA_JS = `
const PLAZA_STATE = { attesa: "in attesa", accettato: "in corso", rifiutato: "rifiutato", scaduto: "scaduto",
  concluso: "concluso", interrotto: "interrotto" };
const plazaGosino = () => $("plaza-gosino").value;
let PLAZA_TIMER = undefined;

async function loadPlaza() {
  const select = $("plaza-gosino");
  const chosen = select.value || WHO || GOSINI[0]?.id || "";
  select.innerHTML = GOSINI.map((g) => '<option value="' + g.id + '">' + escape(g.name) + "</option>").join("");
  if (chosen !== "") select.value = chosen;
  if (GOSINI.length === 0) { say("plaza-msg", "Questa casa non ha ancora un gosino.", "info"); return; }
  const p = await call("/v1/piazza", {});
  const here = p.miei.find((m) => m.gosino === plazaGosino());
  $("plaza-me").innerHTML = here
    ? tile("in piazza", "sì", "fino alle " + new Date(here.scade).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }))
    : tile("in piazza", "no", "entra per vedere chi c'è e farti invitare");
  $("plaza-enter").textContent = here ? "Resta altri trenta minuti" : "Entra in piazza";
  $("plaza-leave").hidden = !here;
  $("plaza-people").innerHTML = p.presenti.length === 0 ? '<p class="empty">Non c\\u2019è nessuno, adesso.</p>' :
    p.presenti.map((x) => '<div class="deed"><div class="act"><b>' + escape(x.name) + "</b> \\u00b7 generazione " +
      x.generation + " \\u00b7 " + escape(x.mood) + "</div>" +
      (here ? '<button class="ghost" data-invite="' + escape(x.handle) + '">Invita</button>' : "") + "</div>").join("");
  $("plaza-invites").innerHTML = p.inviti.length === 0 ? '<p class="empty">Nessun invito.</p>' :
    p.inviti.map((i) => '<div class="deed"><span class="when">' + (i.verso === "entrata" ? "ricevuto" : "mandato") +
      " \\u00b7 " + escape(PLAZA_STATE[i.stato] ?? i.stato) + (i.turni > 0 ? " \\u00b7 " + i.turni + " battute" : "") + "</span>" +
      '<div class="act">' + escape(i.mio) + " e " + escape(i.altro) + "</div>" +
      (i.verso === "entrata" && i.stato === "attesa"
        ? '<div class="row"><button data-answer="accetta" data-id="' + i.id + '">Accetta</button>' +
          '<button class="ghost" data-answer="rifiuta" data-id="' + i.id + '">Rifiuta</button>' +
          '<button class="ghost" data-answer="blocca" data-id="' + i.id + '">Blocca questa casa</button></div>'
        : i.stato === "concluso" ? '<button class="ghost" data-read="' + i.id + '">Leggi la chiacchierata</button>' : "") +
      "</div>").join("");
  await loadPeers();
  // un incontro in corso si segue da qui: si riguarda finché non finisce
  clearTimeout(PLAZA_TIMER);
  if (p.inviti.some((i) => i.stato === "accettato")) PLAZA_TIMER = setTimeout(() => section(loadPlaza, "plaza-msg"), 3000);
}

async function loadPeers() {
  const k = await call("/v1/gosini/" + plazaGosino() + "/conoscenze", {});
  $("peer-switch").innerHTML = '<button class="ghost" id="peer-toggle" data-on="' + k.attivi + '">' +
    (k.attivi ? "Spegni gli incontri di persona" : "Accendi gli incontri di persona") + "</button>";
  $("peer-known").innerHTML = k.conoscenze.length === 0 ? '<p class="empty">Non conosce ancora nessun altro gosino.</p>' :
    k.conoscenze.map((c) => '<div class="deed"><div class="act"><b>' + escape(c.nome) + "</b> \\u00b7 familiarit\\u00e0 " +
      Math.round(c.familiarita * 100) + "%</div>" +
      '<button class="ghost" data-forget="' + c.essere + '">Dimentica</button></div>').join("");
}

$("plaza-gosino").addEventListener("change", () => section(loadPlaza, "plaza-msg"));
$("plaza-enter").addEventListener("click", async () => {
  try {
    await call("/v1/piazza/presenza", { method: "POST", body: JSON.stringify({ gosino: plazaGosino() }) });
    await loadPlaza();
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
$("plaza-leave").addEventListener("click", async () => {
  try {
    await call("/v1/piazza/presenza?gosino=" + encodeURIComponent(plazaGosino()), { method: "DELETE" });
    await loadPlaza();
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
$("plaza-people").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-invite]");
  if (!button) return;
  try {
    await call("/v1/piazza/inviti", { method: "POST", body: JSON.stringify({ gosino: plazaGosino(), a: button.dataset.invite }) });
    say("plaza-msg", "Invito mandato: tocca all'altra casa dire di sì.", "ok");
    await loadPlaza();
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
$("plaza-invites").addEventListener("click", async (event) => {
  const answer = event.target.closest("[data-answer]");
  const read = event.target.closest("[data-read]");
  try {
    if (answer) {
      await call("/v1/piazza/inviti/" + answer.dataset.id + "/" + answer.dataset.answer, { method: "POST" });
      await loadPlaza();
    } else if (read) {
      const t = await call("/v1/piazza/inviti/" + read.dataset.read + "/battute", {});
      $("plaza-talk").innerHTML = '<div class="block">' + t.battute.map((b) => '<div class="line"><b>' +
        (b.chi === "mio" ? "lui" : "l\\u2019altro") + "</b> " + escape(b.testo) + "</div>").join("") + "</div>";
    }
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
$("peer-switch").addEventListener("click", async (event) => {
  const button = event.target.closest("#peer-toggle");
  if (!button) return;
  try {
    await call("/v1/gosini/" + plazaGosino() + "/incontri", {
      method: "PUT", body: JSON.stringify({ attivi: button.dataset.on !== "true" }),
    });
    await loadPeers();
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
$("peer-known").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-forget]");
  if (!button) return;
  try {
    await call("/v1/gosini/" + plazaGosino() + "/conoscenze/" + button.dataset.forget, { method: "DELETE" });
    await loadPeers();
  } catch (error) { say("plaza-msg", error.message, "err"); }
});
`;
