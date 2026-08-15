import {
  customerGosini,
  customerMessages,
  customers,
  gosini,
  households,
  tickets,
  type DbClient,
} from "@ugo/db";
import type { LlmClient, LlmHistoryTurn } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { AuditLogger } from "../auditLog.js";
import type { CustomerContext } from "./customerAuth.js";
import type { CustomerQuota } from "./customerQuota.js";

/**
 * The reception's conversation (ADR-052/055). Reuses `LlmClient` — the one
 * provider chokepoint (rule 3) — on the `ticket` channel, where the second
 * cached block is the reception's rules. Everything customer-specific goes in
 * `dynamicSystem`, never in the cached blocks.
 */

export class GosinoNotAssignedError extends Error {}

const HISTORY_TURNS = 8;
const HISTORY_WINDOW_HOURS = 12;

/** wall 2's voice (ADR-055): declared, courteous, and never an error */
export const CUSTOMER_BUDGET_REPLY =
  "Per oggi ho esaurito il tempo che posso dedicarti; il ticket resta aperto e domani ci sono.";

/** the deterministic ticket shortcut: zero provider tokens (ADR-055) */
const TICKET_PREFIX = /^apri\s+(?:un\s+)?ticket[:\s]+(.+)$/is;

export interface HouseClock {
  timezone: string;
  locale: string;
}

export interface CustomerChatDeps {
  db: DbClient;
  dataKey: Buffer;
  quota: CustomerQuota;
  llmFor: (householdId: string, gosinoId: string, clock?: HouseClock) => LlmClient;
  audit?: AuditLogger;
}

export type CustomerChatResult =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "ok"; reply: string; degraded: boolean; cached: boolean; ticketId?: string };

export interface CustomerChatRequest {
  context: CustomerContext;
  gosinoId: string;
  text: string;
}

export class CustomerChatService {
  public constructor(private readonly deps: CustomerChatDeps) {}

  /** The gosini this customer may talk to — the picker's list. */
  public async assignedGosini(
    context: CustomerContext,
  ): Promise<{ id: string; name: string; locationLabel: string | null }[]> {
    return this.deps.db
      .select({ id: gosini.id, name: gosini.name, locationLabel: gosini.locationLabel })
      .from(customerGosini)
      .innerJoin(gosini, eq(gosini.id, customerGosini.gosinoId))
      .where(eq(customerGosini.customerId, context.customerId))
      .orderBy(gosini.bornAt);
  }

  public async handle(
    request: CustomerChatRequest,
    at: Date = new Date(),
  ): Promise<CustomerChatResult> {
    const { db, quota } = this.deps;
    const { context, gosinoId } = request;

    // 404 for a gosino that is not assigned — including one of another house
    const [assignment] = await db
      .select({ id: customerGosini.id })
      .from(customerGosini)
      .where(
        and(
          eq(customerGosini.customerId, context.customerId),
          eq(customerGosini.gosinoId, gosinoId),
        ),
      );
    if (assignment === undefined) throw new GosinoNotAssignedError(gosinoId);

    const verdict = await quota.check(context.customerId, at);
    if (!verdict.allowed && verdict.wall === "hourly") {
      // nothing is persisted: a refused knock must not tighten the quota
      return { kind: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds };
    }
    if (!verdict.allowed) {
      // wall 2: declared degradation, zero provider calls, the turn persists
      await this.persistTurns(request, CUSTOMER_BUDGET_REPLY, at, { degraded: true });
      return { kind: "ok", reply: CUSTOMER_BUDGET_REPLY, degraded: true, cached: false };
    }

    // the deterministic shortcut: an explicit "apri un ticket: ..." never
    // spends a token — the request is already in the customer's own words
    const shortcut = TICKET_PREFIX.exec(request.text.trim());
    if (shortcut?.[1] !== undefined) {
      const ticketId = await this.collectTicket(request, shortcut[1].trim(), at);
      const reply = "Fatto, ho aperto il ticket. Lo studio lo vedrà e ti aggiorno qui.";
      await this.persistTurns(request, reply, at, { ticketId });
      return { kind: "ok", reply, degraded: false, cached: false, ticketId };
    }

    const [house] = await db
      .select({ timezone: households.timezone, locale: households.locale })
      .from(households)
      .where(eq(households.id, context.householdId));
    const clock: HouseClock | undefined =
      house === undefined ? undefined : { timezone: house.timezone, locale: house.locale };

    const llm = this.deps.llmFor(context.householdId, gosinoId, clock);
    const result = await llm.chat(
      {
        channel: "ticket",
        dynamicSystem: await this.buildDynamicSystem(request, at),
        history: await this.loadHistory(request, at),
        userText: request.text,
      },
      at,
    );
    await this.persistTurns(request, result.text, at, {
      degraded: result.degraded,
      ...(result.usage !== undefined && {
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
      }),
      ...(result.costUsd !== undefined && { costUsd: result.costUsd }),
    });
    return { kind: "ok", reply: result.text, degraded: result.degraded, cached: false };
  }

