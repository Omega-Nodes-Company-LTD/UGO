/**
 * Un testo breve da un prompt solo (ADR-131): il lavoro che prima faceva il
 * modello di casa su Ollama — il giudice dell'astensione, la ruminazione, la
 * storia della buonanotte, il consiglio — ora passa da OpenRouter.
 *
 * Funzione pura, come `chatCompletionBody`: stesse regole sui fornitori
 * (ADR-125 §3) e ragionamento spento, perché un testo breve non può spendere
 * il suo tetto a pensare e poi tacere (la misura di ADR-125).
 */

export interface TextCompletionBody {
  model: string;
  max_tokens: number;
  temperature: number;
  messages: { role: "user"; content: string }[];
  reasoning: { enabled: false };
  provider: {
    order: string[];
    only: string[];
    allow_fallbacks: true;
    zdr: true;
    data_collection: "deny";
  };
  usage: { include: true };
}

export function textCompletionBody(
  model: string,
  providers: readonly string[],
  prompt: string,
  maxTokens: number,
  temperature: number,
): TextCompletionBody {
  return {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
    reasoning: { enabled: false },
    provider: {
      order: [...providers],
      only: [...providers],
      allow_fallbacks: true,
      zdr: true,
      data_collection: "deny",
    },
    usage: { include: true },
  };
}
