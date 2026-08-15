import { timingSafeEqual } from "node:crypto";
import { customers, customerMessages, tickets, type DbClient } from "@ugo/db";
import {
  decryptText,
  encryptText,
  receptionChatRequestSchema,
  receptionTicketCreateSchema,
  receptionTicketReplySchema,
} from "@ugo/shared";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuditLogger } from "../services/auditLog.js";
import { CustomerResolver, type CustomerContext } from "../services/reception/customerAuth.js";
import type { CustomerChatService } from "../services/reception/customerChatService.js";
import { GosinoNotAssignedError } from "../services/reception/customerChatService.js";

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
    };
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
      };
    } catch (error) {
      if (error instanceof GosinoNotAssignedError) return problem(reply, 404, "Not Found");
      throw error;
    }
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
      householdId: context.householdId,
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
