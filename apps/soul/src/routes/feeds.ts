import { feedItems, rssFeeds, type DbClient } from "@ugo/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { PreHandler } from "./guard.js";
import { NewsService } from "../services/newsService.js";
import { inAccount } from "./scope.js";

/**
 * I feed della casa (ADR-060): iscriversi, spegnere, disdire.
 *
 * Solo admin, come i clienti: quali feed segue una casa dice a cosa lavora lo
 * studio, e non sono affari del muso né della reception. Il download e
 * l'embedding NON passano da qui — sono dei job (`feeds.py`), a cadenza loro:
 * queste rotte scrivono solo la lista.
 */

const addSchema = z.object({
  url: z.url().max(500).refine((value) => /^https?:\/\//.test(value), {
    message: "solo http(s)",
  }),
  label: z.string().min(1).max(120),
});

const toggleSchema = z.object({ enabled: z.boolean() });

export interface FeedRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  audit?: AuditLogger;
}

function problem(reply: FastifyReply, status: number, title: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

export function registerFeedRoutes(app: FastifyInstance, deps: FeedRoutesDeps): void {
  const { db, guard, audit } = deps;
  const admin = { preHandler: guard };
  // ADR-062: ogni lavoro di database gira nella transazione che dichiara la casa
  const inAdmin = <T>(
    request: Parameters<PreHandler>[0],
    reply: FastifyReply,
    work: (tx: DbClient, accountId: string) => Promise<T>,
  ): Promise<T | undefined> => inAccount(db, request, reply, { requireAdmin: true }, work);

  app.get("/v1/feeds", admin, async (request, reply) => {
    const body = await inAdmin(request, reply, async (tx, accountId) => {
    const rows = await tx
      .select({
        id: rssFeeds.id,
        url: rssFeeds.url,
        label: rssFeeds.label,
        enabled: rssFeeds.enabled,
        lastFetchedAt: rssFeeds.lastFetchedAt,
        lastStatus: rssFeeds.lastStatus,
        items: sql<string>`(select count(*) from ${feedItems} where ${feedItems.feedId} = ${rssFeeds.id})`,
        advised: sql<string>`(select count(*) from ${feedItems} where ${feedItems.feedId} = ${rssFeeds.id} and ${feedItems.advisedAt} is not null)`,
      })
      .from(rssFeeds)
      .where(eq(rssFeeds.accountId, accountId))
      .orderBy(desc(rssFeeds.createdAt));
    return {
      feeds: rows.map((row) => ({
        ...row,
        items: Number(row.items),
        advised: Number(row.advised),
        lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
      })),
    };
    });
    if (body === undefined) return reply;
    return body;
  });

  /**
   * ADR-080: **cosa è arrivato davvero**. Il pannello mostrava due contatori
   * («412 item, 3 consigliati») e nessun titolo: chi si iscrive a un feed
   * vuole vedere se arriva roba, non quanta.
   */
  app.get("/v1/feeds/items", admin, async (request, reply) => {
    const asked = Number((request.query as { limit?: string }).limit);
    const body = await inAdmin(request, reply, async (tx, accountId) => ({
      items: await new NewsService(tx).latest(
        accountId,
        Number.isFinite(asked) && asked > 0 ? asked : 20,
      ),
    }));
    if (body === undefined) return reply;
    return body;
  });

  app.post("/v1/feeds", admin, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const outcome = await inAdmin(request, reply, async (tx, accountId) => {
      const [row] = await tx
        .insert(rssFeeds)
        .values({ accountId, url: parsed.data.url, label: parsed.data.label })
        .onConflictDoNothing()
        .returning({ id: rssFeeds.id });
      return { accountId, row };
    });
    if (outcome === undefined) return reply;
    // lo stesso URL due volte non è un errore da 500: è già iscritto
    if (outcome.row === undefined) return problem(reply, 409, "Conflict");
    await audit?.record({
      verb: "feed_added",
      outcome: "ok",
      accountId: outcome.accountId,
      actor: request.tenant,
      resourceType: "feed",
      resourceId: outcome.row.id,
    });
    return reply.code(201).send({ id: outcome.row.id });
  });

  app.patch("/v1/feeds/:id", admin, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = toggleSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const updated = await inAdmin(request, reply, (tx, accountId) =>
      tx
        .update(rssFeeds)
        .set({ enabled: parsed.data.enabled })
        .where(and(eq(rssFeeds.id, id), eq(rssFeeds.accountId, accountId)))
        .returning({ id: rssFeeds.id }),
    );
    if (updated === undefined) return reply;
    if (updated.length === 0) return problem(reply, 404, "Not Found");
    return reply.code(204).send();
  });

  app.delete("/v1/feeds/:id", admin, async (request, reply) => {
    const { id } = request.params as { id: string };
    // il cascade porta via anche gli item: disdire un feed è disdirlo tutto
    const gone = await inAdmin(request, reply, async (tx, accountId) => ({
      accountId,
      rows: await tx
        .delete(rssFeeds)
        .where(and(eq(rssFeeds.id, id), eq(rssFeeds.accountId, accountId)))
        .returning({ id: rssFeeds.id }),
    }));
    if (gone === undefined) return reply;
    if (gone.rows.length === 0) return problem(reply, 404, "Not Found");
    await audit?.record({
      verb: "feed_removed",
      outcome: "ok",
      accountId: gone.accountId,
      actor: request.tenant,
      resourceType: "feed",
      resourceId: id,
    });
    return reply.code(204).send();
  });
}
