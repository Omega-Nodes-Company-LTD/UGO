import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_DAYS, PackMood } from "../services/packMood.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * L'umore del branco nel tempo (ADR-087).
 *
 * `/v1/psyche` dice come sta **adesso**, `/v1/stats` come si è mosso **nelle
 * ultime 48 ore**. Questa risponde a «chi sta bene e chi no, e da quanto»:
 * una serie per creatura, mai una sola riga per tutte.
 */

const querySchema = z.object({
  giorni: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

export interface PackMoodDeps {
  db: DbClient;
  guard: PreHandler;
}

export function registerPackMoodRoutes(app: FastifyInstance, deps: PackMoodDeps): void {
  const mood = new PackMood(deps.db);

  app.get("/v1/psyche/branco", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "giorni non valido" });
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;

    const days = parsed.data.giorni;
    return reply.send({
      days: days ?? undefined,
      creatures: await mood.series(accountId, days),
    });
  });
}
