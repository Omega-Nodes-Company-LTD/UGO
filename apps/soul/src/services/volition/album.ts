/**
 * I gesti dell'album (ADR-109) — PURI, come tutta la famiglia: «scatta una
 * foto» è un atto, «fammi vedere quelli del parco» è una domanda alla casa,
 * e nessuno dei due deve costare un token.
 *
 * Fallisce chiuso, e qui più che altrove: una foto scattata per sbaglio è
 * una foto che qualcuno non voleva.
 */

export interface ShotCommand {
  kind: "shot";
}

export interface ShowCommand {
  kind: "show";
  /** le parole da cercare nella didascalia; vuoto = «le ultime» */
  words: string;
  /** quante mostrarne: «un paio» sono due, «qualche» tre, altrimenti il default */
  count: number;
  /** stamattina / ieri / oggi, se la frase lo dice */
  when?: "stamattina" | "ieri" | "oggi" | undefined;
}

export const SHOW_DEFAULT = 4;

/** «scatta una foto», «facci una foto», «scattaci una foto». */
export function parseShot(text: string): ShotCommand | undefined {
  const shaped =
    /^(?:ugo[,!]?\s+)?(?:scatta|fai|fa'|facci|scattaci|fammi)\s*(?:ci)?\s+(?:una|la)\s+foto\s*[.!?]*$/iu;
  return shaped.test(text.trim()) ? { kind: "shot" } : undefined;
}

const HOW_MANY: Readonly<Record<string, number>> = {
  "un paio di": 2,
  due: 2,
  qualche: 3,
  tre: 3,
  "un po' di": 3,
};

/**
 * «fammi vedere un paio di scatti del parco», «mostrami le foto di stamattina».
 *
 * Il verbo apre la frase come in ogni gesto; quello che segue è una quantità
 * facoltativa, la parola «foto/scatti», e — se c'è — di che cosa. Senza
 * «foto» non è questo gesto: «fammi vedere» da solo può voler dire troppe
 * cose, e indovinare vorrebbe dire accendere l'album per una frase qualunque.
 */
export function parseShow(text: string): ShowCommand | undefined {
  const shaped =
    /^(?:ugo[,!]?\s+)?(?:fammi\s+vedere|mostrami|fammi\s+rivedere|riguardiamo)\s+(.*?)\s*[.!?]*$/iu;
  const match = shaped.exec(text.trim());
  if (match === null) return undefined;
  let rest = (match[1] ?? "").trim().toLowerCase();
  if (rest === "") return undefined;

  let count = SHOW_DEFAULT;
  for (const [words, howMany] of Object.entries(HOW_MANY)) {
    if (rest.startsWith(`${words} `)) {
      count = howMany;
      rest = rest.slice(words.length).trim();
      break;
    }
  }
  rest = rest.replace(/^(?:le|i|gli|la|il|dei|delle|degli)\s+/u, "").trim();
  const noun = /^(?:foto|fotografie|scatti|immagini)\b/u.exec(rest);
  if (noun === null) return undefined;
  rest = rest.slice(noun[0].length).trim();

  // la preposizione se ne va col tempo che introduce: «del parco di
  // stamattina» senza di lei lascerebbe «parco di», che non è una parola
  const when = /(?:\s*\b(?:di|del|dello|della|da|dal)\b)?\s*\b(stamattina|stamane|ieri|oggi)\b/u.exec(
    rest,
  );
  if (when !== null) rest = rest.replace(when[0], " ").trim();
  const words = rest
    .replace(/^(?:di|del|della|dello|dei|degli|delle|che|dal|da)\s+/u, "")
    .replace(/^(?:abbiamo\s+\w+\s*)/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  const moment = when?.[1];
  return {
    kind: "show",
    words,
    count,
    ...(moment !== undefined && {
      when: moment === "stamane" ? "stamattina" : (moment as "stamattina" | "ieri" | "oggi"),
    }),
  };
}

/**
 * La finestra di tempo che una parola come «stamattina» disegna, nel fuso
 * della casa. Pura: l'ora la porta chi chiama, come ogni cosa che riguarda
 * l'orologio in questo progetto.
 */
export function windowFor(
  when: ShowCommand["when"],
  now: Date,
): { since?: Date; until?: Date } {
  if (when === undefined) return {};
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (when === "oggi") return { since: startOfToday };
  if (when === "stamattina") {
    const noon = new Date(startOfToday);
    noon.setHours(13, 0, 0, 0);
    return { since: startOfToday, until: noon };
  }
  const yesterday = new Date(startOfToday.getTime() - 24 * 3600_000);
  return { since: yesterday, until: startOfToday };
}
