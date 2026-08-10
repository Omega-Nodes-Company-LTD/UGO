import { PRIME_GOSINO_ID, corrections } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BeingsService } from "../../services/beingsService.js";
import { correctionSchema, problem, relationSchema, uuidParam, type PackRouteDeps } from "./shared.js";

/** The graph between the others, and how the pack corrects UGO (ADR-014/016). */
export function registerSocialRoutes(
  app: FastifyInstance,
  deps: PackRouteDeps,
  service: BeingsService,
): void {
  const gosinoId = deps.gosinoId ?? PRIME_GOSINO_ID;

  app.get("/v1/relations", { preHandler: deps.guard }, async (_request, reply) =>
    reply.send({ relations: await service.listRelations() }),
  );

  app.post("/v1/relations", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = relationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid relation", 400, z.prettifyError(parsed.error)));
    }
    const { beingA, beingB, type, strength } = parsed.data;
    if (beingA === beingB) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid relation", 400, "nessuno è parente di se stesso"));
    }
    // symmetric pairs are normalized in the service, so the caller never has
    // to know that partner_of(B,A) and partner_of(A,B) are the same fact
    await service.link(beingA, beingB, type, strength);
    return reply.code(201).send({ status: "linked" });
  });

  app.delete("/v1/relations/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    if (id === undefined) {
      return reply.code(400).type("application/problem+json").send(problem("Invalid relation id", 400));
    }
    await service.unlink(id);
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
    const { beingId, aboutBeing, ...rest } = parsed.data;
    await deps.db.insert(corrections).values({
      gosinoId,
      ...rest,
      ...(beingId !== undefined && { beingId }),
      ...(aboutBeing !== undefined && { aboutBeing }),
    });
    return reply.code(201).send({ status: "recorded" });
  });
}