  /** A ticket collected on the customer's explicit words (ADR-052). */
  public async collectTicket(
    request: CustomerChatRequest,
    text: string,
    at: Date,
  ): Promise<string> {
    const { db, dataKey, audit } = this.deps;
    const [firstLine = ""] = text.split("\n", 1);
    const title = firstLine.slice(0, 200) || "Richiesta dalla reception";
    const [row] = await db
      .insert(tickets)
      .values({
        householdId: request.context.householdId,
        customerId: request.context.customerId,
        gosinoId: request.gosinoId,
        title: encryptText(title, dataKey),
        body: encryptText(text, dataKey),
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: tickets.id });
    if (row === undefined) throw new Error("ticket was not persisted");
    await audit?.record({
      verb: "ticket_created",
      outcome: "ok",
      householdId: request.context.householdId,
      resourceType: "ticket",
      resourceId: row.id,
    });
    return row.id;
  }

  /** blocks 3+ of the prompt: the customer's world, never cached (rule 2) */
  private async buildDynamicSystem(request: CustomerChatRequest, at: Date): Promise<string> {
    const { db, dataKey } = this.deps;
    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, request.context.customerId));
    const openTickets = await db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status })
      .from(tickets)
      .where(
        and(eq(tickets.customerId, request.context.customerId), ne(tickets.status, "closed")),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(10);
    const lines = [
      `Sei alla reception con il cliente «${customer?.name ?? "cliente"}». Ora: ${at.toISOString()}.`,
    ];
    if (openTickets.length > 0) {
      lines.push("Ticket aperti del cliente:");
      for (const ticket of openTickets) {
        let title: string;
        try {
          title = decryptText(ticket.title, dataKey);
        } catch {
          continue;
        }
        lines.push(`- [${ticket.status}] ${title}`);
      }
    } else {
      lines.push("Il cliente non ha ticket aperti al momento.");
    }
    return lines.join("\n");
  }

  private async loadHistory(
    request: CustomerChatRequest,
    at: Date,
  ): Promise<LlmHistoryTurn[]> {
    const { db, dataKey } = this.deps;
    const windowStart = new Date(at.getTime() - HISTORY_WINDOW_HOURS * 3_600_000);
    const rows = await db
      .select({ role: customerMessages.role, text: customerMessages.text })
      .from(customerMessages)
      .where(
        and(
          eq(customerMessages.customerId, request.context.customerId),
          eq(customerMessages.gosinoId, request.gosinoId),
          gt(customerMessages.ts, windowStart),
        ),
      )
      .orderBy(desc(customerMessages.ts))
      .limit(HISTORY_TURNS);
    const history: LlmHistoryTurn[] = [];
    for (const row of rows.reverse()) {
      if (row.role !== "user" && row.role !== "assistant") continue;
      try {
        history.push({ role: row.role, content: decryptText(row.text, dataKey) });
      } catch {
        // unreadable turn (rotated key): the conversation goes on without it
      }
    }
    return history;
  }

  private async persistTurns(
    request: CustomerChatRequest,
    reply: string,
    at: Date,
    extra: {
      degraded?: boolean;
      cached?: boolean;
      ticketId?: string;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
    } = {},
  ): Promise<void> {
    const { db, dataKey } = this.deps;
    const base = {
      householdId: request.context.householdId,
      customerId: request.context.customerId,
      gosinoId: request.gosinoId,
      ...(extra.ticketId !== undefined && { ticketId: extra.ticketId }),
    };
    await db.insert(customerMessages).values([
      {
        ...base,
        ts: at,
        role: "user",
        text: encryptText(request.text, dataKey),
      },
      {
        ...base,
        // one ms later, so history ordering never interleaves the pair
        ts: new Date(at.getTime() + 1),
        role: "assistant",
        text: encryptText(reply, dataKey),
        tokensIn: extra.tokensIn ?? 0,
        tokensOut: extra.tokensOut ?? 0,
        costUsd: (extra.costUsd ?? 0).toFixed(6),
        cached: extra.cached ?? false,
      },
    ]);
  }
}
