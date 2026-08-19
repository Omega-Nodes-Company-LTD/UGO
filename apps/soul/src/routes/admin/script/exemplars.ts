/**
 * Why each variable reads what it reads (ADR-034).
 *
 * Navigation and `forWho` moved to the router with ADR-035; what is left here
 * is the one thing this file was always about — turning a breakdown into a
 * line a person can read.
 */
export const EXEMPLARS_JS = `
// The event names are the psyche's own vocabulary (packages/psyche/events.ts).
// Anything not listed is shown raw rather than hidden: an unlabelled cause is
// a gap in this map, and pretending it does not exist would be worse.
const CAUSE_LABEL = {
  conversation_turn: "conversazione", presence_detected: "ti ha visto",
  compliment: "un complimento", ignored_day: "giornate ignorato",
  high_humidity: "umidità", heat_stress: "caldo", loud_noise: "rumore",
  shake: "urti", meeting_completed: "una riunione", new_topic: "argomenti nuovi",
  peer_met: "ha conosciuto un simile", peer_greeted: "ha rivisto un simile",
  solitude_hour: "solitudine", went_out: "è uscito", came_home: "è tornato",
  // ADR-101: le sei che mancavano. Una causa senza etichetta si mostra col
  // suo id inglese — loud_noise_muffled in mezzo a «rumore» e «solitudine» —
  // e chi legge il pannello non deve imparare il nostro vocabolario interno
  reward: "una mela", used_prop: "è andato a un arredo", napped: "ha schiacciato un pisolino",
  loud_noise_muffled: "un rumore attutito", calm_voice: "una voce calma",
  excited_voice: "una voce su di giri",
};
const causeName = (cause) => cause == null ? "da prima del riavvio" : (CAUSE_LABEL[cause] ?? cause);
const signed = (n) => (n > 0 ? "+" : "−") + Math.abs(n).toFixed(2);

/** "riposa a 0,30 · rumore +0,44 · caldo +0,15" — the arithmetic of the bar. */
function whyLine(breakdown) {
  // nothing acting on it: the tick on the bar already says where it rests,
  // and a line repeating that is a row of noise per calm variable
  if (!breakdown || breakdown.causes.length === 0) return "";
  const parts = ['<span class="rest">riposa a ' + breakdown.baseline.toFixed(2) + "</span>"];
  for (const c of breakdown.causes) {
    parts.push(escape(causeName(c.cause)) + " <b>" + signed(c.amount) + "</b>");
  }
  // a pinned variable has causes summing past the top: say so, it is the
  // interesting case, not a rounding error
  const sum = breakdown.baseline + breakdown.causes.reduce((t, c) => t + c.amount, 0);
  if (sum > 1.001) parts.push('<span class="rest">(sarebbe ' + sum.toFixed(2) + ", è al massimo)</span>");
  return '<div class="why">' + parts.join(" · ") + "</div>";
}
`;
