import { z } from "zod";

/** empty string = not configured (compose passes empty defaults through) */
const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/** Environment contract for soul-api (Fasi 0-4). Boot fails fast if unmet. */
export const soulEnvSchema = z.object({
  DATABASE_URL: z.url(),
  // MQTT exists for the Nano 33 IoT firmware only (PROGETTO §5.7). With the
  // firmware set aside, a deployment has no broker and must not be forced to
  // invent one: leave these unset and the check reports "off", not "error".
  MQTT_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  MQTT_USER: optionalNonEmpty,
  MQTT_PASS: optionalNonEmpty,
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
  // Both spellings are accepted. The AWS-conventional names are what every
  // provider's console shows you (Hetzner included) and what the SDK docs
  // use, so insisting on our shorter ones only bought a confusing boot error.
  S3_ACCESS_KEY: optionalNonEmpty,
  S3_ACCESS_KEY_ID: optionalNonEmpty,
  S3_SECRET_KEY: optionalNonEmpty,
  S3_SECRET_ACCESS_KEY: optionalNonEmpty,
  S3_BUCKET_AUDIO: optionalNonEmpty,
  /** provider region; Hetzner needs its own (e.g. fsn1), AWS-alikes tolerate us-east-1 */
  S3_REGION: z.string().min(1).default("us-east-1"),
  // Fase 5 — meetings: the feature activates only when both are set
  VEXA_API_URL: optionalNonEmpty,
  VEXA_API_KEY: optionalNonEmpty,
  UGO_OWNER_NAME: z.string().min(1).default("casa"),
  // Bearer token for destructive/expensive routes (see routes/guard.ts).
  // Mandatory in production: an unguarded erasure endpoint is not a risk
  // worth carrying just because the tailnet is usually enough.
  UGO_INTERNAL_TOKEN: optionalNonEmpty,
  // optional HTTP trigger of the jobs runner, for POST /v1/jobs/dream
  UGO_JOBS_TRIGGER_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  // ADR-016: the Umwelt map is configuration. Malformed JSON must fail the
  // boot, not silently make UGO treat a reptile like a human.
  UGO_SPECIES_MAP: optionalNonEmpty,
  // Set to "false" only when something else owns the schema (a second
  // exemplar, or a release step that runs migrations before the rollout).
  UGO_AUTO_MIGRATE: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["true", "false"]).default("true"))
    .transform((value) => value === "true"),
  NODE_ENV: z.string().default("development"),
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;

export function assertProductionSecrets(env: SoulEnv): void {
  if (env.NODE_ENV === "production" && env.UGO_INTERNAL_TOKEN === undefined) {
    throw new Error(
      "UGO_INTERNAL_TOKEN is required when NODE_ENV=production: refusing to expose " +
        "erasure, export, meeting and upload routes without authentication",
    );
  }
}

export interface AudioStorageEnv {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** provider region: Hetzner rejects a wrong one, AWS-alikes ignore it */
  region: string;
}

/** All-or-nothing S3 group: a partial configuration is a config error. */
export function audioStorageFromEnv(env: SoulEnv): AudioStorageEnv | undefined {
  const accessKey = env.S3_ACCESS_KEY ?? env.S3_ACCESS_KEY_ID;
  const secretKey = env.S3_SECRET_KEY ?? env.S3_SECRET_ACCESS_KEY;
  const required = {
    S3_ENDPOINT: env.S3_ENDPOINT,
    "S3_ACCESS_KEY (o S3_ACCESS_KEY_ID)": accessKey,
    "S3_SECRET_KEY (o S3_SECRET_ACCESS_KEY)": secretKey,
    S3_BUCKET_AUDIO: env.S3_BUCKET_AUDIO,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  // nothing configured at all is a valid choice: audio upload simply stays off
  if (missing.length === Object.keys(required).length) return undefined;
  if (missing.length > 0) {
    // name the variables, never their values (CLAUDE.md rule 6)
    throw new Error(
      `configurazione S3 incompleta: mancano ${missing.join(", ")}. ` +
        "Impostale tutte, oppure nessuna per disattivare l'upload audio.",
    );
  }
  return {
    endpoint: env.S3_ENDPOINT ?? "",
    accessKey: accessKey ?? "",
    secretKey: secretKey ?? "",
    bucket: env.S3_BUCKET_AUDIO ?? "",
    region: env.S3_REGION,
  };
}
