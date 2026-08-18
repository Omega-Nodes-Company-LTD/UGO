import { timingSafeEqual } from "node:crypto";
import {
  customerDocuments,
  customerMailAccounts,
  customerRepos,
  customers,
  customerMessages,
  tickets,
  type DbClient,
} from "@ugo/db";
import {
  decryptText,
  encryptText,
  receptionChatRequestSchema,
  receptionGuidePdfRequestSchema,
  receptionRewardRequestSchema,
  receptionTicketCreateSchema,
  receptionTicketReplySchema,
} from "@ugo/shared";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuditLogger } from "../services/auditLog.js";
import { CustomerResolver, type CustomerContext } from "../services/reception/customerAuth.js";
import type { CustomerChatService } from "../services/reception/customerChatService.js";
import { GosinoNotAssignedError } from "../services/reception/customerChatService.js";
import {
  RewardExhaustedError,
  type CustomerRewardService,
} from "../services/reception/customerReward.js";
import type { GithubLiveService } from "../services/reception/githubLiveService.js";
import { renderGuidePdf } from "../services/reception/guidePdf.js";

/**
 * The reception's door into soul (ADR-051/052): the only routes a customer
 * token opens, and they open ONLY with both credentials together —
 *
 *  - `Authorization: Bearer <UGO_RECEPTION_TOKEN>`: the reception service
 *    itself, a dedicated secret that is NOT `UGO_INTERNAL_TOKEN`;
 *  - `X-Reception-Customer: <token>`: the customer, resolved here in soul,
 *    where the hashes live next to the data they unlock.
 *
 * A missing half answers 401 and audits `denied`. Anything of another
 * customer answers 404, never 403 (BOLA).
 */

declare module "fastify" {
  interface FastifyRequest {
    /** the customer at the reception, set only on /v1/reception/* routes */
    receptionCustomer: CustomerContext | null;
  }
}

export interface ReceptionDeps {
  db: DbClient;
  /** the reception service secret; routes stay unregistered without it */
  receptionToken: string;
  chat: CustomerChatService;
  dataKey: Buffer;
  audit?: AuditLogger;
  /** ADR-054: lo stato vivo per la pagina «I lavori» */
  github?: GithubLiveService;
  /** ADR-058: la mela del cliente, contata da Postgres */
  reward: CustomerRewardService;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function problem(reply: FastifyReply, status: number, title: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

export function registerReceptionRoutes(app: FastifyInstance, deps: ReceptionDeps): void {
  const resolver = new CustomerResolver(deps.db);

  app.decorateRequest("receptionCustomer", null);

  const gate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization ?? "";
    const service = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const customerHeader = request.headers["x-reception-customer"];
    const customerToken = typeof customerHeader === "string" ? customerHeader : "";
    const context =
      service !== "" && equals(service, deps.receptionToken)
        ? await resolver.resolve(customerToken)
        : undefined;
    if (context === undefined) {
      request.log.warn({ url: request.url }, "unauthorized attempt on the reception");
      await deps.audit?.record({
        verb: "denied",
        outcome: "denied",
        resourceType: "route",
        resourceId: request.url,
      });
      await problem(reply, 401, "Unauthorized");
      return;
    }
    request.receptionCustomer = context;
  };

  /** who am I, and who may I talk to — the picker's data */
  app.get("/v1/reception/me", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const [customer] = await deps.db
      .select({ id: customers.id, name: customers.name, slug: customers.slug })
      .from(customers)
      .where(eq(customers.id, context.customerId));
    return {
      customer,
      gosini: await deps.chat.assignedGosini(context),
      // le mele residue arrivano con l'identità: la reception le mostra
      // accanto al bottone senza una chiamata in più
      rewards: await deps.reward.allowance(context.customerId),
    };
  });

