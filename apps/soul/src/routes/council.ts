import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CouncilService } from "../services/council/councilService.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * The council (ADR-031): one question to all of them at once.
 *
 * The population — who exists, who is born, which room they live in — moved to
 * `gosini.ts` with ADR-036. They had shared this file since both arrived on the
 * same afternoon, and the coupling had a real cost: moving a creature between
 * rooms was reachable only on a server that also had a council configured.
 *
 * Guarded: convening a council spends time on every local model in the house.
 */

const councilSchema = z.object({ question: z.string().min(2).max(500) });

export interface CouncilRoutesDeps {
  db: DbClient;
  council: CouncilService;
  guard: PreHandler;
}

export function registerCouncilRoutes(app: FastifyInstance, deps: CouncilRoutesDeps): void {
  app.post("/v1/council", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = councilSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const result = await deps.council.deliberate(parsed.data.question, householdId);
    if (result.voices.length === 0) {
      // the local model is down or said nothing usable: say so, do not invent
      return reply.status(503).send({ error: "nessuno ha risposto: il modello locale è giù?" });
    }
    return reply.send(result);
  });
}
