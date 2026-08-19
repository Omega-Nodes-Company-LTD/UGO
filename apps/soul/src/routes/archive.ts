import { gosini, memories, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decryptText, MEMORY_KINDS } from "@ugo/shared";
import type { AuditLogger } from "../services/auditLog.js";
import type { ChatService } from "../services/chatService.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, accountScope, inAccount } from "./scope.js";
import { withAccount } from "@ugo/db";

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

/** ADR-104: un ricordo dato a mano dal titolare. */
const writeSchema = z.object({
  gosinoId: z.uuid().optional(),
  kind: z.enum(MEMORY_KINDS),
  text: z.string().min(1).max(2000),
  importance: z.number().min(0).max(1).optional(),
  /** da quando vale: un fatto si può registrare tardi (ADR-022) */
  validFrom: z.iso.datetime().optional(),
});

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
  /** ADR-104: scrivere un ricordo e buttare una riunione sono atti, e vanno sul giornale */
  audit: AuditLogger;
  /**
   * ADR-104: senza, un ricordo scritto a mano nasce **senza vettore** — e si
   * ripesca solo per parole. La risposta lo dichiara invece di lasciarlo
   * credere (la lezione di ADR-091).
   */
  embedder?: { embed: (texts: string[]) => Promise<number[][]> } | undefined;
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
      accountId: string,
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
    // NB (ADR-062): il ramo di ricerca semantica passa dal runtime della
    // creatura (superficie 2) e si converte col lotto del gateway; qui si
    // risolve la casa e basta, e il ramo «recenti» entra nel muro da solo
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    const { kind, q, limit } = parsed.data;
    // absent means the whole house (ADR-032); `resolve` would otherwise fall
    // back to the eldest and quietly answer as him
    const asked = (request.query as { gosino?: string }).gosino;
    const who =
      asked === undefined || asked === ""
        ? undefined
        : deps.registry?.resolve(asked, accountId);
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

    const rows = await withAccount(deps.db, accountId, (db) =>
      db
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
        .where(
          and(
            kind === undefined ? undefined : eq(memories.kind, kind),
            // absent narrows to the house, never to "everything"
            who === undefined
              ? inArray(memories.gosinoId, exemplarsOf(db, accountId))
              : eq(memories.gosinoId, who.id),
          ),
        )
        .orderBy(desc(memories.createdAt))
        .limit(limit),
    );
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
    const updatedRows = await inAccount(deps.db, request, reply, {}, (db, accountId) =>
      db
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
        .where(and(eq(memories.id, id), inArray(memories.gosinoId, exemplarsOf(db, accountId))))
        .returning({ id: memories.id, invalidatedAt: memories.invalidatedAt }),
    );
    if (updatedRows === undefined) return reply;
    const [updated] = updatedRows;
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
    const gone = await inAccount(deps.db, request, reply, {}, (db, accountId) =>
      db
        .delete(memories)
        .where(and(eq(memories.id, id), inArray(memories.gosinoId, exemplarsOf(db, accountId))))
        .returning({ id: memories.id }),
    );
    if (gone === undefined) return reply;
    request.log.info({ memoryId: id, existed: gone.length > 0 }, "memory destroyed");
    return reply.send({ destroyed: gone.length > 0 });
  });

  /**
   * Un ricordo scritto a mano (ADR-104).
   *
   * `archive.ts` sapeva **correggere** e **buttare** un ricordo da mesi, e non
   * sapeva scriverne uno: l'unico modo di dire a UGO una cosa che deve sapere
   * era parlargliene e sperare che il sogno la distillasse. Il vettore si
   * calcola qui quando c'è un embedder, **fuori dalla transazione**: una
   * chiamata di rete non tiene aperta la transazione che ha dichiarato la casa
   * (ADR-062).
   */
  app.post("/v1/memories", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = writeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const body = parsed.data;

    let vector: number[] | undefined;
    if (deps.embedder !== undefined) {
      try {
        vector = (await deps.embedder.embed([body.text]))[0];
      } catch (error) {
        request.log.warn(error, "memory embedding failed: the memory is written anyway");
      }
    }

    const written = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const who = body.gosinoId ?? deps.registry?.resolve(undefined, accountId)?.id;
        if (who === undefined) return "no-gosino" as const;
        const [owned] = await db
          .select({ id: gosini.id })
          .from(gosini)
          .where(and(eq(gosini.id, who), eq(gosini.accountId, accountId)));
        if (owned === undefined) return "no-gosino" as const;
        const [row] = await db
          .insert(memories)
          .values({
            gosinoId: who,
            kind: body.kind,
            // ADR-091: in chiaro come ogni altro ricordo. Cifrarlo qui lo
            // renderebbe non ripescabile e invisibile alla redazione dell'oblio
            text: body.text,
            ...(body.importance !== undefined && { importance: body.importance }),
            ...(body.validFrom !== undefined && { validFrom: new Date(body.validFrom) }),
            ...(vector !== undefined && { embedding: vector }),
            sourceRefs: { by: "owner" },
          })
          .returning({ id: memories.id });
        if (row === undefined) return "not-created" as const;
        await deps.audit.record(
          {
            verb: "memory_written",
            outcome: "ok",
            accountId,
            resourceType: "memory",
            resourceId: row.id,
          },
          db,
        );
        return row;
      },
    );
    if (written === undefined) return reply;
    if (written === "no-gosino") return reply.status(404).send({ error: "non esiste" });
    if (written === "not-created") return reply.status(500).send({ error: "not created" });
    return reply.status(201).send({ id: written.id, embedded: vector !== undefined });
  });
}
