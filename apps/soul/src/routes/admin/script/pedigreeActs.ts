/**
 * Gli atti della pagina «Da chi discende»: cedere, mettere in vetrina, leggere
 * il genoma (ADR-082, ADR-083, ADR-105).
 *
 * Stavano dentro PEDIGREE_STYLES — cioè nel foglio di stile, dove il
 * browser non esegue niente: i tre riquadri non avevano mai funzionato, e la
 * pagina si fermava su «loadGenome is not defined». Il test che percorre il
 * router (script.test.ts) adesso pretende che ogni funzione chiamata esista.
 */
export const PEDIGREE_ACTS_JS = `
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
