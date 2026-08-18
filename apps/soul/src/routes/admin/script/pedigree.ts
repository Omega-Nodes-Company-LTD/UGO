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
`;
