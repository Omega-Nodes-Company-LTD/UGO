/** Closed domains shared across the system (PROGETTO §5.2, §5.7). */

export const EVENT_SOURCES = ["face", "nano", "ear", "meet", "system"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const MESSAGE_CHANNELS = ["home", "meeting", "api"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MEMORY_KINDS = ["fact", "preference", "episode", "insight"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const DESIRE_STATUSES = ["pending", "done", "expired"] as const;
export type DesireStatus = (typeof DESIRE_STATUSES)[number];

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
