import { randomInt } from "node:crypto";
import { births, gosini, traitSets, type DbClient } from "@ugo/db";
import { screen, toTraitSet } from "@ugo/psyche";
import { genomeHash, signBirth, type BirthCertificate, type GosinoKeys } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { characterFrom } from "../services/council/character.js";
import { drawLifeJitter } from "../services/lifeDice.js";
import { loadParents, previewLitter } from "../services/genetics.js";
import { PedigreeService } from "../services/pedigreeService.js";
import type { RegistryClient } from "../services/registryClient.js";
import { RoomCatalogue } from "../services/roomCatalogue.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

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
  /**
   * ADR-070: the parents' cryptographic identity, minted on first use. Without
   * it a birth still happens — the lineage is simply `unsigned`.
   */
  /**
   * ADR-062: una fabbrica e non un'istanza — le chiavi dei genitori si
   * leggono DENTRO la transazione che ha dichiarato la casa, o sotto RLS la
   * firma sparirebbe in silenzio (keysFor vedrebbe zero righe e la nascita
   * uscirebbe `unsigned` senza che nessuno se ne accorga).
   */
  peers?: (db: DbClient) => { keysFor: (gosinoId: string) => Promise<GosinoKeys> };
  /** ADR-073: il libro genealogico. Assente = si nasce senza registrazione. */
  chain?: RegistryClient;
}

