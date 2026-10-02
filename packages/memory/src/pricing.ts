/**
 * Il listino e il conto (ADR-122).
 *
 * Due regole, e la seconda è quella che prima mancava:
 *
 * 1. dove il provider dice quanto è costato (OpenRouter, `usage.cost`), vale
 *    il provider; dove c'è un prezzo fotografato alla scelta del modello,
 *    vale quello; altrimenti il nostro listino;
 * 2. **il conto non lancia mai.** Si calcola DOPO una chiamata già pagata:
 *    un'eccezione qui vuol dire spesa senza riga, cioè un tetto che smette di
 *    limitare in silenzio. Un modello ignoto si prezza con la fascia più cara
 *    che conosciamo, e la riga lo dichiara (`fallback`).
 *
 * Prezzi Anthropic in USD per milione di token (listino 2026-09-25; il ledger
 * resta la fonte di verità di ciò che è stato speso davvero).
 */

/**
 * Come un modello Anthropic vuole essere chiesto di NON pensare a lungo.
 *
 * I modelli recenti pensano per default (thinking adattivo) e alcuni non si
 * possono spegnere: una risposta da due frasi con `max_tokens: 200` finirebbe
 * tutta in pensiero e tornerebbe vuota.
 * - `omit`: niente parametro, il modello non pensa (Haiku 4.5, 4.6, 4.7, 4.8);
 * - `disabled`: va spento esplicitamente (Opus 5, Sonnet 5);
 * - `between_tools`: Sonnet 5.5, dove `disabled` è un 400;
 * - `always`: non si spegne (Opus 5.5, Fable): si abbassa lo sforzo e si
 *   allarga il tetto d'uscita.
 */
export type ThinkingMode = "omit" | "disabled" | "between_tools" | "always";

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadMultiplier: number;
  /** scrittura in cache con TTL di 5 minuti */
  cacheWriteMultiplier: number;
}

export interface AnthropicModel extends ModelPricing {
  label: string;
  thinking: ThinkingMode;
  /** `temperature` è accettata (sui modelli recenti è un 400) */
  sampling: boolean;
  vision: boolean;
}

const ANTHROPIC: Readonly<Record<string, AnthropicModel>> = {
  "claude-haiku-4-5": {
    label: "Claude Haiku 4.5",
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "omit",
    sampling: true,
    vision: true,
  },
  "claude-sonnet-4-6": {
    label: "Claude Sonnet 4.6",
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "omit",
    sampling: true,
    vision: true,
  },
  "claude-sonnet-5": {
    label: "Claude Sonnet 5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "disabled",
    sampling: false,
    vision: true,
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "between_tools",
    sampling: false,
    vision: true,
  },
  "claude-opus-4-8": {
    label: "Claude Opus 4.8",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "omit",
    sampling: false,
    vision: true,
  },
  "claude-opus-5": {
    label: "Claude Opus 5",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    thinking: "disabled",
    sampling: false,
    vision: true,
  },
  "claude-opus-5-5": {
    label: "Claude Opus 5.5",
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadMultiplier: 0.05,
    cacheWriteMultiplier: 1.25,
    thinking: "always",
    sampling: false,
    vision: true,
  },
  "claude-fable-5-1": {
    label: "Claude Fable 5.1",
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheReadMultiplier: 0.025,
    cacheWriteMultiplier: 1.25,
    thinking: "always",
    sampling: false,
    vision: true,
  },
};

/** La fascia più cara nota: il prezzo di un modello che non conosciamo. */
const MOST_EXPENSIVE: ModelPricing = Object.values(ANTHROPIC).reduce((worst, m) =>
  m.outputPerMTok > worst.outputPerMTok ? m : worst,
);

export function anthropicModel(model: string): AnthropicModel | undefined {
  return ANTHROPIC[model];
}

export function anthropicModelIds(): string[] {
  return Object.keys(ANTHROPIC);
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export type CostSource = "provider" | "snapshot" | "list" | "fallback";

export interface Cost {
  usd: number;
  source: CostSource;
}

/** Il prezzo fotografato su `model_choices` alla scelta (ADR-122). */
export interface PriceSnapshot {
  inputPerMTok: number;
  outputPerMTok: number;
}

function priced(p: ModelPricing, usage: TokenUsage): number {
  const perTok = 1e-6;
  return (
    usage.inputTokens * p.inputPerMTok * perTok +
    usage.cacheCreationInputTokens * p.inputPerMTok * p.cacheWriteMultiplier * perTok +
    usage.cacheReadInputTokens * p.inputPerMTok * p.cacheReadMultiplier * perTok +
    usage.outputTokens * p.outputPerMTok * perTok
  );
}

/**
 * Il conto di una chiamata. Non lancia: qualunque cosa succeda, la chiamata
 * pagata ha un numero e una provenienza.
 */
export function computeCost(
  model: string,
  usage: TokenUsage,
  hints: { providerUsd?: number; snapshot?: PriceSnapshot } = {},
): Cost {
  if (hints.providerUsd !== undefined && Number.isFinite(hints.providerUsd)) {
    return { usd: Math.max(0, hints.providerUsd), source: "provider" };
  }
  // il nostro listino Anthropic conosce le moltiplicazioni della cache, che la
  // fotografia non porta: dove c'è, vince
  const listed = ANTHROPIC[model];
  if (listed !== undefined) return { usd: priced(listed, usage), source: "list" };
  if (hints.snapshot !== undefined) {
    return {
      usd: priced(
        { ...hints.snapshot, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25 },
        usage,
      ),
      source: "snapshot",
    };
  }
  return { usd: priced(MOST_EXPENSIVE, usage), source: "fallback" };
}

/** Compatibilità di firma per chi vuole solo il numero (test, rapporti). */
export function computeCostUsd(model: string, usage: TokenUsage): number {
  return computeCost(model, usage).usd;
}
