import { createDbClient } from "@ugo/db";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { EnvValidationError, parseDataKey, parseEnv } from "@ugo/shared";
import { soulEnvSchema } from "./config/env.js";
import { ChatService } from "./services/chatService.js";
import { FaceGateway } from "./services/faceGateway.js";
import { PsycheService } from "./services/psycheService.js";
import { buildServer } from "./server.js";

const SNAPSHOT_INTERVAL_MS = 15 * 60_000; // §5.3: periodic snapshot

let env;
try {
  env = parseEnv(soulEnvSchema);
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

const app = buildServer({
  db,
  mqtt: { url: env.MQTT_URL, username: env.MQTT_USER, password: env.MQTT_PASS },
  ollamaUrl: env.OLLAMA_URL,
  features: { chat, psyche, face },
});

const snapshotTimer = setInterval(() => {
  psyche.snapshot().catch((error: unknown) => {
    app.log.error(error, "periodic psyche snapshot failed");
  });
}, SNAPSHOT_INTERVAL_MS);
snapshotTimer.unref();

const shutdown = (signal: NodeJS.Signals): void => {
  app.log.info({ signal }, "shutting down");
  clearInterval(snapshotTimer);
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
