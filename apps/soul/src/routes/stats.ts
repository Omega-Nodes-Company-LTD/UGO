import { budgetLedger, events, memories, messages, psycheSnapshots, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";
import { and, desc, eq, sql } from "drizzle-orm";

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
  /**
   * ADR-034: the mood series belongs to one creature. Spend, counts and dreams
   * do not — they are the household's (ADR-019) — so only the series narrows.
   */
  registry?: { resolve: (query: string | undefined) => { id: string } | undefined };
}

export function registerStatsRoute(app: FastifyInstance, deps: StatsDeps): void {
  // guarded: spend, counts and dream activity together describe when the
  // house is awake and how much it talks — operational, but nobody else's
  app.get("/v1/stats", { preHandler: deps.guard }, async (request, reply) => {
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

    // Two weeks of spend, so the panel can show a trend instead of a number
    // that means nothing without yesterday next to it.
    const history = await deps.db
      .select({
        date: budgetLedger.date,
        costUsd: sql<string>`sum(${budgetLedger.costUsd})`,
        calls: sql<string>`count(*)`,
      })
      .from(budgetLedger)
      .where(sql`${budgetLedger.date} >= current_date - interval '13 days'`)
      .groupBy(budgetLedger.date)
      .orderBy(budgetLedger.date);

    // The mood over the last two days: the one series that says what kind of
    // creature has been living here, rather than what it cost.
    // Scoped, because two exemplars snapshot into the same table: unfiltered,
    // this returned BOTH their moods interleaved as one series — not merely the
    // wrong creature's history but a chimera of two, which is why the
    // sparklines drew steps nobody had lived.
    // NB: `resolve` never answers undefined — it falls back to the eldest —
    // so the ABSENCE of the parameter has to be checked here. Absent means
    // the whole house (ADR-032), not "whoever is oldest".
    const asked = (request.query as { gosino?: string }).gosino;
    const who = asked === undefined || asked === "" ? undefined : deps.registry?.resolve(asked);
    const mood = await deps.db
      .select({ ts: psycheSnapshots.ts, vars: psycheSnapshots.vars, label: psycheSnapshots.label })
      .from(psycheSnapshots)
      .where(
        and(
          sql`${psycheSnapshots.ts} >= now() - interval '48 hours'`,
          who === undefined ? undefined : eq(psycheSnapshots.gosinoId, who.id),
        ),
      )
      .orderBy(psycheSnapshots.ts);

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
      history: history.map((row) => ({
        date: row.date,
        costUsd: Number(Number(row.costUsd).toFixed(6)),
        calls: Number(row.calls),
      })),
      mood: mood.map((row) => ({
        at: row.ts.toISOString(),
        vars: row.vars,
        label: row.label,
      })),
      lastDream:
        lastDream === undefined
          ? null
          : { at: lastDream.ts.toISOString(), step: lastDream.payload },
    });
  });
}
