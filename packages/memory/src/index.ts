export { type EmbeddingsClient } from "./embeddings.js";
export { type GenerateOptions, type LocalTextClient } from "./localText.js";
export { type LocalVisionClient } from "./localVision.js";
export { OpenRouterVisionClient } from "./openRouterVision.js";
export { OpenRouterTextClient } from "./openRouterText.js";
export {
  OpenRouterEmbeddingsClient,
  DEFAULT_EMBED_MODEL,
  type OpenRouterEmbeddingsOptions,
} from "./openRouterEmbeddings.js";
export {
  OpenRouterSttClient,
  DEFAULT_STT_MODEL,
  type OpenRouterSttOptions,
  type TranscriptOutcome,
} from "./openRouterStt.js";
export { pcm16ToWav, PCM_SAMPLE_RATE } from "./wav.js";
export { readUsage, recordSpend, type RecordedSpend, type SpendRow } from "./ledger.js";
export { textCompletionBody, type TextCompletionBody } from "./textRequest.js";
export {
  DEFAULT_VISION_MODEL,
  VISION_PROMPT,
  visionCompletionBody,
  type VisionCompletionBody,
} from "./visionRequest.js";
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
