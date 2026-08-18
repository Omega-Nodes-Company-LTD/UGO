/**
 * La storia della buonanotte (ADR-088).
 *
 * È l'unico gesto di questa famiglia che **non** è a costo zero, e non poteva
 * esserlo: una storia va inventata, e inventare è l'unica cosa che un parser
 * non sa fare. Ma non costa nemmeno un centesimo — la scrive il modello di
 * casa (Ollama), come le domande dell'iniziativa (ADR-027), e non passa dal
 * provider a pagamento: una storia della buonanotte chiesta ogni sera
 * consumerebbe il budget di una famiglia in un mese.
 *
 * La parte pura è qui: riconoscere la richiesta, costruire il prompt, e le
 * parole per quando il modello di casa non risponde. Il resto è una chiamata.
 */

export interface StoryAsk {
  /** «sul mare», «su un drago gentile». `undefined` = come gli viene. */
  about: string | undefined;
}

/** Deve chiedere di RACCONTARE. Senza, è una frase che parla di storie. */
const TELLS = /(?<![\p{L}])(raccontami|racconti|raccontarmi|inventami|inventa)(?![\p{L}])/u;

/** E deve chiedere una storia, non un fatto. */
const A_STORY = /(?<![\p{L}])(stori[ae]|favol[ae]|fiab[ae])(?![\p{L}])/u;

/**
 * Le parole che dicono «ricordare», non «inventare». Se ci sono, questo parser
 * si tira indietro: «raccontami la storia di quando è arrivato il corriere»
 * chiede una cosa che è successa, e inventarla sarebbe la bugia peggiore che
 * una creatura con la memoria possa dire.
 */
const REMEMBERING =
  /(?<![\p{L}])(ieri|oggi|stanotte|diario|giornata|giornate|quando|com['’]?è andata|cos['’]?hai fatto|ti ricordi)(?![\p{L}])/u;

const MAX_ABOUT = 60;

export function parseStoryAsk(text: string): StoryAsk | undefined {
  const lower = text.toLowerCase().trim();
  if (!TELLS.test(lower) || !A_STORY.test(lower)) return undefined;
  if (REMEMBERING.test(lower)) return undefined;

  // «su un drago gentile», «sul mare», «sulla neve»
  const about = /(?<![\p{L}])s(?:u|ul|ulla|ullo|ui|ugli|ulle|u\s+un|u\s+una)\s+(.{2,60}?)\s*[?.!]?$/u.exec(
    lower,
  );
  const raw = about?.[1]?.trim();
  if (raw === undefined || raw.length === 0 || raw.length > MAX_ABOUT) {
    return { about: undefined };
  }
  // rimette l'articolo che la preposizione articolata si era mangiata
  const article = /(?<![\p{L}])sul\s/u.test(lower)
    ? "il "
    : /(?<![\p{L}])sulla\s/u.test(lower)
      ? "la "
      : "";
  return { about: `${article}${raw}` };
}

export interface StorySeed {
  /** com'è fatto lui: la storia la racconta LUI, non un narratore qualunque */
  persona: string;
  /** una riga del suo diario, se ce n'è una: la storia parte da casa sua */
  diary?: string;
}

/**
 * Il prompt per il modello di casa.
 *
 * Tre cose scritte perché **nessuna delle tre si indovina**: la lingua (un
 * modello locale risponde volentieri in inglese), la lunghezza (una storia
 * della buonanotte che non finisce è un difetto, all'ora in cui viene
 * chiesta), e il tono. Il resto è suo.
 */
export function storyPrompt(ask: StoryAsk, seed: StorySeed): string {
  const lines = [
    "Racconta una breve storia della buonanotte in italiano.",
    `Sei ${seed.persona}: raccontala con la tua voce, in prima persona se ti viene.`,
    "Otto frasi al massimo. Deve finire, e deve finire bene: si ascolta prima di dormire.",
    "Niente violenza, niente paura, niente morale spiegata alla fine.",
  ];
  if (ask.about !== undefined) lines.push(`Deve parlare di ${ask.about}.`);
  if (seed.diary !== undefined && seed.diary.trim() !== "") {
    lines.push(
      `Se ti serve un inizio, prendilo da com'è andata oggi: ${seed.diary.slice(0, 200)}`,
    );
  }
  lines.push("Scrivi solo la storia, senza titolo e senza commenti.");
  return lines.join("\n");
}

/**
 * Quando il modello di casa non risponde. Non inventa una storia di riserva:
 * una favola precotta ripetuta ogni sera è peggio di un no, perché la seconda
 * sera si capisce che non c'era nessuno a raccontarla.
 */
export function tellNoStory(): string {
  return "Stasera la storia non mi viene: la parte di me che le inventa non risponde. Grunf.";
}
