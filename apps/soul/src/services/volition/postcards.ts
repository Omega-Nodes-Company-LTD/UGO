/**
 * La cartolina a voce (ADR-099) — PURA, e deliberatamente non una chiamata al
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

/**
 * ADR-109 × ADR-099: la cartolina con la foto, chiesta a voce.
 *
 * Era la seconda delle tre domande da cui è nato tutto il cantiere —
 * «scattaci una foto e mandala al gosino di nonno Sandro» — e vale la pena
 * dire perché è un gesto solo e non due: chi la pronuncia sta dando **un**
 * consenso, a scattare *e* a mandare. Spezzarlo in «scatta» e poi «manda»
 * lascerebbe in casa una foto che nessuno voleva conservare, per il tempo che
 * passa fra le due frasi.
 *
 * Due forme, perché due sono i modi in cui la gente lo dice:
 *   «scattaci una foto e mandala ai nonni»
 *   «manda una foto ai nonni: siamo al parco»
 * La seconda ha i due punti e quindi anche il testo; la prima no, e allora la
 * cartolina parte con le parole che UGO stesso mette («eccoci qui»).
 */
export interface PhotoPostcardCommand {
  kind: "foto";
  recipient: string;
  /** ciò che si scrive dietro; vuoto = la mette UGO */
  text: string;
}

const SHOOT_AND_SEND =
  /^(?:ugo[,!]?\s+)?(?:scatta|fai|fa'|facci|scattaci|fammi)\s*(?:ci)?\s+(?:una|la)\s+foto\s+e\s+manda(?:la|gliela|cela)?\s+(?:a|ai|al|alla|alle|agli)\s+(.{1,60}?)\s*[.!?]*$/iu;

const SEND_A_PHOTO =
  /^manda(?:mi|gli|le)?\s+(?:una|la)\s+foto\s+(?:a|ai|al|alla|alle|agli)\s+([^:]{1,60}?)\s*[:]\s*(.+)$/iu;

export function parsePhotoPostcard(text: string): PhotoPostcardCommand | undefined {
  const trimmed = text.trim();
  const shoot = SHOOT_AND_SEND.exec(trimmed);
  if (shoot !== null) {
    const recipient = tidy(shoot[1] ?? "");
    return recipient === "" ? undefined : { kind: "foto", recipient, text: "" };
  }
  const send = SEND_A_PHOTO.exec(trimmed);
  if (send === null) return undefined;
  const recipient = tidy(send[1] ?? "");
  const body = tidy(send[2] ?? "");
  if (recipient === "" || body === "") return undefined;
  return { kind: "foto", recipient, text: body };
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

/** Quello che si scrive dietro quando nessuno ha dettato niente. */
export const PHOTO_POSTCARD_DEFAULT_TEXT = "eccoci qui";

export function confirmPhotoPostcard(otherName: string): string {
  return `Scattata e partita per «${otherName}». Grunf!`;
}

export function tellSendFailed(): string {
  return "La cartolina non è partita: qualcosa non torna nella cassetta della posta.";
}