  /**
   * ADR-058, il muro del cliente: la mela. Deliberata come quella sul muso —
   * si premia l'ultima risposta di UN gosino, non «il servizio» — e limitata:
   * a mele finite risponde 429 con il momento in cui la prossima torna, che è
   * l'unico onesto «riprova più tardi» che si possa dire.
   */
  app.post("/v1/reception/reward", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const parsed = receptionRewardRequestSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    try {
      const rewards = await deps.reward.give(context, parsed.data.gosinoId);
      await deps.audit?.record({
        verb: "customer_reward_given",
        outcome: "ok",
        accountId: context.accountId,
        resourceType: "gosino",
        resourceId: parsed.data.gosinoId,
      });
      return await reply.code(201).send({ rewards });
    } catch (error) {
      if (error instanceof GosinoNotAssignedError) return problem(reply, 404, "Not Found");
      if (error instanceof RewardExhaustedError) {
        return reply
          .code(429)
          .type("application/problem+json")
          .send({
            type: "about:blank",
            title: "Too Many Requests",
            status: 429,
            detail: "Le mele della settimana sono finite: tienile per le risposte davvero ottime.",
            ...(error.nextAt !== undefined && { nextAt: error.nextAt.toISOString() }),
          });
      }
      throw error;
    }
  });

  app.post("/v1/reception/chat", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const parsed = receptionChatRequestSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    try {
      const result = await deps.chat.handle({
        context,
        gosinoId: parsed.data.gosinoId,
        text: parsed.data.text,
      });
      if (result.kind === "rate_limited") {
        return await reply
          .code(429)
          .header("retry-after", String(result.retryAfterSeconds))
          .type("application/problem+json")
          .send({
            type: "about:blank",
            title: "Too Many Requests",
            status: 429,
            detail: "Ho bisogno di riprendere fiato: riprova fra un po'.",
          });
      }
      return {
        reply: result.reply,
        degraded: result.degraded,
        cached: result.cached,
        ...(result.ticketId !== undefined && { ticketId: result.ticketId }),
        ...(result.guide !== undefined && { guide: result.guide }),
      };
    } catch (error) {
      if (error instanceof GosinoNotAssignedError) return problem(reply, 404, "Not Found");
      throw error;
    }
  });

  /**
   * La guida come PDF: impaginazione del testo che il cliente HA GIÀ nel
   * thread — zero token, niente quota (non è una domanda), niente storage
   * (il contenuto vive già cifrato in `customer_messages`). Stessa doppia
   * credenziale di tutto il resto.
   */
  app.post("/v1/reception/guide-pdf", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const parsed = receptionGuidePdfRequestSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const [customer] = await deps.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, context.customerId));
    const pdf = await renderGuidePdf({
      text: parsed.data.text,
      customerName: customer?.name ?? "il cliente",
    });
    return reply
      .type("application/pdf")
      .header("content-disposition", 'attachment; filename="guida.pdf"')
      .send(pdf);
  });

  /** the state of the work — the «I lavori» page (ADR-054) */
  app.get("/v1/reception/works", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const [repos, documents, mail] = await Promise.all([
      deps.db
        .select({
          remoteUrl: customerRepos.remoteUrl,
          defaultBranch: customerRepos.defaultBranch,
          lastCommitSha: customerRepos.lastCommitSha,
          lastIndexedAt: customerRepos.lastIndexedAt,
          status: customerRepos.status,
        })
        .from(customerRepos)
        .where(eq(customerRepos.customerId, context.customerId))
        .orderBy(asc(customerRepos.createdAt)),
      deps.db
        .select({ count: sql<string>`count(*)` })
        .from(customerDocuments)
        .where(eq(customerDocuments.customerId, context.customerId)),
      deps.db
        .select({ count: sql<string>`count(*)` })
        .from(customerMailAccounts)
        .where(eq(customerMailAccounts.customerId, context.customerId)),
    ]);
    const live = await deps.github?.liveBlock(context.customerId);
    return {
      repos: repos.map((repo) => ({
        ...repo,
        lastIndexedAt: repo.lastIndexedAt?.toISOString() ?? null,
      })),
      documents: Number(documents[0]?.count ?? 0),
      mailAccounts: Number(mail[0]?.count ?? 0),
      ...(live !== undefined && { live }),
    };
  });

  /** the conversation history — the «Le conversazioni» page */
  app.get("/v1/reception/messages", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const query = request.query as { gosino?: string; before?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? "30") || 30, 100);
    const filters = [eq(customerMessages.customerId, context.customerId)];
    if (query.gosino !== undefined) filters.push(eq(customerMessages.gosinoId, query.gosino));
    if (query.before !== undefined) {
      const before = new Date(query.before);
      if (!Number.isNaN(before.getTime())) filters.push(lt(customerMessages.ts, before));
    }
    const rows = await deps.db
      .select({
        id: customerMessages.id,
        gosinoId: customerMessages.gosinoId,
        ticketId: customerMessages.ticketId,
        ts: customerMessages.ts,
        role: customerMessages.role,
        text: customerMessages.text,
        cached: customerMessages.cached,
      })
      .from(customerMessages)
      .where(and(...filters))
      .orderBy(desc(customerMessages.ts))
      .limit(limit);
    return {
      messages: rows.reverse().map((row) => ({
        id: row.id,
        gosinoId: row.gosinoId,
        ticketId: row.ticketId,
        ts: row.ts.toISOString(),
        role: row.role,
        text: safeDecrypt(row.text, deps.dataKey),
        cached: row.cached,
      })),
    };
  });

  /** the customer's tickets — theirs, and nobody else's */
  app.get("/v1/reception/tickets", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const rows = await deps.db
      .select({
        id: tickets.id,
        gosinoId: tickets.gosinoId,
        status: tickets.status,
        title: tickets.title,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(eq(tickets.customerId, context.customerId))
      .orderBy(asc(tickets.createdAt));
    return {
      tickets: rows.map((row) => ({
        ...row,
        title: safeDecrypt(row.title, deps.dataKey),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  });

  app.post("/v1/reception/tickets", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const parsed = receptionTicketCreateSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    try {
      const ticketId = await deps.chat.collectTicket(
        { context, gosinoId: parsed.data.gosinoId, text: parsed.data.body },
        `${parsed.data.title}\n${parsed.data.body}`,
        new Date(),
      );
      return await reply.code(201).send({ id: ticketId });
    } catch (error) {
      if (error instanceof GosinoNotAssignedError) return problem(reply, 404, "Not Found");
      throw error;
    }
  });

  app.get("/v1/reception/tickets/:id", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const { id } = request.params as { id: string };
    const [ticket] = await deps.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.customerId, context.customerId)));
    if (ticket === undefined) return problem(reply, 404, "Not Found");
    const conversation = await deps.db
      .select({
        role: customerMessages.role,
        text: customerMessages.text,
        ts: customerMessages.ts,
      })
      .from(customerMessages)
      .where(eq(customerMessages.ticketId, ticket.id))
      .orderBy(asc(customerMessages.ts));
    return {
      id: ticket.id,
      gosinoId: ticket.gosinoId,
      status: ticket.status,
      title: safeDecrypt(ticket.title, deps.dataKey),
      body: safeDecrypt(ticket.body, deps.dataKey),
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages: conversation.map((message) => ({
        role: message.role,
        text: safeDecrypt(message.text, deps.dataKey),
        ts: message.ts.toISOString(),
      })),
    };
  });

  /** replying reopens a closed ticket to `waiting` (ADR-052) */
  app.post("/v1/reception/tickets/:id/reply", { preHandler: gate }, async (request, reply) => {
    const context = request.receptionCustomer;
    if (context === null) return problem(reply, 401, "Unauthorized");
    const { id } = request.params as { id: string };
    const parsed = receptionTicketReplySchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const [ticket] = await deps.db
      .select({ id: tickets.id, gosinoId: tickets.gosinoId, status: tickets.status })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.customerId, context.customerId)));
    if (ticket === undefined) return problem(reply, 404, "Not Found");
    const at = new Date();
    await deps.db.insert(customerMessages).values({
      accountId: context.accountId,
      customerId: context.customerId,
      gosinoId: ticket.gosinoId,
      ticketId: ticket.id,
      ts: at,
      role: "user",
      text: encryptText(parsed.data.text, deps.dataKey),
    });
    if (ticket.status === "closed") {
      await deps.db
        .update(tickets)
        .set({ status: "waiting", updatedAt: at, closedAt: null })
        .where(eq(tickets.id, ticket.id));
    } else {
      await deps.db.update(tickets).set({ updatedAt: at }).where(eq(tickets.id, ticket.id));
    }
    return reply.code(204).send();
  });
}

function safeDecrypt(value: string, key: Buffer): string {
  try {
    return decryptText(value, key);
  } catch {
    return "[non decifrabile con la chiave corrente]";
  }
}
