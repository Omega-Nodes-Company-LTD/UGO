import { createDbClient } from "@ugo/db";
import { EnvValidationError, parseEnv } from "@ugo/shared";
import { soulEnvSchema } from "./config/env.js";
import { buildServer } from "./server.js";

let env;
try {
  env = parseEnv(soulEnvSchema);
} catch (error) {
  // Fail fast with variable NAMES only — never values (they may be secrets).
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
}

const db = createDbClient(env.DATABASE_URL);
const app = buildServer({
  db,
  mqtt: { url: env.MQTT_URL, username: env.MQTT_USER, password: env.MQTT_PASS },
  ollamaUrl: env.OLLAMA_URL,
});

const shutdown = (signal: NodeJS.Signals): void => {
  app.log.info({ signal }, "shutting down");
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
