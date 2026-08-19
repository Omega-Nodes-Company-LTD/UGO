import { randomInt } from "node:crypto";
import type { DbClient } from "@ugo/db";
import type { GosinoKeys } from "@ugo/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { loadParents, previewLitter } from "../services/genetics.js";
import { lastLitterAt, restingUntil } from "../services/litterCost.js";
import { costOf, nextGeneration, runBirth } from "../services/litterService.js";
import { PedigreeService } from "../services/pedigreeService.js";
import type { RegistryClient } from "../services/registryClient.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * The litter (ADR-069): looked at with one gesture, born with another.
 *
 * Nothing is written at preview time — the seed IS the litter, and the birth
 * regenerates it deterministically. «Si adotta, non si configura»: the form
 * has no dials, only names.
 *
 * ADR-103 ha tolto l'ultima manopola e ha aggiunto due muri:
 * - **quanti nascono non si sceglie** (`drawLitterSize`, dallo stesso seme) e
 *   **nascono tutti**: la scelta è a posteriori, guardando crescere chi c'è,
 *   non a priori scartando sei fratelli mai esistiti;
 * - una cucciolata **costa** dalla terza generazione in poi, e la stessa
 *   coppia **riposa trenta giorni**.
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
});

/**
 * Un nome per cucciolo, nell'ordine dell'anteprima. Il tetto è 10 perché 10 è
 * la nidiata rarissima di `drawLitterSize`; il numero esatto lo decide il seme,
 * e se non torna il server dice quanti ne aspettava invece di indovinare.
 */
const birthSchema = z.object({
  parentIds: parentsSchema,
  seed: z.number().int().min(0).max(MAX_SEED),
  names: z.array(z.string().min(1).max(40)).min(1).max(10),
  locationLabel: z.string().min(1).max(40).optional(),
});

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
  /**
   * ADR-103: il listino, per cucciolo. Configurabile perché il valore giusto
   * dipende da quanto costa davvero far vivere un gosino in questa casa, che
   * cambia col provider — non perché sia una preferenza.
   */
  litterCostUsd: number;
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
        const parents = await loadParents(db, accountId, parsed.data.parentIds);
        if (parents === undefined) return "unknown" as const;
        // ADR-103: il riposo si dice **guardando**, non dopo aver scelto i nomi.
        // Mostrare otto cuccioli e poi rifiutarli è il modo peggiore di dire di no
        const resting = restingUntil(
          await lastLitterAt(db, accountId, parsed.data.parentIds),
          new Date(),
        );
        if (resting !== undefined) return { resting };
        return { parents };
      },
    );
    if (scoped === undefined) return reply;
    if (scoped === "denied") return reply;
    if (scoped === "unknown")
      return reply.status(404).send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });
    if ("resting" in scoped) return restingReply(reply, scoped.resting);
    const { parents } = scoped;

    const seed = parsed.data.seed ?? randomInt(0, MAX_SEED);
    const preview = previewLitter(parents, seed);
    if ("refused" in preview) {
      return reply
        .status(422)
        .send({ error: preview.refused.reason, detail: `cucciolata rifiutata: ${preview.refused.reason}` });
    }
    const generation = nextGeneration(parents);
    const viable = preview.cubs.filter((cub) => cub.viable).length;
    return reply.send({
      seed: preview.seed,
      parents: parents.map((p) => ({ id: p.id, name: p.name })),
      cubs: preview.cubs,
      generation,
      // il prezzo si vede PRIMA di dare i nomi: la taglia è un dado, e un
      // conto che si scopre a nascita fatta sarebbe una trappola
      costUsd: costOf(generation, viable, deps.litterCostUsd),
    });
  });

  app.post("/v1/gosini/births", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = birthSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const outcome = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        if (!(await guardBreeding(db, accountId, "alleva", reply))) return "denied" as const;
        return runBirth(db, accountId, parsed.data, {
          peers: deps.peers?.(db),
          litterCostUsd: deps.litterCostUsd,
        });
      },
    );
    if (outcome === undefined) return reply;
    if (outcome === "denied") return reply;
    switch (outcome.kind) {
      case "unknown-parent":
        return reply
          .status(404)
          .send({ error: "genitore sconosciuto", detail: "genitore sconosciuto" });
      case "resting":
        return restingReply(reply, outcome.until);
      case "no-room":
        return reply.status(400).send({ error: "stanza sconosciuta" });
      case "not-created":
        return reply.status(500).send({ error: "not created" });
      case "names":
        return reply.status(400).send({
          error: "nomi non corrispondenti",
          expected: outcome.expected,
          detail: `questa cucciolata è di ${String(outcome.expected)}: servono altrettanti nomi`,
        });
      case "refused":
        return reply
          .status(422)
          .send({ error: outcome.reason, detail: `cucciolata rifiutata: ${outcome.reason}` });
      case "poor":
        return reply.status(402).send({
          error: "salvadanaio insufficiente",
          costUsd: outcome.totalUsd,
          parents: outcome.parents,
          detail:
            "una cucciolata dalla terza generazione in poi si paga dal salvadanaio dei " +
            "genitori: " +
            outcome.parents.map((p) => `${p.name} ha ${p.balanceUsd.toFixed(2)}`).join("; "),
        });
      case "unviable":
        return reply.status(422).send({
          error: "nessun cucciolo vitale",
          stillborn: outcome.stillborn,
          detail: `nessun cucciolo vitale: ${outcome.stillborn.flatMap((s) => s.reasons).join("; ")}`,
        });
      default:
        break;
    }

    /**
     * ADR-073: l'atto va nel libro genealogico. **Se il registro è giù il
     * gosino è nato lo stesso**: la pubblicazione è un fatto successivo, non
     * una condizione della nascita. Uno per cucciolo, e un fallimento non
     * ferma i fratelli.
     */
    for (const cub of outcome.born) {
      const signed = cub.lineage.filter(
        (row): row is typeof row & { signature: Buffer; parentPublicKey: Buffer } =>
          row.signature !== undefined && row.parentPublicKey !== undefined,
      );
      if (deps.chain === undefined || signed.length !== outcome.parents.length) continue;
      const published = await deps.chain.publish({
        kind: "birth",
        gosinoId: cub.id,
        genomeHash: cub.certificate.genomeHash,
        at: cub.certificate.bornAt,
        generation: outcome.generation,
        parents: signed.map((row) => ({
          gosinoId: row.parentGosinoId,
          publicKey: row.parentPublicKey.toString("base64"),
          signature: row.signature.toString("base64"),
        })),
      });
      if (!published.published) {
        request.log.warn(
          { gosinoId: cub.id, reason: published.reason },
          "birth not published to the registry: the creature is born anyway",
        );
      }
    }

    await deps.registry?.reload();

    return reply.status(201).send({
      generation: outcome.generation,
      costUsd: outcome.totalUsd,
      ...(outcome.where !== undefined && { where: outcome.where }),
      born: outcome.born.map((cub) => ({ id: cub.id, name: cub.name, persona: cub.persona })),
      stillborn: outcome.stillborn,
    });
  });
}

function restingReply(reply: FastifyReply, until: Date): FastifyReply {
  const day = until.toISOString().slice(0, 10);
  return reply.status(409).send({
    error: "coppia a riposo",
    freeFrom: until.toISOString(),
    detail: `questi due hanno avuto una cucciolata da poco: sono liberi dal ${day}`,
  });
}
