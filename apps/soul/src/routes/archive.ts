import { gosini, meetings, memories, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decryptText, MEMORY_KINDS } from "@ugo/shared";
import type { ChatService } from "../services/chatService.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, householdScope } from "./scope.js";

/**
 * Windows onto what UGO has accumulated, and the two corrections a person
 * needs when he has got something wrong: "non è più vero" and "non doveva
 * esserci". Guarded, and since ADR-019 phase 2 scoped: reading, correcting and
 * destroying a memory all stop at the house's edge, and a memory of another
 * house answers 404 rather than admitting it exists. Guarded — these return
 * stored content, not just counts, and on a
 * rented box (ADR-017) the tailnet is the only other thing in front of them.
 *
 * This is a window, not the way to use the memory: the way is to ask him.
 */

const RECENT_LIMIT = 30;

/** `valid: false` retires a memory; `true` brings it back. */
const invalidateSchema = z.object({
  valid: z.boolean(),
  reason: z.string().min(1).max(300).optional(),
});

function memoryId(params: unknown): string | undefined {
  const parsed = z.object({ id: z.uuid() }).safeParse(params);
  return parsed.success ? parsed.data.id : undefined;
}

const listQuerySchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  q: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(RECENT_LIMIT),
});

export interface ArchiveDeps {
  db: DbClient;
  chat: ChatService;
  guard: PreHandler;
  /**
   * ADR-086: senza, questa rotta restituiva il **ciphertext**.
   *
   * I ricordi non sono tutti scritti allo stesso modo: il sogno e le riunioni
   * li scrivono in chiaro, il lascito di chi se n'è andato (ADR-075) e le
   * lezioni dell'anziano (ADR-077) li scrivono cifrati con la chiave di casa.
   * Il pannello li stampava così com'erano, quindi la cosa più preziosa che
   * resta di una creatura si leggeva `v1:` seguito da base64.
   *
   * Facoltativa: senza chiave si continua a mostrare il testo grezzo, che è
   * esattamente il comportamento di prima.
   */
  dataKey?: Buffer;
  /**
   * ADR-035: memories belong to one creature (ADR-032), so the panel's memory
   * page belongs to one too. Without this the search would answer with the
   * default exemplar's recall under another one's name — the same silent
   * mis-attribution `/v1/psyche` had.
   */
  registry?: {
    resolve: (
      query: string | undefined,
      householdId: string,
    ) => { chat: ChatService; id: string } | undefined;
  };
}

export function registerArchiveRoutes(app: FastifyInstance, deps: ArchiveDeps): void {
  /** Cifrato o in chiaro, si legge; illeggibile lo dice invece di fingere. */
  const readable = (value: string): string => {
    if (deps.dataKey === undefined) return value;
    try {
      return decryptText(value, deps.dataKey);
    } catch {
      return value.startsWith("v1:") ? "[non leggibile con la chiave di questa casa]" : value;
    }
  };

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
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const mine = exemplarsOf(deps.db, householdId);
    const { kind, q, limit } = parsed.data;
    // absent means the whole house (ADR-032); `resolve` would otherwise fall
    // back to the eldest and quietly answer as him
    const asked = (request.query as { gosino?: string }).gosino;
    const who =
      asked === undefined || asked === ""
        ? undefined
        : deps.registry?.resolve(asked, householdId);
    const chat = who?.chat ?? deps.chat;

    // with a query it is a semantic search — the same re-ranking the chat
    // uses, so what you see here is what UGO would actually recall
    if (q !== undefined) {
      const found = await chat.search(q, Math.min(limit, 20));
      return reply.send({
        mode: "search",
        memories: found.map(({ id, text, kind: memoryKind, score, createdAt }) => ({
          id,
          text: readable(text),
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
        validFrom: memories.validFrom,
        invalidatedAt: memories.invalidatedAt,
        invalidatedReason: memories.invalidatedReason,
      })
      .from(memories)
      .where(and(
        kind === undefined ? undefined : eq(memories.kind, kind),
        // absent narrows to the house, never to "everything"
        who === undefined ? inArray(memories.gosinoId, mine) : eq(memories.gosinoId, who.id),
      ))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
    return reply.send({
      mode: "recent",
      memories: rows.map((row) => ({ ...row, text: readable(row.text) })),
    });
  });

  /**
   * "Non è più vero."
   *
   * The memory is kept and stops being retrieved. Deleting would be tidier and
   * wrong: what UGO used to believe explains what he said last month, and a
   * biography with holes cannot be audited. Reversible on purpose — an owner
   * who invalidates the wrong one must be able to take it back.
   */
  app.patch("/v1/memories/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = memoryId(request.params);
    const parsed = invalidateSchema.safeParse(request.body);
    if (id === undefined || !parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid correction", status: 400 });
    }
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const [updated] = await deps.db
      .update(memories)
      .set(
        parsed.data.valid
          ? // `supersededBy` goes too, or a memory the owner brought back keeps
            // declaring itself replaced — latent until ADR-023, because until
            // then nothing ever wrote that column
            { invalidatedAt: null, invalidatedReason: null, supersededBy: null }
          : {
              invalidatedAt: new Date(),
              ...(parsed.data.reason !== undefined && { invalidatedReason: parsed.data.reason }),
            },
      )
      // a memory of another house answers 404, like one that does not exist
      .where(and(eq(memories.id, id), inArray(memories.gosinoId, exemplarsOf(deps.db, householdId))))
      .returning({ id: memories.id, invalidatedAt: memories.invalidatedAt });
    if (updated === undefined) {
      return reply
        .code(404)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Memory not found", status: 404 });
    }
    request.log.info({ memoryId: id, valid: parsed.data.valid }, "memory validity changed");
    return reply.send(updated);
  });

  /** "Non doveva esserci." Gone for good — the one thing invalidation is not. */
  app.delete("/v1/memories/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = memoryId(request.params);
    if (id === undefined) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid memory id", status: 400 });
    }
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const gone = await deps.db
      .delete(memories)
      .where(and(eq(memories.id, id), inArray(memories.gosinoId, exemplarsOf(deps.db, householdId))))
      .returning({ id: memories.id });
    request.log.info({ memoryId: id, existed: gone.length > 0 }, "memory destroyed");
    return reply.send({ destroyed: gone.length > 0 });
  });

  app.get("/v1/meetings", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const rows = await deps.db
      .select({
        id: meetings.id,
        platform: meetings.platform,
        title: meetings.title,
        startedAt: meetings.startedAt,
        endedAt: meetings.endedAt,
        status: meetings.status,
        // chi ci è andato: senza, l'elenco del pannello non poteva dirlo
        who: gosini.name,
      })
      .from(meetings)
      .leftJoin(gosini, eq(meetings.gosinoId, gosini.id))
      .where(inArray(meetings.gosinoId, exemplarsOf(deps.db, householdId)))
      .orderBy(desc(meetings.startedAt))
      .limit(RECENT_LIMIT);
    return reply.send({ meetings: rows });
  });
}
