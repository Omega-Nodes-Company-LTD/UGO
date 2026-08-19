import type { FastifyInstance } from "fastify";
import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";
import mqtt from "mqtt";
import { z } from "zod";

const CHECK_TIMEOUT_MS = 500;

/** "off" = deliberately not configured, which is not a failure. */
const checkResult = z.enum(["ok", "error", "off"]);
type CheckResult = z.infer<typeof checkResult>;

// Response is validated on the way out too (Zod at every boundary) and by
// construction carries no connection details, credentials or PII.
const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable"]),
  checks: z.object({
    db: checkResult,
    mqtt: checkResult,
    ollama: checkResult,
    /**
     * ADR-101: la percezione. Da lei dipendono volto e voce — cioè metà di
     * quello che rende UGO un compagno e non una chat — e `/health` non la
     * guardava: un container di percezione morto era un riconoscimento che
     * smetteva di funzionare senza che niente diventasse rosso.
     */
    perception: checkResult,
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export interface HealthDeps {
  db: DbClient;
  mqtt: { url?: string | undefined; username?: string | undefined; password?: string | undefined };
  ollamaUrl: string;
  /** ADR-101: il servizio di percezione; assente = "off", come il broker */
  perceptionUrl?: string | undefined;
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
  if (target.url === undefined) return "off";
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

/**
 * Il servizio di percezione risponde? Stessa forma del controllo di Ollama:
 * una GET con timeout corto, e "off" quando non è configurato — perché una
 * casa senza riconoscimento è una scelta, non un guasto.
 */
async function checkPerception(baseUrl: string | undefined): Promise<CheckResult> {
  if (baseUrl === undefined) return "off";
  try {
    const response = await fetch(new URL("/health", baseUrl), {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** Liveness + readiness (PROGETTO §5.7): db is vital, mqtt/ollama/percezione degradano. */
export function registerHealthRoute(app: FastifyInstance, deps: HealthDeps): void {
  app.get("/health", async (_request, reply) => {
    const [db, broker, ollama, perception] = await Promise.all([
      checkDb(deps.db),
      checkMqtt(deps.mqtt),
      checkOllama(deps.ollamaUrl),
      checkPerception(deps.perceptionUrl),
    ]);
    const checks = { db, mqtt: broker, ollama, perception };
    const off = (result: CheckResult): boolean => result === "ok" || result === "off";
    const status: HealthResponse["status"] =
      db === "error"
        ? "unavailable"
        : off(broker) && ollama === "ok" && off(perception)
          ? "ok"
          : "degraded";
    const body = healthResponseSchema.parse({ status, checks });
    return reply.code(status === "unavailable" ? 503 : 200).send(body);
  });
}
