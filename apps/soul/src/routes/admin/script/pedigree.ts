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
 * La cessione (ADR-082). Il riquadro compare solo se questo account alleva **e**
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
  const toAccount = $("cede-to").value.trim();
  const confirmName = $("cede-name").value.trim();
  if (toAccount === "" || confirmName === "") {
    say("cede-msg", "Servono la casa che riceve e il suo nome.", "info");
    return;
  }
  if (!confirm("Cedere " + confirmName + " non si annulla: la vita fatta qui resta qui.")) return;
  $("cede-go").disabled = true;
  try {
    const done = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/cede", {
      method: "POST",
      body: JSON.stringify({ toAccount, confirmName }),
    });
    say("cede-msg", done.name + " è stato ceduto. " + done.leftBehind +
      " righe di vita sono rimaste qui, e non sono partite con lui.", "ok");
    await loadGosini();
    location.hash = at("#/sommario");
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
    // il prezzo si manda solo quando lo si mette in vetrina, e solo se c'è:
    // uno zero vorrebbe dire «gratis», che è un'altra cosa da «da concordare»
    const euro = Number($("vetrina-price").value);
    const listed = who?.listed !== true;
    const done = await call("/v1/gosini/" + encodeURIComponent(WHO) + "/vetrina", {
      method: "POST",
      body: JSON.stringify({
        listed,
        ...(listed && euro > 0 ? { priceCents: Math.round(euro * 100) } : {}),
      }),
    });
    say("vetrina-msg", done.listed ? "In vetrina." : "Tolto dalla vetrina.", "ok");
    await loadGosini();
    drawVetrina();
  } catch (error) {
    say("vetrina-msg", error.message, "err");
  }
});


/**
 * ADR-105 — com'e fatto, in sola lettura.
 *
 * Le due copie di ogni gene disegnate come due tacche sulla stessa riga, e
 * sotto il valore che si vede addosso a lui. Quando una copia resta coperta lo
 * diciamo a parole: e la cosa che il pannello non poteva dire, e la ragione
 * per cui da due genitori senza chiazze nasce ogni tanto un cucciolo a
 * chiazze.
 */
const GENE_LABEL = {
  chonk: "stazza", ear: "orecchie", snout: "grugno", eye: "occhi", leg: "zampe", bristle: "setole",
  hue: "tinta", spots: "chiazze", tail: "coda", curiosity: "curiosita",
  boldness: "sfacciataggine", affection: "affetto", calm: "calma",
  talkativeness: "parlantina", longevity: "longevita",
};
const EXPRESSION_WORD = {
  blend: "si mescolano", dominant: "vince la piu alta", recessive: "vince la piu bassa",
};

async function loadGenome() {
  let data;
  try { data = await call(forWho("/v1/gosini/" + WHO + "/genome"), {}); }
  catch (error) {
    say("genome-msg", error.status === 404
      ? "Di questa creatura non e stato scritto nessun genoma."
      : error.message, "info");
    $("genome-list").innerHTML = "";
    return;
  }

  const pct = (value) => (value * 100).toFixed(0) + "%";
  $("genome-list").innerHTML =
    '<p class="lede">Ceppo ' + data.ceppo + " \u00b7 versione " + data.version +
    (data.versions > 1 ? " di " + data.versions : "") +
    (data.note ? " \u00b7 " + escape(data.note) : "") + "</p>" +
    data.genes.map((gene) => {
      const covered = gene.hidden === undefined ? "" :
        '<div class="because">porta ' + pct(gene.hidden) +
        " e non lo mostra: puo passarlo ai figli</div>";
      return '<div class="gene"><span class="name">' +
        escape(GENE_LABEL[gene.key] ?? gene.key) + "</span>" +
        '<span class="copies">' + gene.alleles.map(pct).join(" \u00b7 ") + "</span>" +
        '<span class="shown">' + pct(gene.expressed) + "</span>" +
        '<span class="flags">' + escape(EXPRESSION_WORD[gene.expression] ?? gene.expression) +
        "</span>" + covered + "</div>";
    }).join("");
  say("genome-msg", "Si legge, non si tocca.", "info");
}
`;
