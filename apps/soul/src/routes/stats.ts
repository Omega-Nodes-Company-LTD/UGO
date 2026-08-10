import { budgetLedger, events, memories, messages, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Operational visibility (SECURITY_COMPLIANCE §2: incident handling needs
 * something to look at). Counts and money only — never contents, never PII,
 * so it is safe to read from the debug page or a phone on the tailnet.
 *
 * The cache-hit ratio is the number that decides whether the §5.5 discipline
 * is actually paying: cached input tokens over total input tokens.
 */

export interface StatsDeps {
  db: DbClient;
  dailyBudgetUsd: number;
  timezone: string;
  guard: PreHandler;
}

export function registerStatsRoute(app: FastifyInstance, deps: StatsDeps): void {
  // guarded: spend, counts and dream activity together describe when the
  // house is awake and how much it talks — operational, but nobody else's
  app.get("/v1/stats", { preHandler: deps.guard }, async (_request, reply) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: deps.timezone }).format(new Date());

    const [spend] = await deps.db
      .select({
        costUsd: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)`,
        calls: sql<string>`count(*)`,
        tokensIn: sql<string>`coalesce(sum(${budgetLedger.tokensIn}), 0)`,
        tokensOut: sql<string>`coalesce(sum(${budgetLedger.tokensOut}), 0)`,
        cacheRead: sql<string>`coalesce(sum(${budgetLedger.tokensCacheRead}), 0)`,
        cacheWrite: sql<string>`coalesce(sum(${budgetLedger.tokensCacheWrite}), 0)`,
      })
      .from(budgetLedger)
      .where(eq(budgetLedger.date, today));

    const [lifetime] = await deps.db
      .select({
        cacheRead: sql<string>`coalesce(sum(${budgetLedger.tokensCacheRead}), 0)`,
        tokensIn: sql<string>`coalesce(sum(${budgetLedger.tokensIn}), 0)`,
      })
      .from(budgetLedger);

    const [counts] = await deps.db
      .select({
        memories: sql<string>`(select count(*) from ${memories})`,
        messages: sql<string>`(select count(*) from ${messages})`,
        events: sql<string>`(select count(*) from ${events})`,
      })
      .from(sql`(select 1) as _`);

    const [lastDream] = await deps.db
      .select({ ts: events.ts, payload: events.payload })
      .from(events)
      .where(eq(events.type, "dream_step_completed"))
      .orderBy(desc(events.ts))
      .limit(1);

    const spentToday = Number(spend?.costUsd ?? 0);
    const totalIn = Number(lifetime?.tokensIn ?? 0);
    const cacheRatio = totalIn === 0 ? null : Number(lifetime?.cacheRead ?? 0) / totalIn;

    return reply.send({
      date: today,
      budget: {
        spentUsd: Number(spentToday.toFixed(6)),
        limitUsd: deps.dailyBudgetUsd,
        remainingUsd: Number(Math.max(0, deps.dailyBudgetUsd - spentToday).toFixed(6)),
        degraded: spentToday >= deps.dailyBudgetUsd,
        callsToday: Number(spend?.calls ?? 0),
      },
      tokensToday: {
        input: Number(spend?.tokensIn ?? 0),
        output: Number(spend?.tokensOut ?? 0),
        cacheRead: Number(spend?.cacheRead ?? 0),
        cacheWrite: Number(spend?.cacheWrite ?? 0),
      },
      /** share of billed input served from the cached prefix (§5.5) */
      cacheHitRatio: cacheRatio === null ? null : Number(cacheRatio.toFixed(4)),
      counts: {
        memories: Number(counts?.memories ?? 0),
        messages: Number(counts?.messages ?? 0),
        events: Number(counts?.events ?? 0),
      },
      lastDream:
        lastDream === undefined
          ? null
          : { at: lastDream.ts.toISOString(), step: lastDream.payload },
    });
  });
}
