/**
 * Le liste (ADR-076) — PURE, e deliberatamente non una chiamata al modello.
 *
 * «aggiungi il latte alla spesa» ha tre forme in una lingua sola. Riconoscerla
 * qui costa zero, risponde all'istante ed è testabile per esempi; darla a un
 * modello costerebbe un token, prenderebbe un secondo, e sbaglierebbe in modi
 * che nessuno può riprodurre.
 *
 * Fallisce CHIUSO, come i promemoria: tutto ciò che non è chiaramente una
 * lista torna `undefined` e la frase prosegue verso la conversazione normale.
 * Una lista sbagliata è peggio di una lista non capita.
 */

export type ListAction = "add" | "read" | "done";

export interface ListCommand {
  action: ListAction;
  /** «spesa», «da fare», «ferramenta»: testo libero, mai un enum */
  list: string;
  /** assente quando si chiede di leggere */
  item?: string;
}

/** Le liste che si nominano senza dire «lista»: le due che usano tutti. */
const SHORTHANDS: Readonly<Record<string, string>> = {
  spesa: "spesa",
  "cose da fare": "da fare",
  "da fare": "da fare",
  todo: "da fare",
};

const ADD_VERBS = ["aggiungi", "metti", "segna", "aggiungimi", "annota"];
const DONE_VERBS = ["togli", "toglimi", "leva", "spunta", "cancella", "ho preso", "ho comprato"];
const READ_VERBS = ["cosa c'è", "cosa ce", "che c'è", "leggimi", "leggi", "dimmi cosa c'è"];

const NOISE = /^(il|lo|la|i|gli|le|un|uno|una|dei|degli|delle|del|della|di)\s+/iu;

const tidy = (raw: string): string =>
  raw
    .replace(/[.,;!?]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

/** «alla lista della spesa» → «spesa»; «in ferramenta» → «ferramenta». */
function listName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let name = tidy(raw.toLowerCase())
    // preposizione, poi articolo, poi l'eventuale «lista di»: in quest'ordine,
    // perché «leggimi LA LISTA DELLE cose da fare» ha tutti e tre
    .replace(/^(alle|agli|allo|alla|ai|al|nella|nelle|dalla|sulla|in|a|da|su|della|delle|dei)\s+/u, "")
    .replace(/^(il|lo|la|i|gli|le|l')\s*/u, "")
    .replace(/^lista\s+(della|delle|dei|di|del)?\s*/u, "")
    .replace(/^(della|delle|dei|del|di)\s+/u, "");
  name = tidy(name);
  if (name === "") return undefined;
  return SHORTHANDS[name] ?? name;
}

const cleanItem = (raw: string): string => tidy(tidy(raw).replace(NOISE, ""));

/**
 * Riconosce il comando, o niente. L'ordine dei tentativi conta: «togli» prima
 * di «aggiungi» perché «toglimi dalla lista» contiene entrambi i sensi solo
 * per chi cerca sottostringhe invece di verbi.
 */
export function parseListCommand(text: string): ListCommand | undefined {
  const line = tidy(text);
  if (line === "") return undefined;
  const lower = line.toLowerCase();

  // leggere: «cosa c'è nella spesa?», «leggimi la lista delle cose da fare»
  for (const verb of READ_VERBS) {
    if (!lower.startsWith(verb)) continue;
    const rest = line.slice(verb.length);
    const list = listName(rest);
    if (list !== undefined) return { action: "read", list };
  }

  // spuntare: «ho preso il pane», «togli il latte dalla spesa»
  for (const verb of DONE_VERBS) {
    if (!lower.startsWith(verb)) continue;
    const rest = line.slice(verb.length);
    const split = /\s+(?:dalla|dal|da|nella|in)\s+(.+)$/iu.exec(rest);
    const item = cleanItem(split === null ? rest : rest.slice(0, split.index));
    if (item === "") continue;
    return { action: "done", list: listName(split?.[1]) ?? "spesa", item };
  }

  // aggiungere: «aggiungi il latte alla spesa», «segna le viti in ferramenta»
  for (const verb of ADD_VERBS) {
    if (!lower.startsWith(verb)) continue;
    const rest = line.slice(verb.length);
    const split = /\s+(?:alle|agli|allo|alla|ai|al|nella|nelle|in|a|su|sulla)\s+(.+)$/iu.exec(rest);
    if (split === null) continue; // senza una lista non si sa dove metterlo
    const item = cleanItem(rest.slice(0, split.index));
    const list = listName(split[1]);
    if (item === "" || list === undefined) continue;
    return { action: "add", list, item };
  }

  return undefined;
}

/** Cosa risponde, senza chiamare nessuno. */
export function confirmList(command: ListCommand, items?: readonly string[]): string {
  switch (command.action) {
    case "add":
      return `Segnato: ${command.item ?? ""} nella lista ${command.list}. Grunf.`;
    case "done":
      return `Tolto ${command.item ?? ""} da ${command.list}.`;
    case "read":
      return items === undefined || items.length === 0
        ? `La lista ${command.list} è vuota.`
        : `Nella lista ${command.list}: ${items.join(", ")}.`;
  }
}
