import { corrections } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BeingsService } from "../../services/beingsService.js";
import { correctionSchema, problem, relationSchema, uuidParam, type PackRouteDeps } from "./shared.js";
import { exemplarsOf, householdScope } from "../scope.js";

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

    // ADR-053: **a chi** l'hai detto.
    //
    // Questa riga era `eldestExemplarOf(...)`, sempre, e non era un ripiego
    // innocuo: `corrections` è per esemplare e finisce nel prompt di quella
    // creatura («ti hanno detto che parli troppo forte»). Con due gosini in
    // casa, dire a Silvio che urla correggeva Ugo — e Silvio continuava a
    // urlare mentre Ugo si scusava per una cosa che non aveva fatto. Nessun
    // errore, nessun log, la creatura sbagliata che cambia comportamento.
    const asked = (request.query as { gosino?: string }).gosino;
    const who = deps.registry?.resolve(asked, householdId);
    const family = await exemplarsOf(deps.db, householdId);
    let gosinoId: string;
    if (who !== undefined && asked !== undefined && asked !== "") {
      gosinoId = who.id;
    } else if (family.length === 1 && family[0] !== undefined) {
      // una casa a esemplare solo non ha una domanda da porre, ed è la
      // promessa di ADR-019 §107: chi ne ha uno non vede alcun cambiamento
      gosinoId = family[0].id;
    } else {
      // e con più di uno **non si tira a indovinare**: è la stessa regola che
      // il prompt applica ai nomi delle persone, applicata a una scrittura
      return reply
        .code(400)
        .type("application/problem+json")
        .send(
          problem(
            "Which one?",
            400,
            "in questa casa vive più di un gosino: dì a quale l'hai detto con ?gosino=",
          ),
        );
    }

    const { beingId, aboutBeing, ...rest } = parsed.data;
    await deps.db.insert(corrections).values({
      gosinoId,
      ...rest,
      ...(beingId !== undefined && { beingId }),
      ...(aboutBeing !== undefined && { aboutBeing }),
    });
    return reply.code(201).send({ status: "recorded", gosinoId });
  });
}
