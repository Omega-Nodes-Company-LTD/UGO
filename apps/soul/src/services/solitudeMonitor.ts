import { events, messages, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PsycheService } from "./psycheService.js";

/**
 * Emits the two time-based perturbations of PROGETTO §5.3 that no sensor can
 * produce: being alone for an hour, and being ignored for a whole day.
 * Without these, half of UGO's character (noia and umore drifting from
 * neglect) could never move.
 *
 * Both are journaled on the append-only events table, which doubles as the
 * idempotency marker: a restart cannot double-apply them, and the night job
 * sees the neglect in the day's events like any other fact of life.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Anything that means "someone is here with me". */
const PRESENCE_EVENT_TYPES = ["face_seen", "tap", "heard_text", "lead_contact"] as const;

export interface SolitudeMonitorDeps {
  db: DbClient;
  psyche: PsycheService;
  /**
   * Whose loneliness this is (ADR-015, ADR-019 phase 2). Unscoped, the monitor
   * read the whole database: somebody talking to the creature next door
   * counted as company here, and the marker written by one exemplar silenced
   * the clock for every other. One loop per exemplar is phase 3; this at least
   * makes the one that exists belong to somebody.
   */
  gosinoId: string;
}

export interface TickReport {
  solitudeApplied: boolean;
  ignoredApplied: boolean;
}

export class SolitudeMonitor {
  public constructor(private readonly deps: SolitudeMonitorDeps) {}

  private async lastTimestamp(table: "events" | "messages"): Promise<Date | undefined> {
    const { db } = this.deps;
    if (table === "events") {
      const rows = await db
        .select({ ts: events.ts })
        .from(events)
        .where(
          and(
            inArray(events.type, [...PRESENCE_EVENT_TYPES]),
            eq(events.gosinoId, this.deps.gosinoId),
          ),
        )
        .orderBy(desc(events.ts))
        .limit(1);
      return rows[0]?.ts;
    }
    const rows = await db
      .select({ ts: messages.ts })
      .from(messages)
      .where(and(eq(messages.role, "user"), eq(messages.gosinoId, this.deps.gosinoId)))
      .orderBy(desc(messages.ts))
      .limit(1);
    return rows[0]?.ts;
  }

  private async lastMarker(type: string, since: Date): Promise<boolean> {
    const rows = await this.deps.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.gosinoId, this.deps.gosinoId),
          sql`${events.type} = ${type} and ${events.ts} >= ${since.toISOString()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * One evaluation round. Safe to call as often as you like: the markers make
   * it a no-op until the corresponding stretch of loneliness has elapsed.
   */
  public async tick(at: Date = new Date()): Promise<TickReport> {
    const { db, psyche } = this.deps;
    const report: TickReport = { solitudeApplied: false, ignoredApplied: false };

    const [lastPresence, lastUserMessage] = await Promise.all([
      this.lastTimestamp("events"),
      this.lastTimestamp("messages"),
    ]);
    const lastContact = [lastPresence, lastUserMessage]
      .filter((value): value is Date => value !== undefined)
      .reduce<Date | undefined>((latest, value) => (latest === undefined || value > latest ? value : latest), undefined);

    // an hour alone: noia +0.05, at most once per hour
    if (lastContact !== undefined && at.getTime() - lastContact.getTime() >= HOUR_MS) {
      if (!(await this.lastMarker("solitude_hour", new Date(at.getTime() - HOUR_MS)))) {
        await db.insert(events).values({
          gosinoId: this.deps.gosinoId,
          ts: at,
          source: "system",
          type: "solitude_hour",
          payload: {},
        });
        await psyche.applyEventType("solitude_hour", at);
        report.solitudeApplied = true;
      }
    }

    // a whole day without being addressed: umore -0.10, at most once per day
    const ignoredSince = lastUserMessage;
    if (ignoredSince !== undefined && at.getTime() - ignoredSince.getTime() >= DAY_MS) {
      if (!(await this.lastMarker("ignored_day", new Date(at.getTime() - DAY_MS)))) {
        await db.insert(events).values({
          gosinoId: this.deps.gosinoId,
          ts: at,
          source: "system",
          type: "ignored_day",
          payload: {},
        });
        await psyche.applyEventType("ignored_day", at);
        report.ignoredApplied = true;
      }
    }
    return report;
  }
}
