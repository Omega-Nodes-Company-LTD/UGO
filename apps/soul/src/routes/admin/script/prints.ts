/**
 * I volti: chi ha imparato, e chi non sa ancora chi sia (ADR-052).
 *
 * Qui **non** c'è un modulo di arruolamento, ed è una decisione del
 * proprietario: il volto glielo insegni perché te lo chiede lui, a voce, quando
 * ti rivede. Quel che c'è è la *revisione*, che non è comodità — in
 * `unknown_prints` ci sono dati biometrici di persone che non hanno
 * acconsentito, e chi tiene quei dati deve poter vedere quali sono e
 * cancellarne uno col dito.
 *
 * Quel che questa pagina non mostra, e non può: l'impronta. La rotta restituisce
 * conteggi e date, mai il vettore. Un pannello che scaricasse embedding sarebbe
 * un modo per farli uscire di casa.
 *
 * NB: questo file è un template literal. Un backtick dentro un commento qui
 * chiude la stringa e `tsc` segnala l'errore venti righe più in là.
 */
export const PRINTS_JS = `
let PRINT_PICKED = "";

const whenShort = (iso) => new Date(iso).toLocaleString("it-IT",
  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function loadPrints() {
  const answer = await call("/v1/prints/unknown", {});
  const prints = answer.prints ?? [];
  $("print-retention").textContent = String(answer.retentionDays ?? 30);

  $("prints-list").innerHTML = prints.length === 0
    ? '<p class="empty">Nessuna faccia in sospeso. Vuol dire che conosce tutti quelli che ha visto.</p>'
    : prints.map((p) =>
        '<div class="deed print-row' + (p.id === PRINT_PICKED ? " on" : "") +
        '" data-print="' + p.id + '" data-testid="print-row">' +
        '<div class="act">Vista ' + p.seenCount + (p.seenCount === 1 ? " volta" : " volte") +
        '<span class="deed-act"> · l\\'ultima ' + whenShort(p.lastSeenAt) + "</span></div>" +
        '<div class="because">' +
        (p.askedAt ? "Te l'ha già chiesto." : "Non te l'ha ancora chiesto.") +
        " Prima volta il " + whenShort(p.firstSeenAt) + ".</div></div>").join("");

  // le persone fra cui scegliere sono quelle del branco: rivendicare una faccia
  // per qualcuno che non esiste non e' una cosa che deve essere possibile
  const beings = (await call("/v1/beings", {})).beings ?? [];
  $("print-who").innerHTML = beings.map((b) =>
    '<option value="' + b.id + '">' + escape(b.displayName) + "</option>").join("");

  $("faces-list").innerHTML = (() => {
    const known = beings.filter((b) => (b.recognition ?? []).some((r) => r.modality === "face"));
    if (known.length === 0) {
      return '<p class="empty">Non ha ancora imparato nessun volto.</p>';
    }
    return known.map((b) =>
      '<div class="deed"><div class="act">' + escape(b.displayName) +
      '<button class="ghost face-del" data-being="' + b.id + '" data-testid="face-del">dimentica il volto</button>' +
      "</div></div>").join("");
  })();

  $("print-claim").disabled = PRINT_PICKED === "";
  $("print-del").disabled = PRINT_PICKED === "";
}

$("prints-list").addEventListener("click", (event) => {
  const row = event.target.closest(".print-row");
  if (row === null) return;
  PRINT_PICKED = row.dataset.print;
  void section(loadPrints, "prints-msg");
});

$("print-claim").addEventListener("click", async () => {
  if (PRINT_PICKED === "") return;
  $("print-claim").disabled = true;
  try {
    await call("/v1/prints/" + PRINT_PICKED + "/claim", {
      method: "POST",
      body: JSON.stringify({ beingId: $("print-who").value }),
    });
    PRINT_PICKED = "";
    say("prints-msg", "Imparato. Da adesso lo riconosce guardandolo.", "ok");
    await loadPrints();
  } catch (error) {
    // un 403 qui e' una protezione che funziona, non un guasto, e va detto
    // con quelle parole: e' l'unico modo in cui il proprietario capisce che
    // l'interruttore che ha messo sta facendo il suo lavoro
    say("prints-msg", error.message.includes("403") || error.message.includes("refused")
      ? "Rifiutato, ed è giusto così: per questa persona hai chiesto di non usare la camera, " +
        "oppure è un minore. L'impronta è stata cancellata."
      : error.message, error.message.includes("403") ? "info" : "err");
    await loadPrints();
  }
});

$("print-del").addEventListener("click", async () => {
  if (PRINT_PICKED === "") return;
  try {
    await call("/v1/prints/" + PRINT_PICKED, { method: "DELETE" });
    PRINT_PICKED = "";
    say("prints-msg", "Distrutta.", "ok");
    await loadPrints();
  } catch (error) { say("prints-msg", error.message, "err"); }
});

$("faces-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".face-del");
  if (button === null) return;
  try {
    await call("/v1/beings/" + button.dataset.being + "/recognition/face", { method: "DELETE" });
    say("faces-msg", "Il volto è stato dimenticato. La persona resta.", "ok");
    await loadPrints();
  } catch (error) { say("faces-msg", error.message, "err"); }
});
`;
