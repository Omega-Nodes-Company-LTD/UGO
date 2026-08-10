import { events, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";

/**
 * `POST /v1/jobs/dream` (PROGETTO §5.7): manual trigger for the night job.
 *
 * The dream lives in a separate Python container that normally wakes on a
 * schedule, so soul cannot execute it in-process. The request is always
 * journaled (an audit trail of who asked for an out-of-band dream), and is
 * forwarded to the jobs runner when one is reachable; otherwise the caller
 * is told plainly that the request is recorded and the dream will run at its
 * next scheduled time. No pretending it ran.
 */

export interface JobsRouteDeps {
  db: DbClient;
  guard: PreHandler;
  /** optional HTTP trigger exposed by the jobs runner on the private network */
  dreamTriggerUrl?: string;
}

export function registerJobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): void {
  app.post("/v1/jobs/dream", { preHandler: deps.guard }, async (request, reply) => {
    const body = (request.body ?? {}) as { date?: unknown };
    const date = typeof body.date === "string" ? body.date : undefined;
    await deps.db
      .insert(events)
      .values({ source: "system", type: "dream_requested", payload: date !== undefined ? { date } : {} });

    if (deps.dreamTriggerUrl === undefined) {
      return reply.code(202).send({
        status: "recorded",
        detail: "richiesta registrata: il sogno partirà alla prossima esecuzione schedulata",
      });
    }
    try {
      const response = await fetch(deps.dreamTriggerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(date !== undefined ? { date } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`status ${String(response.status)}`);
      return await reply.code(202).send({ status: "triggered" });
    } catch (error) {
      request.log.warn({ err: String(error) }, "dream trigger unreachable");
      return reply.code(202).send({
        status: "recorded",
        detail: "runner non raggiungibile: il sogno partirà alla prossima esecuzione schedulata",
      });
    }
  });
}
