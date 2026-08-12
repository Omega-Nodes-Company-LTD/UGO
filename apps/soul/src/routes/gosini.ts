import { gosini, traitSets, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ARCHETYPES, characterFrom, traitsSchema } from "../services/council/character.js";
import type { PreHandler } from "./guard.js";

/**
 * The population: who exists, who is born, and which room they live in
 * (ADR-031, ADR-036).
 *
 * Split out of the council routes because they were never the same thing:
 * moving somebody between rooms was reachable only on a server that had a
 * council configured, which is an unrelated feature. Guarded — creating a
 * creature and deciding which screen shows him are both things a stray request
 * must not be able to do.
 */

const newGosinoSchema = z.object({
  name: z.string().min(1).max(40),
  locationLabel: z.string().min(1).max(40).optional(),
  /** a ready-made character, or nothing for a plain one */
  archetype: z.enum(["curiosone", "pigrone", "affettuoso", "brontolone", "timidone"]).optional(),
  /** explicit dials, which win over the archetype */
  traits: traitsSchema.partial().optional(),
});

/** ADR-036: moving one between rooms. An empty label takes him out of every room. */
const moveSchema = z.object({ locationLabel: z.string().max(40) });

export interface GosiniRoutesDeps {
  db: DbClient;
  /** the household every new exemplar is born into (ADR-019) */
  householdId: () => Promise<string>;
  guard: PreHandler;
  /**
   * ADR-035/036: a newborn with no runtime, or a mover whose room the registry
   * has not heard about, is worse than an error. `resolve()` falls back to the
   * eldest, so without a reload the panel answers about the new one with the
   * old one's mood — and a moved creature keeps appearing on the old dock.
   */
  registry?: { reload: () => Promise<void> };
}

export function registerGosiniRoutes(app: FastifyInstance, deps: GosiniRoutesDeps): void {
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

  /**
   * Moving a creature to another room (ADR-036).
   *
   * The room is what a device shows, so this is the one control that decides
   * who appears where. It is a PATCH and not part of the birth form on purpose:
   * where somebody lives changes, and the genome does not.
   */
  app.patch("/v1/gosini/:id", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const room = parsed.data.locationLabel.trim();

    const moved = await deps.db
      .update(gosini)
      .set({ locationLabel: room === "" ? null : room })
      .where(eq(gosini.id, id))
      .returning({ id: gosini.id, name: gosini.name, where: gosini.locationLabel });
    const row = moved[0];
    if (row === undefined) return reply.status(404).send({ error: "non esiste" });

    // the registry holds `where`, and it is what a socket asks when a device
    // says which room it is the body of: stale here means the dock keeps
    // showing the old room's occupants until a restart
    await deps.registry?.reload();
    return reply.send(row);
  });
}
