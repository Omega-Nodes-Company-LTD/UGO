import { gosini, traitSets, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ARCHETYPES, characterFrom, traitsSchema } from "../services/council/character.js";
import type { CouncilService } from "../services/council/councilService.js";
import type { PreHandler } from "./guard.js";

/**
 * The council and the population (ADR-031).
 *
 * Both routes are guarded: creating an exemplar and convening a council are
 * expensive in different ways, and neither is something a stray request should
 * be able to do.
 */

const newGosinoSchema = z.object({
  name: z.string().min(1).max(40),
  locationLabel: z.string().min(1).max(40).optional(),
  /** a ready-made character, or nothing for a plain one */
  archetype: z.enum(["curiosone", "pigrone", "affettuoso", "brontolone", "timidone"]).optional(),
  /** explicit dials, which win over the archetype */
  traits: traitsSchema.partial().optional(),
});

const councilSchema = z.object({ question: z.string().min(2).max(500) });

export interface CouncilRoutesDeps {
  db: DbClient;
  council: CouncilService;
  /** the household every new exemplar is born into (ADR-019) */
  householdId: () => Promise<string>;
  guard: PreHandler;
  /**
   * ADR-035: a newborn with no runtime is worse than an error. `resolve()`
   * falls back to the eldest, so without this the panel would answer every
   * question about the new one with the OLD one's mood, and say nothing.
   */
  registry?: { reload: () => Promise<void> };
}

export function registerCouncilRoutes(app: FastifyInstance, deps: CouncilRoutesDeps): void {
  app.post("/v1/gosini", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newGosinoSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { name, locationLabel, archetype, traits } = parsed.data;

    // explicit dials win over the archetype, which wins over the plain default
    const merged = { ...(archetype === undefined ? {} : ARCHETYPES[archetype]), ...traits };
    const character = characterFrom(merged);

    const created = await deps.db
      .insert(gosini)
      .values({
        householdId: await deps.householdId(),
        name,
        ...(locationLabel !== undefined && { locationLabel }),
      })
      .returning({ id: gosini.id });
    const id = created[0]?.id;
    if (id === undefined) return reply.status(500).send({ error: "not created" });

    // version 1 of the genome, immutable from here: a change is a new version
    await deps.db.insert(traitSets).values({
      gosinoId: id,
      version: 1,
      traits: character.traits,
      mutationNote: archetype === undefined ? "nato a mano" : `archetipo: ${archetype}`,
    });

    // he exists in the database; now give him an apparatus to be himself with
    await deps.registry?.reload();

    return reply.status(201).send({
      id,
      name,
      persona: character.persona,
      ...(locationLabel !== undefined && { where: locationLabel }),
    });
  });

  app.get("/v1/gosini", { preHandler: deps.guard }, async (_request, reply) => {
    const rows = await deps.db
      .select({ id: gosini.id, name: gosini.name, where: gosini.locationLabel })
      .from(gosini);
    const out = [];
    for (const row of rows) {
      const traits = await deps.db
        .select({ traits: traitSets.traits })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, row.id))
        .limit(1);
      out.push({ ...row, persona: characterFrom(traits[0]?.traits).persona });
    }
    return reply.send({ gosini: out });
  });

  app.post("/v1/council", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = councilSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const result = await deps.council.deliberate(parsed.data.question);
    if (result.voices.length === 0) {
      // the local model is down or said nothing usable: say so, do not invent
      return reply.status(503).send({ error: "nessuno ha risposto: il modello locale è giù?" });
    }
    return reply.send(result);
  });
}
