import {
  customerAccessTokens,
  customerGosini,
  customerMessages,
  customerRewards,
  customers,
  gosini,
  tickets,
  type DbClient,
} from "@ugo/db";
import { TICKET_STATUSES, decryptText, encryptText } from "@ugo/shared";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import {
  issueCustomerToken,
  revokeCustomerToken,
} from "../services/reception/customerAuth.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";
import { forgetCustomer } from "../services/privacy/forgetCustomer.js";
import type { AudioStorageConfig } from "./audio.js";

/**
 * The house side of the reception (ADR-052): who the customers are, which
 * gosini they may talk to, their tokens and their tickets. Owner/operator
 * only — `accountScope({ requireAdmin: true })` — and everything of another
 * house answers 404, never 403 (BOLA).
 */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(4000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(4000).nullable().optional(),
  dailyBudgetUsd: z.number().positive().nullable().optional(),
  hourlyMessageLimit: z.number().int().positive().nullable().optional(),
  /** ADR-058: mele in sette giorni; 0 è legittimo (cliente senza mele), null = default */
  weeklyRewardLimit: z.number().int().min(0).nullable().optional(),
  archived: z.boolean().optional(),
});

const assignSchema = z.object({ gosinoIds: z.array(z.uuid()).max(20) });
const tokenSchema = z.object({
  label: z.string().min(1).max(120),
  expiresAt: z.coerce.date().optional(),
});
const statusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

function slugOf(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "cliente"
  );
}

function problem(reply: FastifyReply, status: number, title: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

function safeDecrypt(value: string | null, key: Buffer): string | null {
  if (value === null || value === "") return value;
  try {
    return decryptText(value, key);
  } catch {
    return "[non decifrabile con la chiave corrente]";
  }
}

export interface CustomersDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  audit?: AuditLogger;
  /** ADR-093: senza, l'oblio di un cliente con documenti si rifiuta */
  docsStorage?: AudioStorageConfig;
}

