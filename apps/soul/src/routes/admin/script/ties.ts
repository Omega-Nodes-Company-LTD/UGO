/**
 * Le parentele e le cartoline nel pannello (ADR-092).
 *
 * L'avvertenza sta nel markup, sopra ogni bottone: il consenso si dà avendo
 * letto cosa apre. E la cartolina chiede QUALE esemplare la spedisce — mai
 * «va il default» mentre il pannello mostra un altro (STATE §6-quadragies).
 */
export const TIES_JS = `
async function loadTies() {
  const data = await call("/v1/ties", {});
  const ties = data.ties ?? [];
  if (ties.length === 0) {
    $("ties-all").innerHTML = '<p class="empty">Nessun legame, per ora.</p>';
  } else {
    $("ties-all").innerHTML = '<ul class="plain">' + ties.map((tie) => {
      const other = escape(tie.otherName) + ' <span class="persona">' + escape(tie.otherSlug) + "</span>";
      const verso = tie.proposedByUs ? "proposta da noi a" : "proposta a noi da";
      const stato = tie.status === "accettata" ? "legate"
        : tie.status === "revocata" ? "revocata"
        : verso.split(" ")[0] + " in attesa";
      const azioni = tie.status === "proposta" && !tie.proposedByUs
        ? ' <button data-tie-accept="' + escape(tie.id) + '">Accetta</button>'
        : "";
      const revoca = tie.status === "revocata" ? ""
        : ' <button class="ghost" data-tie-revoke="' + escape(tie.id) + '">Revoca</button>';
      return '<li data-tie="' + escape(tie.id) + '"><b>' + escape(tie.label) + "</b> — " +
        verso + " " + other + " · " + escape(stato) + azioni + revoca + "</li>";
    }).join("") + "</ul>";
  }

  // il selettore della cartolina: SOLO i legami accettati sono una porta
  const accepted = ties.filter((tie) => tie.status === "accettata");
  $("parcel-tie").innerHTML = accepted.length === 0
    ? '<option value="">— nessun legame accettato —</option>'
    : '<option value="">— scegli —</option>' + accepted.map((tie) =>
        '<option value="' + escape(tie.id) + '">' + escape(tie.label) + " (" + escape(tie.otherName) + ")</option>"
      ).join("");
  $("parcel-from").innerHTML = '<option value="">— chi la spedisce? —</option>' +
    GOSINI.map((g) => '<option value="' + escape(g.id) + '">' + escape(g.name) + "</option>").join("");
}

async function loadParcels() {
  const data = await call("/v1/parcels", {});
  const inbox = data.inbox ?? [];
  const outbox = data.outbox ?? [];
  $("parcels-inbox").innerHTML = inbox.length === 0
    ? '<p class="empty">Niente in cassetta.</p>'
    : '<ul class="plain">' + inbox.map((p) =>
        '<li data-parcel="' + escape(p.id) + '"><b>' + escape(p.kind) + "</b> da " +
        escape(p.otherName) + ": " +
        (p.text === "" ? "<i>non si apre con la chiave di questa casa</i>" : escape(p.text)) +
        (p.kind === "ricordo" && p.keptAt === null && p.text !== ""
          ? ' <button data-parcel-keep="' + escape(p.id) + '">Tienilo</button>'
          : p.keptAt !== null ? ' <span class="persona">tenuto</span>' : "") +
        "</li>"
      ).join("") + "</ul>";
  $("parcels-outbox").innerHTML = outbox.length === 0
    ? '<p class="empty">Nessuna spedita.</p>'
    : '<ul class="plain">' + outbox.map((p) =>
        "<li><b>" + escape(p.kind) + "</b> a " + escape(p.otherName) +
        " · " + escape(p.status) + "</li>"
      ).join("") + "</ul>";
}

$("tie-propose").addEventListener("click", async () => {
  const toHousehold = $("tie-house").value.trim();
  const label = $("tie-label").value.trim();
  if (toHousehold === "" || label === "") {
    say("tie-msg", "Serve lo slug della loro casa e un nome per il legame.", "info");
    return;
  }
  try {
    await call("/v1/ties", { method: "POST", body: JSON.stringify({ toHousehold, label }) });
    $("tie-house").value = ""; $("tie-label").value = "";
    say("tie-msg", "Proposta mandata: ora tocca a loro.", "ok");
    await loadTies();
  } catch (error) { say("tie-msg", error.message, "err"); }
});

$("ties-all").addEventListener("click", async (event) => {
  const accept = event.target.dataset.tieAccept;
  const revoke = event.target.dataset.tieRevoke;
  try {
    if (accept !== undefined) {
      await call("/v1/ties/" + encodeURIComponent(accept) + "/accept", { method: "POST", body: "{}" });
      say("tie-msg", "Legate. Da adesso le cartoline possono viaggiare — sempre e solo quando le spedite voi.", "ok");
    }
    if (revoke !== undefined) {
      await call("/v1/ties/" + encodeURIComponent(revoke) + "/revoke", { method: "POST", body: "{}" });
      say("tie-msg", "Revocata: per le cartoline quella casa è tornata un'estranea.", "ok");
    }
    if (accept !== undefined || revoke !== undefined) await loadTies();
  } catch (error) { say("tie-msg", error.message, "err"); }
});

$("parcel-send").addEventListener("click", async () => {
  const tieId = $("parcel-tie").value;
  const fromGosinoId = $("parcel-from").value;
  const text = $("parcel-text").value.trim();
  if (tieId === "") { say("parcel-msg", "A chi? Scegli un legame accettato.", "info"); return; }
  // quale esemplare la firma lo dici tu: un default silenzioso spedirebbe
  // a nome di uno mentre il pannello ne mostra un altro
  if (fromGosinoId === "") { say("parcel-msg", "Chi la spedisce? Scegli l'esemplare.", "info"); return; }
  if (text === "") { say("parcel-msg", "E il testo?", "info"); return; }
  try {
    await call("/v1/parcels", {
      method: "POST",
      body: JSON.stringify({ tieId, fromGosinoId, kind: $("parcel-kind").value, text }),
    });
    $("parcel-text").value = "";
    say("parcel-msg", "Partita.", "ok");
    await loadParcels();
  } catch (error) { say("parcel-msg", error.message, "err"); }
});

$("parcels-inbox").addEventListener("click", async (event) => {
  const keep = event.target.dataset.parcelKeep;
  if (keep === undefined) return;
  try {
    await call("/v1/parcels/" + encodeURIComponent(keep) + "/keep", { method: "POST", body: "{}" });
    say("parcel-msg", "Tenuto: adesso è un suo ricordo.", "ok");
    await loadParcels();
  } catch (error) { say("parcel-msg", error.message, "err"); }
});
`;
