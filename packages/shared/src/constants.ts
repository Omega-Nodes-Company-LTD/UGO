/** Closed domains shared across the system (PROGETTO §5.2, §5.7). */

export const EVENT_SOURCES = ["face", "nano", "ear", "meet", "system"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const MESSAGE_CHANNELS = ["home", "meeting", "api"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MEMORY_KINDS = ["fact", "preference", "episode", "insight"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const DESIRE_STATUSES = ["pending", "done", "expired"] as const;
export type DesireStatus = (typeof DESIRE_STATUSES)[number];

/** The pack (ADR-014). `species` is deliberately NOT a closed domain: adding
 * one must not require a migration. These are the ones we ship a profile for. */
export const KNOWN_SPECIES = ["human", "dog", "parrot", "reptile", "unknown"] as const;

export const BEING_KINDS = ["resident", "visitor", "unknown"] as const;
export type BeingKind = (typeof BEING_KINDS)[number];

export const RELATION_TYPES = ["parent_of", "partner_of", "cares_for", "avoids"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Symmetric relations are stored once, normalized on being_a < being_b. */
export const SYMMETRIC_RELATION_TYPES = ["partner_of"] as const;

/** Perception channels (ADR-016). Open-ended for the same reason as species. */
export const MODALITIES = [
  "audio_speech",
  "audio_nonspeech",
  "vision",
  "ambient",
  "manual",
] as const;
export type Modality = (typeof MODALITIES)[number];

/** How a being can be recognized. `manual` = declared by a trusted human. */
export const RECOGNITION_MODALITIES = ["voice", "face", "visual", "tag", "manual"] as const;
export type RecognitionModality = (typeof RECOGNITION_MODALITIES)[number];

/** How the pack corrects UGO. `wrong_name` is the most important signal. */
export const CORRECTION_SIGNALS = ["too_loud", "leave_alone", "good", "wrong_name"] as const;
export type CorrectionSignal = (typeof CORRECTION_SIGNALS)[number];

/** Embedding dimensions are fixed by the embedding model (nomic-embed-text). */
export const EMBEDDING_DIMENSIONS = 768;

/** MQTT topic contract with the Nano 33 IoT firmware (PROGETTO §5.7). */
export const MQTT_TOPICS = {
  /** Nano → soul: `{"t":24.6,"rh":58.2}` every 30 s */
  env: "ugo/env",
  /** Nano LWT: `offline` */
  status: "ugo/status",
  /** soul → Nano: one line of text/emoji-code */
  oled: "ugo/oled",
  /** soul → Nano: `on|off` */
  relaySet: (relay: number): string => `ugo/relay/${String(relay)}/set`,
  /** Nano → soul: ack of the relay state */
  relayState: (relay: number): string => `ugo/relay/${String(relay)}/state`,
} as const;
