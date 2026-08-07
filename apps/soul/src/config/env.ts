import { z } from "zod";

/** empty string = not configured (compose passes empty defaults through) */
const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/** Environment contract for soul-api (Fasi 0-4). Boot fails fast if unmet. */
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
  // Fase 4 — audio uploads: the feature activates only when all four are set
  S3_ENDPOINT: optionalNonEmpty,
  S3_ACCESS_KEY: optionalNonEmpty,
  S3_SECRET_KEY: optionalNonEmpty,
  S3_BUCKET_AUDIO: optionalNonEmpty,
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;

export interface AudioStorageEnv {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

/** All-or-nothing S3 group: a partial configuration is a config error. */
export function audioStorageFromEnv(env: SoulEnv): AudioStorageEnv | undefined {
  const values = [env.S3_ENDPOINT, env.S3_ACCESS_KEY, env.S3_SECRET_KEY, env.S3_BUCKET_AUDIO];
  const set = values.filter((value) => value !== undefined).length;
  if (set === 0) return undefined;
  if (set !== values.length) {
    throw new Error(
      "partial S3 configuration: set all of S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_AUDIO or none",
    );
  }
  return {
    endpoint: env.S3_ENDPOINT ?? "",
    accessKey: env.S3_ACCESS_KEY ?? "",
    secretKey: env.S3_SECRET_KEY ?? "",
    bucket: env.S3_BUCKET_AUDIO ?? "",
  };
}
