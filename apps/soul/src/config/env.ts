import { z } from "zod";

/** Fase 0+1 environment contract for soul-api. Boot fails fast if unmet. */
export const soulEnvSchema = z.object({
  DATABASE_URL: z.url(),
  MQTT_URL: z.url(),
  MQTT_USER: z.string().min(1),
  MQTT_PASS: z.string().min(1),
  OLLAMA_URL: z.url(),
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
  ANTHROPIC_API_KEY: z.string().min(1),
  /** override for network-level test stubs; defaults to the official API */
  ANTHROPIC_BASE_URL: z.url().optional(),
  UGO_CHAT_MODEL: z.string().min(1).default("claude-haiku-4-5"),
  UGO_DAILY_BUDGET_USD: z.coerce.number().positive().default(0.5),
  /** 32 bytes base64 — AES-256-GCM key for at-rest message encryption */
  UGO_DATA_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().min(1).default("Europe/Rome"),
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;
