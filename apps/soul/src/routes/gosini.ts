import { gosini, traitSets, type DbClient } from "@ugo/db";
import { lifeAt } from "@ugo/psyche";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ARCHETYPES, characterFrom, traitsSchema } from "../services/council/character.js";
import { RoomCatalogue } from "../services/roomCatalogue.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

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

/** ADR-039: making a room, which is now a thing and not a spelling. */
const newRoomSchema = z.object({ name: z.string().min(1).max(40) });

export interface GosiniRoutesDeps {
  db: DbClient;
  /** the household every new exemplar is born into (ADR-019) */
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
  const catalogue = new RoomCatalogue(deps.db);

  /**
   * The rooms, and who is in them (ADR-037). **Not guarded**, unlike everything
   * else in this file, because the body needs it and the body has no operator
   * token: a dock must be able to offer "which room am I?" without one.
   *
   * What it exposes is room labels and creature names — the same class of thing
   * `whoami` has always sent down an unguarded socket on this tailnet. It says
   * nothing about the household: no people, no memories, no spend.
   *
   * ADR-039: the catalogue is the source, not the residents. A room the owner
   * made and has not filled yet is still a room you can point a screen at.
   */
  app.get("/v1/rooms", async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    return reply.send({ rooms: await catalogue.list(householdId) });
  });

  /** Making a room (ADR-039). Guarded: `GET` is for the body, this is not. */
  app.post("/v1/rooms", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const made = await catalogue.create(householdId, parsed.data.name);
    if (made === undefined) return reply.status(400).send({ error: "invalid body" });
    return reply.status(made.created ? 201 : 200).send(made);
  });

  /**
   * Unmaking one (ADR-039). Whoever lived there comes out of every room rather
   * than disappearing with it.
   */
  app.delete("/v1/rooms/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await catalogue.remove(householdId, id);
    if (gone === undefined) return reply.status(404).send({ error: "non esiste" });
    // the registry holds `where`: a creature evicted here must stop being
    // handed to the dock that used to show him
    await deps.registry?.reload();
    return reply.send(gone);
  });

  app.post("/v1/gosini", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newGosinoSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { name, locationLabel, archetype, traits } = parsed.data;

    // ADR-039: a room he is born into has to be one that exists. Silently
    // creating it here would have made the catalogue grow by typo — and, since
    // ADR-019 phase 2, one that exists *in this house*: the neighbours' kitchen
    // used to vouch for a label here.
    let where: string | undefined;
    if (locationLabel !== undefined) {
      where = await catalogue.named(householdId, locationLabel);
      if (where === undefined) return reply.status(400).send({ error: "stanza sconosciuta" });
    }

    // explicit dials win over the archetype, which wins over the plain default
    const merged = { ...(archetype === undefined ? {} : ARCHETYPES[archetype]), ...traits };
    const character = characterFrom(merged);

    const created = await deps.db
      .insert(gosini)
      .values({
        householdId,
        name,
        ...(where !== undefined && { locationLabel: where }),
      })
      .returning({ id: gosini.id });
    const id = created[0]?.id;
    if (id === undefined) return reply.status(500).send({ error: "not created" });

    // version 1 of the genome, immutable from here: a change is a new version
    await deps.db.insert(traitSets).values({
      householdId,
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
      ...(where !== undefined && { where }),
    });
  });

  app.get("/v1/gosini", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const rows = await deps.db
      .select({
        id: gosini.id,
        name: gosini.name,
        where: gosini.locationLabel,
        bornAt: gosini.bornAt,
      })
      .from(gosini)
      .where(eq(gosini.householdId, householdId));
    const now = new Date();
    const out = [];
    for (const row of rows) {
      const traits = await deps.db
        .select({ traits: traitSets.traits })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, row.id))
        .limit(1);
      const character = characterFrom(traits[0]?.traits);
      // ADR-071: l'età non si conserva, si calcola da `born_at` e dal genoma
      const life = lifeAt(row.bornAt, now, character.traits.longevity);
      out.push({
        id: row.id,
        name: row.name,
        where: row.where,
        persona: character.persona,
        age: {
          days: Math.floor(life.ageDays),
          stage: life.stage,
          fraction: Number(life.fraction.toFixed(3)),
          plasticity: Number(life.plasticity.toFixed(2)),
          greying: Number(life.greying.toFixed(2)),
        },
      });
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
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const asked = parsed.data.locationLabel.trim();

    // ADR-039: empty still means "out of every room"; anything else has to name
    // a room that exists, and is stored the way the catalogue spells it
    let room: string | null = null;
    if (asked !== "") {
      const known = await catalogue.named(householdId, asked);
      if (known === undefined) return reply.status(400).send({ error: "stanza sconosciuta" });
      room = known;
    }

    const moved = await deps.db
      .update(gosini)
      .set({ locationLabel: room })
      .where(and(eq(gosini.id, id), eq(gosini.householdId, householdId)))
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
