export { OllamaEmbeddingsClient, type EmbeddingsClient } from "./embeddings.js";
export { OllamaTextClient, type LocalTextClient } from "./localText.js";
export { ChatChain, type ChatChainOptions } from "./chatChain.js";
export { OllamaVisionClient, type LocalVisionClient } from "./localVision.js";
export {
  OpenRouterTtsClient,
  DEFAULT_TTS_MODEL,
  FALLBACK_USD_PER_CHAR,
  type LocalTtsClient,
  type TtsRequest,
  type TtsSpender,
} from "./ttsClient.js";
export { audioTagFor, taggedText } from "./voiceTags.js";
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
export { type TokenUsage } from "./pricing.js";
export {
  chatCompletionBody,
  chatMessages,
  cachedPrefix,
  DEFAULT_CHAT_MODEL,
  DEFAULT_PROVIDERS,
  OPENROUTER_URL,
  type ChatChannel,
  type ChatMessage,
} from "./chatRequest.js";
export {
  LlmClient,
  DEGRADED_REPLY,
  HUNGRY_REPLY,
  type LlmClientOptions,
  type LlmChatRequest,
  type ChatLlm,
  type LlmChatResult,
  type LlmHistoryTurn,
} from "./llmClient.js";
