import { createDbClient } from "@ugo/db";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { EnvValidationError, parseDataKey, parseEnv } from "@ugo/shared";
import { assertProductionSecrets, audioStorageFromEnv, soulEnvSchema } from "./config/env.js";
import { ChatService } from "./services/chatService.js";
import { FaceGateway } from "./services/faceGateway.js";
import { MeetingsService } from "./services/meetingsService.js";
import { ExportService } from "./services/privacy/exportService.js";
import { ForgetService } from "./services/privacy/forgetService.js";
import { PsycheService } from "./services/psycheService.js";
import { SolitudeMonitor } from "./services/solitudeMonitor.js";
import { buildServer } from "./server.js";

const SNAPSHOT_INTERVAL_MS = 15 * 60_000; // §5.3: periodic snapshot

let env;
try {
  env = parseEnv(soulEnvSchema);
  assertProductionSecrets(env);
} catch (error) {
  // Fail fast with variable NAMES only — never values (they may be secrets).
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
}

const db = createDbClient(env.DATABASE_URL);
const psyche = await PsycheService.restore(db);
const llm = new LlmClient({
  db,
  apiKey: env.ANTHROPIC_API_KEY,
  model: env.UGO_CHAT_MODEL,
  dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD,
  ...(env.ANTHROPIC_BASE_URL !== undefined && { baseUrl: env.ANTHROPIC_BASE_URL }),
  timezone: env.TZ,
});
const chat = new ChatService({
  db,
  embedder: new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL),
  llm,
  psyche,
  dataKey: parseDataKey(env.UGO_DATA_KEY),
});

const face = new FaceGateway({
  db,
  chat,
  psyche,
  // hour in project TZ so the sleep rule follows Europe/Rome, not the host
  hourOf: (at) =>
    Number(
      new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: env.TZ }).format(
        at,
      ),
    ),
});

const audio = audioStorageFromEnv(env);
const dataKey = parseDataKey(env.UGO_DATA_KEY);
const embedder = new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL);
const privacy = {
  forget: new ForgetService({ db, dataKey, embedder }),
  exporter: new ExportService(db, dataKey),
};
const meetings =
  env.VEXA_API_URL !== undefined && env.VEXA_API_KEY !== undefined
    ? new MeetingsService({
        db,
        embedder,
        llm,
        dataKey,
        vexa: { baseUrl: env.VEXA_API_URL, apiKey: env.VEXA_API_KEY, ownerName: env.UGO_OWNER_NAME },
        psyche,
        // ADR-013 opzione b: finché Vexa open-core non espone /speak, la
        // risposta viene pronunciata in stanza dal corpo di casa
        speakPort: {
          speak: (_ref, text) => {
            face.broadcastSpeak(text);
            return Promise.resolve();
          },
        },
      })
    : undefined;

const app = buildServer({
  db,
  mqtt: { url: env.MQTT_URL, username: env.MQTT_USER, password: env.MQTT_PASS },
  ollamaUrl: env.OLLAMA_URL,
  features: {
    chat,
    psyche,
    face,
    privacy,
    stats: { dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD, timezone: env.TZ },
    ...(env.UGO_INTERNAL_TOKEN !== undefined && { internalToken: env.UGO_INTERNAL_TOKEN }),
    ...(env.UGO_JOBS_TRIGGER_URL !== undefined && { dreamTriggerUrl: env.UGO_JOBS_TRIGGER_URL }),
    ...(audio !== undefined && { audio }),
    ...(meetings !== undefined && { meetings }),
  },
});

const MEETINGS_POLL_MS = 3000;
if (meetings !== undefined) {
  const pollTimer = setInterval(() => {
    meetings.pollAll().catch((error: unknown) => {
      app.log.warn(error, "meetings polling round failed");
    });
  }, MEETINGS_POLL_MS);
  pollTimer.unref();
}

// §5.3: loneliness and neglect are perturbations no sensor can emit
const solitude = new SolitudeMonitor({ db, psyche });
const SOLITUDE_TICK_MS = 15 * 60_000;
const solitudeTimer = setInterval(() => {
  solitude.tick().catch((error: unknown) => {
    app.log.warn(error, "solitude tick failed");
  });
}, SOLITUDE_TICK_MS);
solitudeTimer.unref();

const snapshotTimer = setInterval(() => {
  psyche.snapshot().catch((error: unknown) => {
    app.log.error(error, "periodic psyche snapshot failed");
  });
}, SNAPSHOT_INTERVAL_MS);
snapshotTimer.unref();

const shutdown = (signal: NodeJS.Signals): void => {
  app.log.info({ signal }, "shutting down");
  clearInterval(snapshotTimer);
  clearInterval(solitudeTimer);
  void Promise.allSettled([app.close(), db.$client.end()]).then(() => {
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  await db.$client.end();
  process.exit(1);
}
