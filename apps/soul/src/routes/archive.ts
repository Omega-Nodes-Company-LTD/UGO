import { meetings, memories, type DbClient } from "@ugo/db";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MEMORY_KINDS } from "@ugo/shared";
import type { ChatService } from "../services/chatService.js";
import type { PreHandler } from "./guard.js";

/**
 * Read-only windows onto what UGO has accumulated: what he remembers, and
 * which meetings he sat through. Guarded — these return stored content, not
 * just counts, and on a rented box (ADR-017) the tailnet is the only other
 * thing standing in front of them.
 *
 * This is a window, not the way to use the memory: the way is to ask him.
 */

const RECENT_LIMIT = 30;

const listQuerySchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  q: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(RECENT_LIMIT),
});

export interface ArchiveDeps {
  db: DbClient;
  chat: ChatService;
  guard: PreHandler;
}

export function registerArchiveRoutes(app: FastifyInstance, deps: ArchiveDeps): void {
  app.get("/v1/memories", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Invalid query",
        status: 400,
        detail: z.prettifyError(parsed.error),
      });
    }
    const { kind, q, limit } = parsed.data;

    // with a query it is a semantic search — the same re-ranking the chat
    // uses, so what you see here is what UGO would actually recall
    if (q !== undefined) {
      const found = await deps.chat.search(q, Math.min(limit, 20));
      return reply.send({
        mode: "search",
        memories: found.map(({ id, text, kind: memoryKind, score, createdAt }) => ({
          id,
          text,
          kind: memoryKind,
          score,
          createdAt,
        })),
      });
    }

    const rows = await deps.db
      .select({
        id: memories.id,
        text: memories.text,
        kind: memories.kind,
        importance: memories.importance,
        lastAccessed: memories.lastAccessed,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(kind === undefined ? undefined : eq(memories.kind, kind))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
    return reply.send({ mode: "recent", memories: rows });
  });

  app.get("/v1/meetings", { preHandler: deps.guard }, async (_request, reply) => {
    const rows = await deps.db
      .select({
        id: meetings.id,
        platform: meetings.platform,
        title: meetings.title,
        startedAt: meetings.startedAt,
        endedAt: meetings.endedAt,
        status: meetings.status,
      })
      .from(meetings)
      .orderBy(desc(meetings.startedAt))
      .limit(RECENT_LIMIT);
    return reply.send({ meetings: rows });
  });
}
