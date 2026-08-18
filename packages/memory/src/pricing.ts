/**
 * Reference prices per MTok (PROGETTO §6 — "verificare a runtime sul listino
 * ufficiale": update here on any provider price change; the ledger is the
 * source of truth for what was actually spent).
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** cache read ≈ 10% of input price */
  cacheReadMultiplier: number;
  /** cache write ≈ 125% of input price */
  cacheWriteMultiplier: number;
}

const PRICING: Readonly<Record<string, ModelPricing>> = {
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export function pricingFor(model: string): ModelPricing {
  const pricing = PRICING[model];
  if (pricing === undefined) {
    // fail fast: an unpriced model would corrupt the piggy bank silently
    throw new Error(`no pricing configured for model "${model}"`);
  }
  return pricing;
}

export function computeCostUsd(model: string, usage: TokenUsage): number {
  const p = pricingFor(model);
  const perTok = 1e-6;
  return (
    usage.inputTokens * p.inputPerMTok * perTok +
    usage.cacheCreationInputTokens * p.inputPerMTok * p.cacheWriteMultiplier * perTok +
    usage.cacheReadInputTokens * p.inputPerMTok * p.cacheReadMultiplier * perTok +
    usage.outputTokens * p.outputPerMTok * perTok
  );
}

/**
 * ADR-095: anche la voce di casa paga. Non il provider — la corrente e il
 * ferro: un listino NOMINALE (~1% di haiku), abbastanza perché il metabolismo
 * (ADR-072) abbia qualcosa da mangiare, non abbastanza da somigliare a una
 * bolletta. Vale per qualunque modello servito da Ollama: il nome del modello
 * locale è libero, e un listino per nome qui sarebbe sempre incompleto.
 */
export const LOCAL_INPUT_PER_MTOK = 0.01;
export const LOCAL_OUTPUT_PER_MTOK = 0.05;

export function computeLocalCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * LOCAL_INPUT_PER_MTOK + tokensOut * LOCAL_OUTPUT_PER_MTOK) * 1e-6;
}
