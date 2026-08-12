import { corrections } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BeingsService } from "../../services/beingsService.js";
import { correctionSchema, problem, relationSchema, uuidParam, type PackRouteDeps } from "./shared.js";
import { eldestExemplarOf, householdScope } from "../scope.js";

/** The graph between the others, and how the pack corrects UGO (ADR-014/016). */
export function registerSocialRoutes(
  app: FastifyInstance,
  deps: PackRouteDeps,
  serviceFor: (householdId: string) => BeingsService,
): void {
  app.get("/v1/relations", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    return reply.send({ relations: await serviceFor(householdId).listRelations() });
  });

  app.post("/v1/relations", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = relationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid relation", 400, z.prettifyError(parsed.error)));
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { beingA, beingB, type, strength } = parsed.data;
    if (beingA === beingB) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid relation", 400, "nessuno è parente di se stesso"));
    }
    // symmetric pairs are normalized in the service, so the caller never has
    // to know that partner_of(B,A) and partner_of(A,B) are the same fact
    await serviceFor(householdId).link(beingA, beingB, type, strength);
    return reply.code(201).send({ status: "linked" });
  });

  app.delete("/v1/relations/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    if (id === undefined) {
      return reply.code(400).type("application/problem+json").send(problem("Invalid relation id", 400));
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    await serviceFor(householdId).unlink(id);
    return reply.send({ status: "unlinked" });
  });

  app.post("/v1/corrections", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = correctionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid correction", 400, z.prettifyError(parsed.error)));
    }
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const { beingId, aboutBeing, ...rest } = parsed.data;
    await deps.db.insert(corrections).values({
      gosinoId: await eldestExemplarOf(deps.db, householdId),
      ...rest,
      ...(beingId !== undefined && { beingId }),
      ...(aboutBeing !== undefined && { aboutBeing }),
    });
    return reply.code(201).send({ status: "recorded" });
  });
}
