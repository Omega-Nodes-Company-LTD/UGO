/**
 * I documenti di casa nel pannello (ADR-111).
 *
 * Il file **non passa da soul**: si chiede un URL firmato, si carica dritto
 * nel bucket, e solo dopo si registra la riga. È il giro dei documenti dei
 * clienti, e la ragione è la stessa — far transitare un PDF di duecento pagine
 * dentro l'anima vorrebbe dire tenerlo in RAM per rimetterlo dove sarebbe
 * andato comunque.
 *
 * Ogni chiamata passa da `call()`, che porta la casa (ADR-019 fase 3): un
 * `fetch` diretto qui dentro perderebbe lo scope e leggerebbe la casa
 * sbagliata.
 */
export const DOCUMENTS_JS = `
function docState(row) {
  if (row.status === "error") return "non sono riuscito a leggerlo";
  if (row.indexedAt) return "letto";
  return "in attesa della prossima notte";
}

async function loadDocuments() {
  const rows = (await call("/v1/documents", {})).documents ?? [];
  if (rows.length === 0) {
    $("docs-all").innerHTML = '<p class="empty">Nessun documento. Caricate il libretto della caldaia e provate a chiedergli che modello e.</p>';
    return;
  }
  $("docs-all").innerHTML = '<ul class="plain">' + rows.map((row) =>
    '<li data-doc="' + escape(row.id) + '"><b>' + escape(row.filename) + "</b> " +
    '<span class="muted">' + escape(docState(row)) + "</span> " +
    '<button class="ghost" data-doc-drop="' + escape(row.id) + '">butta</button></li>'
  ).join("") + "</ul>";
}

$("doc-upload").addEventListener("click", async () => {
  const picked = $("doc-file").files;
  const file = picked && picked.length > 0 ? picked[0] : undefined;
  if (file === undefined) { say("doc-msg", "Quale file?", "info"); return; }
  try {
    const mime = file.type === "" ? "application/octet-stream" : file.type;
    const signed = await call("/v1/documents/presign", {
      method: "POST", body: JSON.stringify({ filename: file.name, mime }),
    });
    const put = await fetch(signed.url, { method: "PUT", headers: { "content-type": mime }, body: file });
    if (!put.ok) throw new Error("il caricamento nell archivio non e riuscito");
    await call("/v1/documents", {
      method: "POST",
      body: JSON.stringify({ s3Key: signed.key, filename: file.name, mime, sizeBytes: file.size }),
    });
    $("doc-file").value = "";
    say("doc-msg", "Caricato. Lo legge stanotte.", "ok");
    await loadDocuments();
  } catch (error) { say("doc-msg", error.message, "err"); }
});

$("docs-all").addEventListener("click", async (event) => {
  const drop = event.target.dataset.docDrop;
  if (drop === undefined) return;
  if (!confirm("Butto questo documento e tutto quello che ne ha imparato?")) return;
  try {
    await call("/v1/documents/" + encodeURIComponent(drop), { method: "DELETE" });
    await loadDocuments();
  } catch (error) { say("doc-msg", error.message, "err"); }
});
`;
