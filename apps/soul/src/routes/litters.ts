import { randomInt } from "node:crypto";
import { births, gosini, traitSets, type DbClient } from "@ugo/db";
import { screen, toTraitSet } from "@ugo/psyche";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { characterFrom } from "../services/council/character.js";
import { loadParents, previewLitter } from "../services/genetics.js";
import { RoomCatalogue } from "../services/roomCatalogue.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * The litter (ADR-069): looked at with one gesture, adopted with another.
 *
 * Nothing is written at preview time — the seed IS the litter, and the birth
 * regenerates it deterministically. «Si adotta, non si configura»: the form
 * has no dials, only the choice among the born.
 */

const MAX_SEED = 2_147_483_647;

const parentsSchema = z
  .array(z.uuid())
  .min(2)
  .max(4)
  .refine((ids) => new Set(ids).size === ids.length, "genitori ripetuti");

const litterSchema = z.object({
  parentIds: parentsSchema,
  seed: z.number().int().min(0).max(MAX_SEED).optional(),
  litterSize: z.number().int().min(1).max(8).optional(),
});

const birthSchema = z.object({
  parentIds: parentsSchema,
  seed: z.number().int().min(0).max(MAX_SEED),
  litterSize: z.number().int().min(1).max(8).optional(),
  cubIndex: z.number().int().min(0).max(7),
  name: z.string().min(1).max(40),
  locationLabel: z.string().min(1).max(40).optional(),
});

const DEFAULT_LITTER_SIZE = 4;

export interface LitterRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  registry?: { reload: () => Promise<void> };
}

export function registerLitterRoutes(app: FastifyInstance, deps: LitterRoutesDeps): void {
  const catalogue = new RoomCatalogue(deps.db);

  app.post("/v1/gosini/litters", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = litterSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;

    const parents = await loadParents(deps.db, householdId, parsed.data.parentIds);
    if (parents === undefined)
      return reply.status(404).send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });

    const seed = parsed.data.seed ?? randomInt(0, MAX_SEED);
    const preview = previewLitter(parents, seed, parsed.data.litterSize ?? DEFAULT_LITTER_SIZE);
    if ("refused" in preview) {
      return reply
        .status(422)
        .send({ error: preview.refused.reason, detail: `cucciolata rifiutata: ${preview.refused.reason}` });
    }
    return reply.send({
      seed: preview.seed,
      parents: parents.map((p) => ({ id: p.id, name: p.name })),
      cubs: preview.cubs,
    });
  });

  app.post("/v1/gosini/births", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = birthSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { parentIds, seed, cubIndex, name, locationLabel } = parsed.data;

    const parents = await loadParents(deps.db, householdId, parentIds);
    if (parents === undefined)
      return reply.status(404).send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });

    // ADR-039: a room he is born into has to exist, like in the manual birth
    let where: string | undefined;
    if (locationLabel !== undefined) {
      where = await catalogue.named(householdId, locationLabel);
      if (where === undefined) return reply.status(400).send({ error: "stanza sconosciuta" });
    }

    const preview = previewLitter(parents, seed, parsed.data.litterSize ?? DEFAULT_LITTER_SIZE);
    if ("refused" in preview) {
      return reply
        .status(422)
        .send({ error: preview.refused.reason, detail: `cucciolata rifiutata: ${preview.refused.reason}` });
    }
    const genome = preview.genomes[cubIndex];
    if (genome === undefined) return reply.status(400).send({ error: "cucciolo inesistente" });

    // the screen is not advice: a broken genome is not born (ADR-068 §6)
    const health = screen(genome);
    if (!health.viable) {
      return reply.status(422).send({
        error: "cucciolo non vitale",
        reasons: health.reasons,
        detail: `cucciolo non vitale: ${health.reasons.join("; ")}`,
      });
    }

    const generation = Math.max(...parents.map((p) => p.generation)) + 1;
    const character = characterFrom(toTraitSet(genome));

    const created = await deps.db
      .insert(gosini)
      .values({
        householdId,
        name,
        generation,
        // the single column keeps the first parent for today's readers;
        // `births` below is the complete, polyparental truth (ADR-069)
        parentGosinoId: parents[0]?.id,
        ...(where !== undefined && { locationLabel: where }),
      })
      .returning({ id: gosini.id });
    const id = created[0]?.id;
    if (id === undefined) return reply.status(500).send({ error: "not created" });

    await deps.db.insert(births).values(
      parents.map((parent) => ({
        householdId,
        childGosinoId: id,
        parentGosinoId: parent.id,
      })),
    );

    await deps.db.insert(traitSets).values({
      householdId,
      gosinoId: id,
      version: 1,
      traits: toTraitSet(genome),
      mutationNote: `cucciolata seed=${String(seed)} cucciolo=${String(cubIndex + 1)}`,
    });

    await deps.registry?.reload();

    return reply.status(201).send({
      id,
      name,
      generation,
      persona: character.persona,
      ...(where !== undefined && { where }),
    });
  });
}
