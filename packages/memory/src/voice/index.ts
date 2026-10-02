export { OpenAiSpeech, OpenAiTranscribe, type OpenAiVoiceOptions } from "./openai.js";
export { ElevenLabsSpeech, ElevenLabsTranscribe, type ElevenLabsOptions } from "./elevenlabs.js";
export { OpenRouterSpeech, OpenRouterTranscribe, sseEvents, type OpenRouterVoiceOptions } from "./openrouter.js";
export { gatedSpeech, gatedTranscript, type HeardOutcome, type VoiceGateOptions } from "./gate.js";
export { VOICE_MODELS, voicesFor, type VoiceModel, type VoiceOption, type VoiceRole } from "./catalog.js";
export { speechCostUsd, transcribeCostUsd } from "./pricing.js";
export { pcm16ToWav, wavSeconds } from "./wav.js";
export type { Speech, SpeechAdapter, TranscribeAdapter, Transcript, VoiceProvider } from "./types.js";