export function registerLitterRoutes(app: FastifyInstance, deps: LitterRoutesDeps): void {
  /** The pedigree (ADR-070): the genealogy, with a verdict on every edge. */
  app.get("/v1/gosini/:id/pedigree", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asked = Number((request.query as { generations?: string }).generations);
    const tree = await inAccount(deps.db, request, reply, {}, async (db, accountId) =>
      (await new PedigreeService(db).of(
        accountId,
        id,
        Number.isFinite(asked) && asked > 0 ? asked : undefined,
      )) ?? ("missing" as const),
    );
    if (tree === undefined) return reply;
    if (tree === "missing") return reply.status(404).send({ error: "non esiste" });
    // ADR-073: e cosa ne dice il libro genealogico. Registro giù = pedigree
    // comunque leggibile: le firme dei genitori valgono senza di lui
    const registered = await deps.chain?.actsFor(id);
    return reply.send({ pedigree: tree, ...(registered !== undefined && { registered }) });
  });

  app.post("/v1/gosini/litters", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = litterSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const scoped = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        // ADR-081: guardare una cucciolata è già allevare — è da lì che si sceglie
        if (!(await guardBreeding(db, accountId, "alleva", reply))) return "denied" as const;
        return (await loadParents(db, accountId, parsed.data.parentIds)) ?? ("unknown" as const);
      },
    );
    if (scoped === undefined) return reply;
    if (scoped === "denied") return reply;
    if (scoped === "unknown")
      return reply.status(404).send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });
    const parents = scoped;

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
    const { parentIds, seed, cubIndex, name, locationLabel } = parsed.data;

    const born = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
    if (!(await guardBreeding(db, accountId, "alleva", reply))) return "denied" as const;

    const parents = await loadParents(db, accountId, parentIds);
    if (parents === undefined) return "unknown-parent" as const;

    // ADR-039: a room he is born into has to exist, like in the manual birth
    let where: string | undefined;
    if (locationLabel !== undefined) {
      where = await new RoomCatalogue(db).named(accountId, locationLabel);
      if (where === undefined) return "no-room" as const;
    }

    const preview = previewLitter(parents, seed, parsed.data.litterSize ?? DEFAULT_LITTER_SIZE);
    if ("refused" in preview) return { refused: preview.refused.reason };
    const genome = preview.genomes[cubIndex];
    if (genome === undefined) return "no-cub" as const;

    // the screen is not advice: a broken genome is not born (ADR-068 §6)
    const health = screen(genome);
    if (!health.viable) return { unviable: health.reasons };

    const generation = Math.max(...parents.map((p) => p.generation)) + 1;
    const traits = toTraitSet(genome);
    const character = characterFrom(traits);

    const created = await db
      .insert(gosini)
      .values({
        accountId,
        name,
        generation,
        // the single column keeps the first parent for today's readers;
        // `births` below is the complete, polyparental truth (ADR-069)
        parentGosinoId: parents[0]?.id,
        // ADR-077: chi nasce da qui in avanti è mortale dalla nascita — chi
        // adotta la mortalità l'accetta adottando. Il dado si tira qui, con
        // `randomInt` e non col seme della cucciolata: due fratelli con lo
        // stesso allele della longevità non devono morire lo stesso giorno
        mortalFrom: new Date(),
        lifeJitterDays: drawLifeJitter(),
        // ADR-081: nato, quindi cedibile. È l'unica origine che lo è
        origin: "nato",
        ...(where !== undefined && { locationLabel: where }),
      })
      .returning({ id: gosini.id, bornAt: gosini.bornAt });
    const child = created[0];
    if (child === undefined) return "not-created" as const;
    const id = child.id;

    await db.insert(traitSets).values({
      accountId,
      gosinoId: id,
      version: 1,
      traits,
      mutationNote: `cucciolata seed=${String(seed)} cucciolo=${String(cubIndex + 1)}`,
    });

    /**
     * The pedigree (ADR-070): both parents attest the birth. Without the peer
     * service there are no keys to sign with, so the lineage is written
     * `unsigned` rather than not written — a birth must not fail because the
     * pedigree is off.
     */
    const certificate: BirthCertificate = {
      childId: id,
      genomeHash: genomeHash(traits),
      parentIds: parents.map((p) => p.id),
      bornAt: child.bornAt.toISOString(),
      generation,
    };
    const peers = deps.peers?.(db);
    const lineage = [];
    for (const parent of parents) {
      const keys = await peers?.keysFor(parent.id);
      lineage.push({
        accountId,
        childGosinoId: id,
        parentGosinoId: parent.id,
        ...(keys !== undefined && {
          signature: signBirth(certificate, keys.signingPrivateKey),
          parentPublicKey: keys.signingPublicKey,
        }),
      });
    }
    await db.insert(births).values(lineage);
    return { id, bornAt: child.bornAt, generation, persona: character.persona, where, parents, lineage, certificate };
      },
    );
    if (born === undefined) return reply;
    if (born === "denied") return reply;
    if (born === "unknown-parent")
      return reply.status(404).send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });
    if (born === "no-room") return reply.status(400).send({ error: "stanza sconosciuta" });
    if (born === "no-cub") return reply.status(400).send({ error: "cucciolo inesistente" });
    if (born === "not-created") return reply.status(500).send({ error: "not created" });
    if ("refused" in born) {
      return reply
        .status(422)
        .send({ error: born.refused, detail: `cucciolata rifiutata: ${born.refused}` });
    }
    if ("unviable" in born) {
      return reply.status(422).send({
        error: "cucciolo non vitale",
        reasons: born.unviable,
        detail: `cucciolo non vitale: ${born.unviable.join("; ")}`,
      });
    }
    const { id, generation, certificate, lineage } = born;

    /**
     * ADR-073: l'atto va nel libro genealogico. **Se il registro è giù il
     * gosino è nato lo stesso**: la pubblicazione è un fatto successivo, non
     * una condizione della nascita.
     */
    const signedParents = lineage.filter(
      (row): row is typeof row & { signature: Buffer; parentPublicKey: Buffer } =>
        row.signature !== undefined && row.parentPublicKey !== undefined,
    );
    if (deps.chain !== undefined && signedParents.length === born.parents.length) {
      const outcome = await deps.chain.publish({
        kind: "birth",
        gosinoId: id,
        genomeHash: certificate.genomeHash,
        at: certificate.bornAt,
        generation,
        parents: signedParents.map((row) => ({
          gosinoId: row.parentGosinoId,
          publicKey: row.parentPublicKey.toString("base64"),
          signature: row.signature.toString("base64"),
        })),
      });
      if (!outcome.published) {
        request.log.warn(
          { gosinoId: id, reason: outcome.reason },
          "birth not published to the registry: the creature is born anyway",
        );
      }
    }

    await deps.registry?.reload();

    return reply.status(201).send({
      id,
      name,
      generation,
      persona: born.persona,
      ...(born.where !== undefined && { where: born.where }),
    });
  });
}
