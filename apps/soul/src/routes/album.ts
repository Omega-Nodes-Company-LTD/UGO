import { PHOTO_RETENTION_STEPS, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { KEEP_REFUSALS, type AlbumService } from "../services/albumService.js";
import type { AuditLogger } from "../services/auditLog.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * L'album (ADR-109). Tutte le rotte sono della casa: guard + scope.
 *
 * L'avvertenza sulla durata non è un dettaglio dell'interfaccia: è la cosa
 * che il proprietario ha chiesto per primo — o non si tengono, o si tengono
 * per un tempo che sceglie lui. Vive qui in un posto solo, e il pannello la
 * mostra sopra la tendina.
 */
export const ALBUM_WARNING =
  "Le foto si conservano solo se scegli per quanto, e spariscono da sole allo scadere. " +
  "Si scattano soltanto quando lo chiedi tu; se qualcuno del branco ha chiesto di non essere " +
  "guardato, l'album resta spento per tutta la casa.";

const retentionSchema = z.object({
  ore: z.union(PHOTO_RETENTION_STEPS.map((step) => z.literal(step)) as never),
});

const searchSchema = z.object({
  parole: z.string().max(120).optional(),
  da: z.iso.datetime().optional(),
  a: z.iso.datetime().optional(),
});

export interface AlbumRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  album: AlbumService;
  audit: AuditLogger;
}

export function registerAlbumRoutes(app: FastifyInstance, deps: AlbumRoutesDeps): void {
  app.get("/v1/album", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    const gate = await deps.album.gate(accountId);
    return reply.send({
      warning: ALBUM_WARNING,
      steps: PHOTO_RETENTION_STEPS,
      retentionHours: gate.hours,
      // il pannello deve poter dire PERCHÉ è spento, non solo che lo è
      someoneRefuses: gate.someoneRefuses,
      photos: gate.hours === 0 ? [] : await deps.album.list(accountId),
    });
  });

  /** La durata: cinque scalini o zero, e il database rifiuta il resto. */
  app.put("/v1/album/retention", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = retentionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "invalid body", detail: `le ore possibili sono ${PHOTO_RETENTION_STEPS.join(", ")}` });
    }
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    await deps.album.setRetention(accountId, parsed.data.ore);
    await deps.audit.record({
      verb: "album_retention_set",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "account",
      resourceId: String(parsed.data.ore),
    });
    return reply.send({ retentionHours: parsed.data.ore });
  });

  app.get("/v1/album/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    const image = await deps.album.open(accountId, id);
    if (image === undefined) return reply.status(404).send({ error: "non c'è" });
    return reply.send({ image });
  });

  app.get("/v1/album/cerca", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid query" });
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    return reply.send({
      photos: await deps.album.search(accountId, {
        words: parsed.data.parole,
        since: parsed.data.da === undefined ? undefined : new Date(parsed.data.da),
        until: parsed.data.a === undefined ? undefined : new Date(parsed.data.a),
      }),
    });
  });

  app.delete("/v1/album/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const gone = await deps.album.drop(accountId, id);
    return gone ? reply.send({ dropped: id }) : reply.status(404).send({ error: "non c'è" });
  });

  /**
   * La scadenza applicata (ADR-109 §5).
   *
   * Sta su una rotta per la ragione di `POST /v1/prints/expire`: i job di
   * questa casa girano così, e girarla a mano è anche il modo in cui si
   * dimostra che la durata promessa è vera. Il passo `album` del sogno fa la
   * stessa cosa, e i due non si disturbano — cancellare ciò che è già
   * cancellato non fa niente.
   */
  app.post("/v1/album/expire", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const destroyed = await deps.album.expire(accountId);
    if (destroyed > 0) {
      await deps.audit.record({
        verb: "photos_expired",
        outcome: "ok",
        accountId,
        resourceType: "photo",
        // il conteggio, mai una chiave: il precedente è `prints_expired`
        resourceId: String(destroyed),
      });
    }
    return reply.send({ destroyed });
  });
}

export { KEEP_REFUSALS };
