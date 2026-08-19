/** The times he started something himself, and the switch that stops him. */
export const VOLITION_JS = `
// --- cosa ha deciso lui ----------------------------------------------------
// ADR-027 wrote down every initiative with its driver and its \`because\` in
// Italian, expressly so it could be explained afterwards. Nothing read it back
// until now: "perché me l'ha chiesto?" had no answer short of a psql session.
const ACT_LABEL = {
  initiative_taken: "ha cominciato lui", initiative_worked: "e ha funzionato",
  initiative_flat: "e non è servito", reminder_voiced: "ti ha ricordato una cosa",
  wants_out: "ha chiesto di uscire",
};
/** The acts' own ids are English code identifiers: the owner reads Italian. */
const ACT_LABEL_IT = {
  lookOver: "ti ha guardato", earPerk: "ha drizzato le orecchie",
  comeCloser: "si è avvicinato", nudge: "ti ha dato una spinta",
  sigh: "ha sospirato", callFromAcross: "ti ha chiamato",
  sayDesire: "ti ha detto una cosa che aveva in mente",
  askToGoOut: "ha chiesto di uscire", askQuestion: "ti ha fatto una domanda",
  reminder: "un promemoria",
};
const DRIVER_LABEL = {
  boredom: "noia", loneliness: "solitudine", curiosity: "curiosità",
  unspoken: "una cosa non detta", worry: "preoccupazione", outing: "voglia di uscire",
};

const when = (iso) => new Date(iso).toLocaleString("it-IT",
  { weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * La mela dal pannello: premia il gesto della riga, non «il servizio».
 *
 * Delegato sul contenitore e armato UNA volta (il modulo si carica una volta
 * sola): agganciarlo dentro il loader avrebbe accumulato un listener per ogni
 * apertura della pagina, e alla quinta una mela ne avrebbe date cinque.
 */
$("initiative-list").addEventListener("click", (event) => {
    const act = event.target.dataset ? event.target.dataset.rewardAct : undefined;
    if (!act || WHO === "") return;
    void section(async () => {
      await call("/v1/gosini/" + WHO + "/reward", {
        method: "POST",
        body: JSON.stringify({ act }),
      });
      await loadVolition();
    }, "volition-msg");
});

async function loadVolition() {
  let data;
  try { data = await call(forWho("/v1/volition"), {}); }
  catch (error) {
    // the switch only exists when initiative is wired: say so plainly
    say("volition-msg", error.status === 404
      ? "L'iniziativa non è configurata su questo server."
      : error.message, "info");
    return;
  }

  const state = data.initiative;
  $("init-toggle").textContent = state.enabled ? "Fermalo" : "Lascialo cominciare";
  // ADR-104: la scelta è di QUESTO account e resta scritta. Prima diceva «torna
  // al prossimo riavvio», che era vero e adesso sarebbe una bugia — e il
  // «deciso da qui» valeva per tutte le case insieme
  $("init-state").textContent = state.enabled
    ? "Adesso può cominciare lui."
    : "Adesso risponde soltanto, non comincia mai."
    ;
  $("init-state").textContent += state.overridden
    ? " Deciso per questo account, e resta così anche dopo un riavvio."
    : " Nessuna scelta fatta qui: decide il server, che oggi dice «"
      + (state.fromEnv ? "può" : "non può") + "»."
    ;
  // il terzo stato esiste e va potuto raggiungere: senza, «lascia decidere al
  // server» si otterrebbe solo con una query
  $("init-default").hidden = !state.overridden;

  // ADR-078: tre cose diverse nella stessa lista, e si vedono. Un timer che
  // sembrasse un desiderio del sogno farebbe pensare che «fra 10 minuti»
  // significhi «quando capita», che è precisamente il contrario
  const DESIRE_MARK = { timer: "\u23F1 timer", sveglia: "\u23F0 sveglia", promemoria: "promemoria" };
  $("desire-list").innerHTML = data.desires.length === 0
    ? '<p class="lede">Niente in sospeso.</p>'
    : data.desires.map((d) => {
        const mark = DESIRE_MARK[d.kind];
        return '<div class="deed"><span class="when">' +
          (mark ? escape(mark) + " \u00b7 " : "") +
          (d.dueAt ? "per " + when(d.dueAt) : escape(d.dueHint ?? "quando capita")) +
          '</span><div class="act">' +
          escape(d.text === "" ? (d.kind === "timer" ? "un timer" : "una sveglia") : d.text) +
          "</div>" +
          // ADR-104: annullarne uno si faceva con una UPDATE a mano
          '<button class="link danger" data-desire="' + escape(d.id) +
          '" data-testid="desire-drop">annulla</button>' +
          "</div>";
      }).join("");

  // what actually moves him, ranked. One line of arithmetic answers a question
  // the list cannot: is he lonely, or just bored?
  const counts = new Map();
  for (const row of data.journal) {
    const driver = row.payload?.driver;
    if (driver === undefined) continue;
    counts.set(driver, (counts.get(driver) ?? 0) + 1);
  }
  hbar($("driver-chart"), [...counts]
    .map(([id, value]) => ({ label: DRIVER_LABEL[id] ?? id, value }))
    .sort((a, b) => b.value - a.value));

  $("initiative-list").innerHTML = data.journal.length === 0
    ? '<p class="lede">Non ha ancora cominciato niente da solo.</p>'
    : data.journal.map((row) => {
        const p = row.payload ?? {};
        const driver = p.driver ? (DRIVER_LABEL[p.driver] ?? p.driver) : "";
        return '<div class="deed"><span class="when">' + when(row.ts) + "</span>" +
          '<div class="act">' + escape(ACT_LABEL[row.type] ?? row.type) +
          (p.act ? ' <span class="deed-act">' + escape(ACT_LABEL_IT[p.act] ?? p.act) + "</span>" : "") + "</div>" +
          (p.because ? '<div class="because">« ' + escape(p.because) + " »</div>" : "") +
          (driver ? '<div class="because">spinto da: ' + escape(driver) + "</div>" : "") +
          // ADR-100: la mela su QUESTA riga. Il campo act esisteva nel
          // contratto da ADR-058 e arrivava sempre vuoto: senza un bottone
          // che sappia cosa sta premiando, l'apprendimento riceveva «bravo
          // in generale», che non insegna quale gesto è piaciuto
          (p.act ? '<button class="ghost" data-reward-act="' + escape(p.act) +
            '" title="premia questo gesto">🍎</button>' : "") +
          "</div>";
      }).join("");
}

/**
 * ADR-104: dargli un promemoria, e toglierglielo.
 *
 * La tabella desires aveva due scrittori (il sogno e i timer a voce) e
 * nessuna porta per il titolare: «ricordamelo tu» si poteva dire a voce e non
 * si poteva scrivere, e una sveglia sbagliata si toglieva solo in psql.
 */
$("desire-add").addEventListener("click", async () => {
  const text = $("desire-new").value.trim();
  if (text === "") { say("volition-msg", "Serve una frase.", "info"); return; }
  const hint = $("desire-when").value.trim();
  try {
    await call(forWho("/v1/volition/desires"), {
      method: "POST",
      body: JSON.stringify({ text, kind: "promemoria", ...(hint ? { dueHint: hint } : {}) }),
    });
    $("desire-new").value = ""; $("desire-when").value = "";
    await loadVolition();
    say("volition-msg", "Se lo ricorda, e te lo dir\u00e0 quando \u00e8 il momento.", "ok");
  } catch (error) { say("volition-msg", error.message, "err"); }
});

$("desire-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-desire]");
  if (!button) return;
  try {
    await call("/v1/volition/desires/" + button.dataset.desire, { method: "DELETE" });
    await loadVolition();
    // non si cancella: smette di essere in sospeso, e resta nella sua biografia
    say("volition-msg", "Annullato. Non te lo dir\u00e0 pi\u00f9.", "ok");
  } catch (error) { say("volition-msg", error.message, "err"); }
});

$("init-toggle").addEventListener("click", async () => {
  try {
    const now = $("init-toggle").textContent === "Fermalo";
    await call("/v1/volition/enabled", {
      method: "POST", body: JSON.stringify({ enabled: !now }),
    });
    await loadVolition();
    say("volition-msg", now
      ? "Adesso sta zitto finché non gli parli, e resta così finché non cambi idea."
      : "Adesso può cominciare lui.", "ok");
  } catch (error) { say("volition-msg", error.message, "err"); }
});

/** ADR-104: restituire la parola al server è un gesto, non una query. */
$("init-default").addEventListener("click", async () => {
  try {
    await call("/v1/volition/enabled", { method: "POST", body: JSON.stringify({ enabled: null }) });
    await loadVolition();
    say("volition-msg", "Deciso dal server, come prima che scegliessi tu.", "ok");
  } catch (error) { say("volition-msg", error.message, "err"); }
});
`;
