/**
 * Il costo di un fornitore a pagamento non si calcola qui: lo dichiara
 * OpenRouter in ogni risposta (ADR-125 §5), e il ledger scrive quello. Qui
 * resta solo la forma del conteggio e il listino nominale della voce di casa.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * ADR-095: anche la voce di casa paga. Non il provider — la corrente e il
 * ferro: un listino NOMINALE, abbastanza perché il metabolismo (ADR-072)
 * abbia qualcosa da mangiare, non abbastanza da somigliare a una bolletta.
 * Vale per qualunque modello servito da Ollama: il nome del modello locale è
 * libero, e un listino per nome qui sarebbe sempre incompleto.
 */
export const LOCAL_INPUT_PER_MTOK = 0.01;
export const LOCAL_OUTPUT_PER_MTOK = 0.05;

export function computeLocalCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * LOCAL_INPUT_PER_MTOK + tokensOut * LOCAL_OUTPUT_PER_MTOK) * 1e-6;
}
