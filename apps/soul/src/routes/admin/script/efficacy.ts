/**
 * Cosa gli è piaciuto fare (ADR-058).
 *
 * La pagina esiste per una ragione precisa e non estetica: **un apprendimento
 * che nessuno può guardare è una scatola nera che nessuno può smentire.** Se
 * UGO comincia a preferire un gesto, il proprietario deve poter vedere quale e
 * quanto, o l'unica cosa che potrà dire è «mi sembra che ultimamente…».
 *
 * E deve dire, con quelle parole, quanto poco fa: nove gesti cablati, ±40%, che
 * decadono ogni notte. Scritto nella pagina, non solo in un ADR che l'utente
 * non leggerà mai.
 *
 * NB: questo file è un template literal. Un backtick dentro un commento qui
 * chiude la stringa e `tsc` segnala l'errore venti righe più in là.
 */
export const EFFICACY_JS = `
const ACT_IT = {
  lookOver: "ti guarda", earPerk: "drizza le orecchie", comeCloser: "si sporge verso di te",
  nudge: "grugnisce per farsi notare", sigh: "sospira", callFromAcross: "ti chiama",
  sayDesire: "dice una cosa che si era segnato", askOut: "chiede di uscire",
  askQuestion: "ti fa una domanda",
};

async function loadEfficacy() {
  const rows = (await call(forWho("/v1/volition/efficacy"), {})).efficacy ?? [];
  const moved = rows.filter((r) => Math.abs(r.weight - 1) > 0.005);
  $("efficacy-list").innerHTML = moved.length === 0
    ? '<p class="empty">Ancora niente: non ha preferenze, fa quello che la situazione chiede.</p>'
    : moved
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .map((r) => {
          const percent = Math.round(r.weight * 100);
          return '<div class="deed"><div class="act">' + (ACT_IT[r.act] ?? r.act) +
            '<span class="deed-act"> · ' + percent + "%</span></div>" +
            '<div class="because">' +
            (r.weight > 1 ? "gli è andata bene, lo sceglie un po' più spesso"
                          : "non ha funzionato granché, lo sceglie un po' meno") +
            "</div></div>";
        }).join("");
}
`;
