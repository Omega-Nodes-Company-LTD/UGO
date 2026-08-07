import type { FastifyInstance } from "fastify";
import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";
import mqtt from "mqtt";
import { z } from "zod";

const CHECK_TIMEOUT_MS = 500;

const checkResult = z.enum(["ok", "error"]);
type CheckResult = z.infer<typeof checkResult>;

// Response is validated on the way out too (Zod at every boundary) and by
// construction carries no connection details, credentials or PII.
const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable"]),
  checks: z.object({ db: checkResult, mqtt: checkResult, ollama: checkResult }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export interface HealthDeps {
  db: DbClient;
  mqtt: { url: string; username?: string; password?: string };
  ollamaUrl: string;
}

async function checkDb(db: DbClient): Promise<CheckResult> {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("db check timeout"));
        }, CHECK_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkMqtt(target: HealthDeps["mqtt"]): Promise<CheckResult> {
  try {
    const client = await mqtt.connectAsync(target.url, {
      ...(target.username !== undefined && { username: target.username }),
      ...(target.password !== undefined && { password: target.password }),
      connectTimeout: CHECK_TIMEOUT_MS,
      reconnectPeriod: 0,
    });
    await client.endAsync();
    return "ok";
  } catch {
    return "error";
  }
}

async function checkOllama(baseUrl: string): Promise<CheckResult> {
  try {
    const response = await fetch(new URL("/api/version", baseUrl), {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** Liveness + readiness (PROGETTO §5.7): db is vital, mqtt/ollama degrade. */
export function registerHealthRoute(app: FastifyInstance, deps: HealthDeps): void {
  app.get("/health", async (_request, reply) => {
    const [db, broker, ollama] = await Promise.all([
      checkDb(deps.db),
      checkMqtt(deps.mqtt),
      checkOllama(deps.ollamaUrl),
    ]);
    const checks = { db, mqtt: broker, ollama };
    const status: HealthResponse["status"] =
      db === "error" ? "unavailable" : broker === "ok" && ollama === "ok" ? "ok" : "degraded";
    const body = healthResponseSchema.parse({ status, checks });
    return reply.code(status === "unavailable" ? 503 : 200).send(body);
  });
}
