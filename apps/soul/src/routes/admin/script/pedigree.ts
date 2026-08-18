/**
 * Il pedigree nel pannello (ADR-070).
 *
 * Un pedigree che nessuno può guardare non serve a niente: la firma esiste
 * per essere verificata, e il verdetto va detto in italiano e senza gergo —
 * «senza firma» non è un errore, «firma non valida» sì.
 */
export const PEDIGREE_JS = `
const VERDICT_LABEL = {
  valid: { text: "firmato", cls: "ok" },
  unsigned: { text: "senza firma", cls: "muted" },
  invalid: { text: "FIRMA NON VALIDA", cls: "err" },
};

async function loadPedigree() {
  if (WHO === "") { $("pedigree-tree").innerHTML = ""; return; }
  const tree = (await call("/v1/gosini/" + encodeURIComponent(WHO) + "/pedigree", {})).pedigree ?? [];
  const byId = new Map(tree.map((node) => [node.id, node]));

  const draw = (id, depth) => {
    const node = byId.get(id);
    if (node === undefined || depth > 6) return "";
    const head = '<div class="ped-node">' +
      "<b>" + escape(node.name) + "</b>" +
      '<span class="ped-gen">generazione ' + node.generation + "</span>" +
      (node.genomeHash === undefined ? "" :
        '<code class="ped-hash" title="impronta del genoma firmata dai genitori">' +
        escape(node.genomeHash.slice(0, 12)) + "</code>") +
      "</div>";
    if (node.parents.length === 0) {
      return head + (depth === 0 ? '<p class="empty">Capostipite: non discende da nessuno.</p>' : "");
    }
    const kids = node.parents.map((parent) => {
      const verdict = VERDICT_LABEL[parent.verdict] ?? VERDICT_LABEL.unsigned;
      return '<li><span class="ped-edge ' + verdict.cls + '">' + verdict.text + "</span> " +
        draw(parent.id, depth + 1) + "</li>";
    }).join("");
    return head + '<ul class="ped-parents">' + kids + "</ul>";
  };

  $("pedigree-tree").innerHTML = tree.length === 0
    ? '<p class="empty">Nessuna genealogia.</p>'
    : draw(WHO, 0);

  const broken = tree.some((node) => node.parents.some((p) => p.verdict === "invalid"));
  if (broken) say("pedigree-msg", "Almeno una firma non regge: un genoma è stato modificato dopo la nascita.", "err");
  else $("pedigree-msg").innerHTML = "";

  // ADR-073: e cosa ne dice il libro genealogico. Assente = registro spento
  // o irraggiungibile, e il pedigree vale lo stesso: le firme non dipendono da lui
  const registered = (await call("/v1/gosini/" + encodeURIComponent(WHO) + "/pedigree", {})).registered;
  $("chain-acts").innerHTML = registered === undefined
    ? '<p class="empty">Nessun libro genealogico collegato: le firme dei genitori valgono comunque.</p>'
    : registered.length === 0
      ? '<p class="empty">Non ancora registrato in catena.</p>'
      : "<ul class=\\"plain\\">" + registered.map((act) =>
          "<li><b>" + escape(act.kind) + "</b> · voce n° " + act.seq +
          ' <span class="muted">' + escape(new Date(act.at).toLocaleDateString("it-IT")) + "</span></li>"
        ).join("") + "</ul>";
}
`;

/** Lo stile dell'albero: rientri e un verdetto leggibile a colpo d'occhio. */
export const PEDIGREE_STYLES = `
  .ped-node { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap;
              padding: .35rem 0; }
  .ped-gen { font-size: .78rem; color: var(--ink-3); }
  .ped-hash { font-size: .72rem; color: var(--ink-3); }
  .ped-parents { list-style: none; margin: 0 0 0 .4rem; padding: 0 0 0 1rem;
                 border-left: 1px solid var(--line); }
  .ped-parents > li { margin: .2rem 0; }
  .ped-edge { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; }
  .ped-edge.ok { color: var(--data); }
  .ped-edge.muted { color: var(--ink-3); }
  .ped-edge.err { color: var(--err, #b3261e); font-weight: 600; }

/**
 * La cessione (ADR-082). Il riquadro compare solo se questa casa alleva **e**
 * la creatura è nata: offrire di cedere un capostipite vorrebbe dire promettere
 * una cosa che il registro rifiuta comunque, e scoprirlo dopo il click.
 */
function drawCede() {
  const house = myHouse();
  const who = GOSINI.find((g) => g.id === WHO);
  const canBreed = house === undefined || house.canBreed === true || house.isFoundry === true;
  $("cede-block").hidden = !(canBreed && who?.origin === "nato");
}

$("cede-go").addEventListener("click", async () => {
  const toHousehold = $("cede-to").value.trim();
  const confirmName = $("cede-name").value.trim();
  if (toHousehold === "" || confirmName === "") {
    say("cede-msg", "Servono la casa che riceve e il suo nome.", "info");
    return;
  }
  if (!confirm("Cedere " + confirmName + " non si annulla: la vita fatta qui resta qui.")) return;
  $("cede-go").disabled = true;
  try {
    const done = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/cede", {
      method: "POST",
      body: JSON.stringify({ toHousehold, confirmName }),
    });
    say("cede-msg", done.name + " è stato ceduto. " + done.leftBehind +
      " righe di vita sono rimaste qui, e non sono partite con lui.", "ok");
    await loadGosini();
    location.hash = at("#/casa");
  } catch (error) {
    say("cede-msg", error.message, "err");
  } finally { $("cede-go").disabled = false; }
});

/**
 * La vetrina (ADR-083), dal lato di chi alleva. Stesso criterio della
 * cessione: il riquadro esiste solo per un nato di un allevamento, perché
 * un capostipite in vendita sarebbe una linea che comincia due volte.
 */
function drawVetrina() {
  const house = myHouse();
  const who = GOSINI.find((g) => g.id === WHO);
  const canBreed = house === undefined || house.canBreed === true || house.isFoundry === true;
  const eligible = canBreed && who?.origin === "nato";
  $("vetrina-block").hidden = !eligible;
  if (!eligible) return;
  const listed = who?.listed === true;
  $("vetrina-toggle").textContent = listed ? "Toglilo dalla vetrina" : "Mettilo in vetrina";
  $("vetrina-state").textContent = listed
    ? "È in vetrina: chi cerca un gosino lo vede, e ne vede il pedigree."
    : "Non è in vetrina: lo vedi solo tu.";
}

$("vetrina-toggle").addEventListener("click", async () => {
  const who = GOSINI.find((g) => g.id === WHO);
  try {
    const done = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/vetrina", {
      method: "POST",
      body: JSON.stringify({ listed: who?.listed !== true }),
    });
    say("vetrina-msg", done.listed ? "In vetrina." : "Tolto dalla vetrina.", "ok");
    await loadGosini();
    drawVetrina();
  } catch (error) {
    say("vetrina-msg", error.message, "err");
  }
});
`;