export function registerCustomersRoutes(app: FastifyInstance, deps: CustomersDeps): void {
  const { db, guard, dataKey, audit } = deps;
  const admin = { preHandler: guard };
  const scope = (request: Parameters<PreHandler>[0], reply: FastifyReply): Promise<string | undefined> =>
    accountScope(db, request, reply, { requireAdmin: true });

  /** one customer of THIS house, or undefined (the caller answers 404) */
  const mine = async (accountId: string, customerId: string) => {
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)));
    return row;
  };

  app.get("/v1/customers", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.accountId, accountId))
      .orderBy(asc(customers.createdAt));
    const counts = await db
      .select({
        customerId: tickets.customerId,
        status: tickets.status,
        count: sql<string>`count(*)`,
      })
      .from(tickets)
      .where(eq(tickets.accountId, accountId))
      .groupBy(tickets.customerId, tickets.status);
    return {
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        dailyBudgetUsd: row.dailyBudgetUsd,
        hourlyMessageLimit: row.hourlyMessageLimit,
        knowledgeEpoch: row.knowledgeEpoch,
        createdAt: row.createdAt.toISOString(),
        archivedAt: row.archivedAt?.toISOString() ?? null,
        openTickets: counts
          .filter((count) => count.customerId === row.id && count.status !== "closed")
          .reduce((total, count) => total + Number(count.count), 0),
      })),
    };
  });

  app.post("/v1/customers", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const base = slugOf(parsed.data.name);
    // a duplicate name is human; a failed insert is not the way to say it
    const taken = await db
      .select({ slug: customers.slug })
      .from(customers)
      .where(eq(customers.accountId, accountId));
    const slugs = new Set(taken.map((row) => row.slug));
    let slug = base;
    for (let n = 2; slugs.has(slug); n += 1) slug = `${base}-${String(n)}`;
    const [row] = await db
      .insert(customers)
      .values({
        accountId,
        name: parsed.data.name,
        slug,
        ...(parsed.data.notes !== undefined && {
          notes: encryptText(parsed.data.notes, dataKey),
        }),
      })
      .returning({ id: customers.id });
    if (row === undefined) return problem(reply, 500, "Internal Server Error");
    await audit?.record({
      verb: "customer_created",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "customer",
      resourceId: row.id,
    });
    return reply.code(201).send({ id: row.id, slug });
  });

  app.get("/v1/customers/:id", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const [assigned, tokens, [givenThisWeek]] = await Promise.all([
      db
        .select({ id: gosini.id, name: gosini.name, locationLabel: gosini.locationLabel })
        .from(customerGosini)
        .innerJoin(gosini, eq(gosini.id, customerGosini.gosinoId))
        .where(eq(customerGosini.customerId, id))
        .orderBy(asc(gosini.bornAt)),
      db
        .select({
          id: customerAccessTokens.id,
          label: customerAccessTokens.label,
          createdAt: customerAccessTokens.createdAt,
          lastUsedAt: customerAccessTokens.lastUsedAt,
          expiresAt: customerAccessTokens.expiresAt,
          revokedAt: customerAccessTokens.revokedAt,
        })
        .from(customerAccessTokens)
        .where(eq(customerAccessTokens.customerId, id))
        .orderBy(asc(customerAccessTokens.createdAt)),
      // ADR-058: la stessa finestra mobile del muro — il pannello mostra il
      // conteggio che la reception applica, non un altro
      db
        .select({ count: sql<string>`count(*)` })
        .from(customerRewards)
        .where(and(eq(customerRewards.customerId, id), gt(customerRewards.ts, weekAgo))),
    ]);
    return {
      id: customer.id,
      name: customer.name,
      slug: customer.slug,
      notes: safeDecrypt(customer.notes, dataKey),
      dailyBudgetUsd: customer.dailyBudgetUsd,
      hourlyMessageLimit: customer.hourlyMessageLimit,
      weeklyRewardLimit: customer.weeklyRewardLimit,
      rewardsThisWeek: Number(givenThisWeek?.count ?? 0),
      knowledgeEpoch: customer.knowledgeEpoch,
      createdAt: customer.createdAt.toISOString(),
      archivedAt: customer.archivedAt?.toISOString() ?? null,
      gosini: assigned,
      tokens: tokens.map((token) => ({
        id: token.id,
        label: token.label,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
      })),
    };
  });

  app.patch("/v1/customers/:id", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const data = parsed.data;
    await db
      .update(customers)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.notes !== undefined && {
          notes: data.notes === null ? null : encryptText(data.notes, dataKey),
        }),
        ...(data.dailyBudgetUsd !== undefined && {
          dailyBudgetUsd: data.dailyBudgetUsd === null ? null : data.dailyBudgetUsd.toFixed(4),
        }),
        ...(data.hourlyMessageLimit !== undefined && {
          hourlyMessageLimit: data.hourlyMessageLimit,
        }),
        ...(data.weeklyRewardLimit !== undefined && {
          weeklyRewardLimit: data.weeklyRewardLimit,
        }),
        ...(data.archived !== undefined && {
          archivedAt: data.archived ? new Date() : null,
        }),
      })
      .where(eq(customers.id, id));
    if (data.archived === true) {
      await audit?.record({
        verb: "customer_archived",
        outcome: "ok",
        accountId,
        actor: request.tenant,
        resourceType: "customer",
        resourceId: id,
      });
    }
    return reply.code(204).send();
  });

  /** the whole assignment in one act: what you see is what there is */
  app.put("/v1/customers/:id/gosini", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    // a foreign gosino answers 404: probing teaches nothing (BOLA)
    if (parsed.data.gosinoIds.length > 0) {
      const owned = await db
        .select({ id: gosini.id })
        .from(gosini)
        .where(
          and(eq(gosini.accountId, accountId), inArray(gosini.id, parsed.data.gosinoIds)),
        );
      if (owned.length !== parsed.data.gosinoIds.length) {
        return problem(reply, 404, "Not Found");
      }
    }
    await db.delete(customerGosini).where(eq(customerGosini.customerId, id));
    if (parsed.data.gosinoIds.length > 0) {
      await db.insert(customerGosini).values(
        parsed.data.gosinoIds.map((gosinoId) => ({
          accountId,
          customerId: id,
          gosinoId,
        })),
      );
    }
    return reply.code(204).send();
  });

  /**
   * L'oblio di un cliente (ADR-093) — l'atto che ADR-052 prometteva e che non
   * aveva né rotta né bottone: una richiesta GDPR si evadeva a mano su psql.
   *
   * Chiede il **nome scritto**, come il congedo (ADR-075) e come «dimentica
   * qualcuno» sul muso: un click solo non è un consenso a una cosa
   * irreversibile — e questa cancella anche i documenti dal bucket.
   */
  app.delete("/v1/customers/:id", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const body = z.object({ confirmName: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return problem(reply, 400, "Serve confirmName: scrivi il nome del cliente");

    const row = await mine(accountId, id);
    if (row === undefined) return problem(reply, 404, "Cliente non trovato");
    const clean = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, " ");
    if (clean(body.data.confirmName) !== clean(row.name)) {
      return problem(reply, 400, `Scrivi «${row.name}» per confermare: da qui non si torna indietro`);
    }

    const trail = {
      verb: "customer_forgotten",
      accountId,
      actor: request.tenant,
      resourceType: "customer",
      resourceId: id,
    } as const;
    try {
      const report = await forgetCustomer(db, id, accountId, deps.docsStorage);
      await audit?.record({ ...trail, outcome: "ok" });
      return await reply.send(report);
    } catch (error) {
      await audit?.record({ ...trail, outcome: "error" });
      // la ragione arriva a chi deve rimediare: di solito è il bucket non
      // configurato con documenti ancora dentro
      return problem(reply, 409, error instanceof Error ? error.message : "oblio fallito");
    }
  });

  app.post("/v1/customers/:id/tokens", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const issued = await issueCustomerToken(db, {
      accountId,
      customerId: id,
      label: parsed.data.label,
      ...(parsed.data.expiresAt !== undefined && { expiresAt: parsed.data.expiresAt }),
    });
    await audit?.record({
      verb: "customer_token_issued",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "customer_token",
      resourceId: issued.id,
    });
    // the clear value exists in this response and never again
    return reply.code(201).send({ id: issued.id, token: issued.token });
  });

  app.delete("/v1/customers/:id/tokens/:tokenId", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id, tokenId } = request.params as { id: string; tokenId: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const [token] = await db
      .select({ id: customerAccessTokens.id })
      .from(customerAccessTokens)
      .where(
        and(
          eq(customerAccessTokens.id, tokenId),
          eq(customerAccessTokens.customerId, id),
        ),
      );
    if (token === undefined) return problem(reply, 404, "Not Found");
    await revokeCustomerToken(db, tokenId);
    await audit?.record({
      verb: "customer_token_revoked",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "customer_token",
      resourceId: tokenId,
    });
    return reply.code(204).send();
  });

  app.get("/v1/customers/:id/tickets", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const rows = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, id))
      .orderBy(desc(tickets.updatedAt));
    return {
      tickets: rows.map((row) => ({
        id: row.id,
        gosinoId: row.gosinoId,
        status: row.status,
        title: safeDecrypt(row.title, dataKey),
        body: safeDecrypt(row.body, dataKey),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
      })),
    };
  });

  /** triage: the owner moves the state, and the journal remembers who did */
  app.patch("/v1/tickets/:id", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const [ticket] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.accountId, accountId)));
    if (ticket === undefined) return problem(reply, 404, "Not Found");
    const at = new Date();
    await db
      .update(tickets)
      .set({
        status: parsed.data.status,
        updatedAt: at,
        closedAt: parsed.data.status === "closed" ? at : null,
      })
      .where(eq(tickets.id, id));
    await audit?.record({
      verb: "ticket_status_changed",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "ticket",
      resourceId: id,
    });
    return reply.code(204).send();
  });

  /** the numbers of the relationship: volume, spend, and who they talk to */
  app.get("/v1/customers/:id/stats", admin, async (request, reply) => {
    const accountId = await scope(request, reply);
    if (accountId === undefined) return reply;
    const { id } = request.params as { id: string };
    const customer = await mine(accountId, id);
    if (customer === undefined) return problem(reply, 404, "Not Found");
    const perGosino = await db
      .select({
        gosinoId: customerMessages.gosinoId,
        messages: sql<string>`count(*) filter (where ${customerMessages.role} = 'user')`,
        cached: sql<string>`count(*) filter (where ${customerMessages.cached})`,
        costUsd: sql<string>`coalesce(sum(${customerMessages.costUsd}), 0)`,
      })
      .from(customerMessages)
      .where(eq(customerMessages.customerId, id))
      .groupBy(customerMessages.gosinoId);
    const ticketCounts = await db
      .select({
        gosinoId: tickets.gosinoId,
        status: tickets.status,
        count: sql<string>`count(*)`,
      })
      .from(tickets)
      .where(eq(tickets.customerId, id))
      .groupBy(tickets.gosinoId, tickets.status);
    const names = await db
      .select({ id: gosini.id, name: gosini.name })
      .from(gosini)
      .where(eq(gosini.accountId, accountId));
    const nameOf = new Map(names.map((row) => [row.id, row.name]));
    return {
      perGosino: perGosino.map((row) => ({
        gosinoId: row.gosinoId,
        name: nameOf.get(row.gosinoId) ?? "?",
        messages: Number(row.messages),
        cachedReplies: Number(row.cached),
        costUsd: Number(row.costUsd),
        tickets: ticketCounts
          .filter((count) => count.gosinoId === row.gosinoId)
          .reduce((total, count) => total + Number(count.count), 0),
      })),
    };
  });
}
