export { OllamaEmbeddingsClient, type EmbeddingsClient } from "./embeddings.js";
export {
  GatedText,
  GatedVision,
  SILENT_TEXT,
  BLIND_VISION,
  imageMediaType,
  type TextLlm,
  type VisionLlm,
  type GatedOptions,
  type GenerateOptions,
} from "./text.js";
export {
  throughGate,
  type GateContext,
  type GateOutcome,
  type GateRefusal,
  type KeySource,
  type PaidCall,
} from "./gate.js";
export {
  creditBalanceMicros,
  creditDebitMicros,
  dailyBudgetUsd,
  localDate,
  piggyBankUsd,
  spentTodayUsd,
  type CreditTerms,
} from "./wallet.js";
export { AnthropicAdapter, type AnthropicAdapterOptions } from "./providers/anthropic.js";
export { OpenRouterAdapter, type OpenRouterAdapterOptions } from "./providers/openrouter.js";
export {
  ModelCatalog,
  fitsRole,
  type CatalogModel,
  type CatalogOptions,
  type TextRole,
} from "./providers/catalog.js";
export { verifyKey, type KeyVerdict, type ProviderBaseUrls } from "./providers/validate.js";
export {
  PROVIDERS,
  ProviderAuthError,
  ProviderError,
  type CompletionAdapter,
  type CompletionRequest,
  type Completion,
  type Provider,
  type TextProvider,
} from "./providers/types.js";
export { OpenAiTtsClient, type LocalTtsClient, type TtsSpender } from "./ttsClient.js";
export {
  rerank,
  recencyFactor,
  RECENCY_TAU_DAYS,
  type RerankCandidate,
  type RankedMemory,
} from "./rerank.js";
export { writeMemory, searchMemories, type WriteMemoryInput } from "./retrieval.js";
export {
  armsAgree,
  canAnswer,
  judgePrompt,
  readVerdict,
  type AnswerableVerdict,
  type CanAnswerDeps,
} from "./abstain.js";
export { asksForAVerdict } from "./reporting.js";
export { searchTranscripts, type RetrievedTranscript } from "./transcripts.js";
export { searchCustomerChunks, type RetrievedCustomerChunk } from "./customerChunks.js";
export { searchHouseChunks, type RetrievedHouseChunk } from "./houseChunks.js";
export {
  anthropicModel,
  anthropicModelIds,
  computeCost,
  computeCostUsd,
  type AnthropicModel,
  type Cost,
  type CostSource,
  type ModelPricing,
  type PriceSnapshot,
  type TokenUsage,
} from "./pricing.js";
export {
  LlmClient,
  DEGRADED_REPLY,
  HUNGRY_REPLY,
  KEYLESS_REPLY,
  INVALID_KEY_REPLY,
  CREDIT_REPLY,
  type LlmClientOptions,
  type LlmChatRequest,
  type ChatLlm,
  type LlmChatResult,
  type LlmHistoryTurn,
} from "./llmClient.js";
