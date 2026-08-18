import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DowryService, type DowryOptions } from "../services/dowryService.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * La dote (ADR-074): guardarla, farla, adottarla.
 *
 * Guarded e admin: mandare fuori di casa il sapere di una creatura è l'atto
 * più delicato di tutto il pannello, e non lo fa un token qualunque.
 */

const optionsSchema = z.object({
  includeStories: z.boolean().optional(),
  giverBeingId: z.uuid().optional(),
});

const adoptSchema = z.object({
  sealed: z.string().min(1).max(8_000_000),
  key: z.string().min(16).max(200),
  name: z.string().min(1).max(40),
});

export interface DowryRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  /** ADR-022: senza, il sapere adottato si ripesca solo per parole */
  embedder?: { embed: (texts: string[]) => Promise<number[][]> };
  registry?: { reload: () => Promise<void> };
}

/** `exactOptionalPropertyTypes`: le chiavi assenti restano assenti. */
const cleaned = (input: z.infer<typeof optionsSchema>): DowryOptions => ({
  ...(input.includeStories !== undefined && { includeStories: input.includeStories }),
  ...(input.giverBeingId !== undefined && { giverBeingId: input.giverBeingId }),
});

export function registerDowryRoutes(app: FastifyInstance, deps: DowryRoutesDeps): void {
  const dowries = new DowryService(deps.db, deps.dataKey);

  app.post("/v1/gosini/:id/dowry/preview", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = optionsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const preview = await dowries.preview(accountId, id, cleaned(parsed.data));
    if (preview === undefined) return reply.status(404).send({ error: "non esiste" });
    return reply.send(preview);
  });

  app.post("/v1/gosini/:id/dowry", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = optionsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const made = await dowries.create(accountId, id, cleaned(parsed.data));
    if (made === undefined) return reply.status(404).send({ error: "non esiste" });
    // la chiave si vede UNA VOLTA SOLA: non è conservata da nessuna parte
    return reply.status(201).send(made);
  });

  app.post("/v1/dowries/adopt", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = adoptSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const adopted = await dowries.adopt(
      accountId,
      parsed.data.sealed,
      parsed.data.key,
      parsed.data.name,
      deps.embedder,
    );
    if (adopted === undefined) {
      return reply.status(400).send({ error: "dote illeggibile: chiave sbagliata o file rotto" });
    }
    await deps.registry?.reload();
    return reply.status(201).send(adopted);
  });
}
