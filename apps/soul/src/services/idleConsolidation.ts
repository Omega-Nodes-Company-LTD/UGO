import { events, messages, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

/**
 * Sleep-time compute (backlog gruppo 1, ADR-025): when nobody has been around
 * for a while, UGO uses the quiet to tidy what he knows instead of waiting for
 * the small hours.
 *
 * It is deliberately the same shape as `SolitudeMonitor`: read the last sign
 * of company, compare it to now, and use the append-only events table as the
 * idempotency marker. A restart cannot double-fire, and the night job sees the
 * request in the day's events like any other fact of life.
 *
 * What it triggers is the *light* dream — consolidation only. The transport is
 * the runner URL the manual trigger already uses; nothing new is opened.
 */

const MINUTE_MS = 60_000;

/** Anything that means "someone is here with me" (same list as solitude). */
const PRESENCE_EVENT_TYPES = ["face_seen", "tap", "heard_text", "lead_contact"] as const;

export interface IdleConsolidationOptions {
  /** How long the house must be quiet before it is worth thinking. */
  idleMinutes: number;
  /** Don't step on the real dream: stay away from its hour by this much. */
  nightGuardMinutes: number;
  /** `UGO_DREAM_AT`, HH:MM in the configured timezone. */
  dreamAt: string;
  timezone: string;
}

export interface IdleConsolidationDeps {
  db: DbClient;
  /**
   * Whose quiet this is (ADR-019 phase 2). Unscoped, a house being busy kept
   * the neighbours' creature from ever consolidating, and one marker stood for
   * everybody.
   */
  gosinoId: string;
  options: IdleConsolidationOptions;
  /** The jobs runner; without one the request is only recorded. */
  trigger?: (mode: "light") => Promise<void>;
  logger?: { warn: (payload: object, message: string) => void };
}

export interface IdleTickReport {
  requested: boolean;
  reason: "quiet" | "too-soon" | "already-done" | "near-the-dream" | "never-seen-anyone";
}

/** Minutes from midnight, in the house's own timezone. */
function minutesOfDay(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export class IdleConsolidation {
  public constructor(private readonly deps: IdleConsolidationDeps) {}

  private async lastContact(): Promise<Date | undefined> {
    const { db } = this.deps;
    const [presence, spoken] = await Promise.all([
      db
        .select({ ts: events.ts })
        .from(events)
        .where(
          and(
            inArray(events.type, [...PRESENCE_EVENT_TYPES]),
            eq(events.gosinoId, this.deps.gosinoId),
          ),
        )
        .orderBy(desc(events.ts))
        .limit(1),
      db
        .select({ ts: messages.ts })
        .from(messages)
        .where(and(eq(messages.role, "user"), eq(messages.gosinoId, this.deps.gosinoId)))
        .orderBy(desc(messages.ts))
        .limit(1),
    ]);
    return [presence[0]?.ts, spoken[0]?.ts]
      .filter((value): value is Date => value !== undefined)
      .reduce<Date | undefined>(
        (latest, value) => (latest === undefined || value > latest ? value : latest),
        undefined,
      );
  }

  /** At most one request per stretch of quiet. */
  private async alreadyRequested(since: Date): Promise<boolean> {
    const rows = await this.deps.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.gosinoId, this.deps.gosinoId),
          sql`${events.type} = 'idle_consolidation_requested' and ${events.ts} >= ${since.toISOString()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Within this many minutes of `UGO_DREAM_AT` the light run stands down: the
   * real dream is about to do the same work and more, and two of them racing
   * would be two of them paying.
   */
  private nearTheDream(at: Date): boolean {
    const { dreamAt, timezone, nightGuardMinutes } = this.deps.options;
    const [hours = "0", minutes = "0"] = dreamAt.split(":");
    const dreamMinute = Number(hours) * 60 + Number(minutes);
    const nowMinute = minutesOfDay(at, timezone);
    const distance = Math.abs(nowMinute - dreamMinute);
    // the clock wraps: 23:50 is ten minutes from 00:00, not 1430
    return Math.min(distance, 1440 - distance) <= nightGuardMinutes;
  }

  public async tick(at: Date = new Date()): Promise<IdleTickReport> {
    const { db, options, trigger, logger } = this.deps;

    const contact = await this.lastContact();
    if (contact === undefined) {
      // an empty house that has never seen anyone has nothing to consolidate
      return { requested: false, reason: "never-seen-anyone" };
    }
    const quietFor = at.getTime() - contact.getTime();
    if (quietFor < options.idleMinutes * MINUTE_MS) {
      return { requested: false, reason: "too-soon" };
    }
    if (this.nearTheDream(at)) {
      return { requested: false, reason: "near-the-dream" };
    }
    if (await this.alreadyRequested(contact)) {
      return { requested: false, reason: "already-done" };
    }

    await db.insert(events).values({
      gosinoId: this.deps.gosinoId,
      ts: at,
      source: "system",
      type: "idle_consolidation_requested",
      payload: { quietMinutes: Math.round(quietFor / MINUTE_MS) },
    });

    if (trigger !== undefined) {
      try {
        await trigger("light");
      } catch (error) {
        // the marker stays: a runner that is down should not make UGO retry
        // every fifteen minutes for the rest of a quiet afternoon
        logger?.warn({ err: String(error) }, "idle consolidation trigger unreachable");
      }
    }
    return { requested: true, reason: "quiet" };
  }
}
