import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_DAYS, PackMood } from "../services/packMood.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

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
  app.get("/v1/psyche/branco", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "giorni non valido" });
    const days = parsed.data.giorni;
    // ADR-062: il servizio nasce sulla transazione che ha dichiarato la casa,
    // non sulla connessione nuda — o le politiche RLS non vedrebbero la casa
    const body = await inAccount(deps.db, request, reply, {}, async (db, accountId) => ({
      days: days ?? undefined,
      creatures: await new PackMood(db).series(accountId, days),
    }));
    if (body === undefined) return reply;
    return reply.send(body);
  });
}
