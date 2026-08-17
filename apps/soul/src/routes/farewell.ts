import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DowryOptions } from "../services/dowryService.js";
import { FarewellService } from "../services/farewellService.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Il congedo (ADR-075).
 *
 * Due rotte apposta: l'anteprima si guarda quante volte si vuole, il congedo
 * si fa una volta e **non si annulla**. Chiede il nome della creatura come
 * conferma — non per burocrazia, ma perché un click solo, su un pulsante
 * accanto ad altri, non è un consenso a una cosa irreversibile.
 */

const previewSchema = z.object({ includeStories: z.boolean().optional() });

const farewellSchema = z.object({
  includeStories: z.boolean().optional(),
  /** deve combaciare col nome dell'esemplare: è la conferma */
  confirmName: z.string().min(1).max(40),
});

export interface FarewellRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  registry?: { reload: () => Promise<void> };
  /** ADR-073: l'atto `death` in catena, se c'è un libro genealogico */
  chain?: {
    publish: (act: {
      kind: "death";
      gosinoId: string;
      genomeHash: string;
      at: string;
    }) => Promise<unknown>;
  };
}

export function registerFarewellRoutes(app: FastifyInstance, deps: FarewellRoutesDeps): void {
  const farewells = new FarewellService(deps.db, deps.dataKey);

  app.post("/v1/gosini/:id/farewell/preview", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = previewSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;

    const options: DowryOptions =
      parsed.data.includeStories === undefined ? {} : { includeStories: parsed.data.includeStories };
    const preview = await farewells.preview(householdId, id, options);
    if (preview === undefined) return reply.status(404).send({ error: "non esiste" });
    return reply.send(preview);
  });

  app.post("/v1/gosini/:id/farewell", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = farewellSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;

    const options: DowryOptions =
      parsed.data.includeStories === undefined ? {} : { includeStories: parsed.data.includeStories };
    const preview = await farewells.preview(householdId, id, options);
    if (preview === undefined) return reply.status(404).send({ error: "non esiste" });
    if (preview.alreadyGone) return reply.status(409).send({ error: "se n'è già andato" });
    if (preview.name !== parsed.data.confirmName) {
      return reply
        .status(400)
        .send({ error: "il nome non combacia", detail: "scrivi il suo nome per confermare" });
    }

    const result = await farewells.farewell(householdId, id, options);
    if (result === undefined) return reply.status(409).send({ error: "se n'è già andato" });

    // ADR-073: l'atto in catena. Come per la nascita, se il registro è giù
    // il congedo è comunque avvenuto — la chiave è già distrutta.
    try {
      await deps.chain?.publish({
        kind: "death",
        gosinoId: id,
        genomeHash: "0".repeat(64),
        at: new Date().toISOString(),
      });
    } catch {
      request.log.warn({ gosinoId: id }, "death not published to the registry");
    }

    await deps.registry?.reload();
    return reply.send(result);
  });
}
