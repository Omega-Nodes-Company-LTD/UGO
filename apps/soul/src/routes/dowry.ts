import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DowryService, type DowryOptions } from "../services/dowryService.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

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
  app.post("/v1/gosini/:id/dowry/preview", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = optionsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const preview = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) =>
        (await new DowryService(db, deps.dataKey).preview(accountId, id, cleaned(parsed.data))) ??
        ("missing" as const),
    );
    if (preview === undefined) return reply;
    if (preview === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.send(preview);
  });

  app.post("/v1/gosini/:id/dowry", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = optionsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const made = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) =>
        (await new DowryService(db, deps.dataKey).create(accountId, id, cleaned(parsed.data))) ??
        ("missing" as const),
    );
    if (made === undefined) return reply;
    if (made === "missing") return reply.status(404).send({ error: "non esiste" });
    // la chiave si vede UNA VOLTA SOLA: non è conservata da nessuna parte
    return reply.status(201).send(made);
  });

  app.post("/v1/dowries/adopt", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = adoptSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    // l'embedder chiama Ollama: sta DENTRO adopt, quindi la transazione lo
    // attraversa — accettato per ora: è una chiamata locale con timeout, e
    // spezzarla vorrebbe dire spezzare l'atomicita' dell'adozione
    const adopted = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) =>
        (await new DowryService(db, deps.dataKey).adopt(
          accountId,
          parsed.data.sealed,
          parsed.data.key,
          parsed.data.name,
          deps.embedder,
        )) ?? ("unreadable" as const),
    );
    if (adopted === undefined) return reply;
    if (adopted === "unreadable") {
      return reply.status(400).send({ error: "dote illeggibile: chiave sbagliata o file rotto" });
    }
    await deps.registry?.reload();
    return reply.status(201).send(adopted);
  });
}
