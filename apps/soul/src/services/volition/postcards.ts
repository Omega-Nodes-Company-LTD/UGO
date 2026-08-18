/**
 * La cartolina a voce (ADR-092) — PURA, e deliberatamente non una chiamata al
 * modello: «manda ai nonni: siamo stati al parco» è un atto, non una
 * conversazione, e l'atto esplicito è l'UNICA strada da cui una cartolina
 * può partire.
 *
 * La forma è chiusa come «cerca: …» (ADR-063): il verbo apre la frase, il
 * destinatario sta fra il verbo e i due punti, il testo dopo. Tutto il resto
 * torna `undefined` e la frase prosegue: una cartolina spedita per sbaglio a
 * un'altra famiglia è peggio di un gesto non capito.
 */

export interface PostcardCommand {
  kind: "messaggio" | "ricordo";
  /** come l'ha detto chi parla: «i nonni», «nonno Sandro», uno slug */
  recipient: string;
  text: string;
}

/**
 * `manda [un ricordo] a|ai|al|alla|alle|agli DEST : TESTO`
 *
 * I due punti (o la virgola) sono obbligatori e non è pignoleria: senza un
 * confine dichiarato, «manda a monte il piano» diventerebbe una cartolina per
 * la casa «monte il piano». Il confine è ciò che rende il gesto un gesto.
 */
const SHAPE =
  /^manda(?:mi|gli|le)?\s+(un ricordo\s+)?(?:a|ai|al|alla|alle|agli)\s+([^:]{1,60}?)\s*[:]\s*(.+)$/iu;

const tidy = (raw: string): string =>
  raw
    .replace(/[.,;!?]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

export function parsePostcard(text: string): PostcardCommand | undefined {
  const match = SHAPE.exec(text.trim());
  if (match === null) return undefined;
  const recipient = tidy(match[2] ?? "");
  const body = tidy(match[3] ?? "");
  if (recipient === "" || body === "") return undefined;
  return {
    kind: match[1] === undefined ? "messaggio" : "ricordo",
    recipient,
    text: body,
  };
}

/** Gli esiti sono distinti e si dicono (la lezione di ADR-065). */
export function confirmPostcard(command: PostcardCommand, otherName: string): string {
  return command.kind === "ricordo"
    ? `Fatto: il ricordo è partito per «${otherName}». Grunf!`
    : `Fatto: la cartolina è partita per «${otherName}». Grunf!`;
}

export function tellNoTie(recipient: string): string {
  return (
    `Non ho una parentela con «${recipient}»: le case si legano dal pannello, ` +
    `con il sì di tutte e due. Finché non c'è, da me non parte niente.`
  );
}

export function tellTieNotAccepted(recipient: string): string {
  return (
    `La parentela con «${recipient}» è ancora una proposta: finché l'altra casa ` +
    `non dice sì, non parte niente.`
  );
}

export function tellSendFailed(): string {
  return "La cartolina non è partita: qualcosa non torna nella cassetta della posta.";
}
