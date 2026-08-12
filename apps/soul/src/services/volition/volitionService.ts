import { desires, events, messages, type DbClient } from "@ugo/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { FaceGateway } from "../faceGateway.js";
import type { PsycheService } from "../psycheService.js";
import { GLYPH_PATTERNS, type GlyphPattern } from "@ugo/shared";
import { ACT_BY_ID, type Act } from "./acts.js";
import type { Curiosity } from "./curiosity.js";
import { type Gates, decide } from "./decide.js";
import { type Vars, type WorldFacts, pressures } from "./pressures.js";
import { voiceReminder } from "./reminders.js";

/**
 * Initiative (ADR-027) — the loop that lets UGO act because he decided to.
 *
 * Everything expressive and every judgement lives in the pure modules next
 * door; this file gathers the facts, performs the chosen act, and writes down
 * what it did and why. The write-down is not bookkeeping: an initiative you
 * cannot explain afterwards is indistinguishable from a bug, and `events` is
 * already the append-only place where the night job will read it back.
 */

const MIN = 60_000;
/** Anything that means someone is here with him (same list as solitude). */
const PRESENCE_EVENT_TYPES = ["face_seen", "tap", "heard_text", "lead_contact"] as const;
/** How far back to look for his own past initiatives, for the cooldowns. */
const HISTORY_MIN = 180;

/** What he says when he wants out. Fixed text, zero tokens, ADR-030. */
const ASK_TO_GO_OUT = "Grunf... mi porti fuori un po'?";

const isGlyphPattern = (value: string | undefined): value is GlyphPattern =>
  value !== undefined && (GLYPH_PATTERNS as readonly string[]).includes(value);

export interface VolitionDeps {
  db: DbClient;
  /** ADR-032: whose pressures these are */
  gosinoId?: string;
  psyche: PsycheService;
  gateway: FaceGateway;
  curiosity?: Curiosity;
  /** the local model answered a ping: `askQuestion` needs it */
  localModelUp: () => boolean;
  enabled: () => boolean;
  now?: () => Date;
  hourOf?: (at: Date) => number;
}

export interface TickReport {
  acted: string | undefined;
  because: string | undefined;
  /** pressures seen this tick, strongest first */
  seen: { id: string; magnitude: number }[];
}

interface Taken {
  act: string;
  driver: string;
  magnitude: number;
  at: Date;
}

export class VolitionService {
  /** the last initiative, kept to score whether it actually helped */
  private pending: Taken | undefined;

  public constructor(private readonly deps: VolitionDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private hour(at: Date): number {
    return this.deps.hourOf?.(at) ?? at.getHours();
  }

  /** Scopes a query to this exemplar; undefined in a single-exemplar house. */
  private mine(column: { gosinoId: unknown }): ReturnType<typeof eq> | undefined {
    return this.deps.gosinoId === undefined
      ? undefined
      : eq(column.gosinoId as never, this.deps.gosinoId);
  }

  private async minutesSince(types: readonly string[], at: Date): Promise<number> {
    const rows = await this.deps.db
      .select({ ts: events.ts })
      .from(events)
      .where(and(inArray(events.type, [...types]), this.mine(events)))
      .orderBy(desc(events.ts))
      .limit(1);
    const last = rows[0]?.ts;
    if (last === undefined) return Number.POSITIVE_INFINITY;
    return (at.getTime() - last.getTime()) / MIN;
  }

  /** Presence also counts a message he received, not only a sensor event. */
  private async minutesAlone(at: Date): Promise<number> {
    const fromEvents = await this.minutesSince(PRESENCE_EVENT_TYPES, at);
    const rows = await this.deps.db
      .select({ ts: messages.ts })
      .from(messages)
      .where(and(eq(messages.role, "user"), this.mine(messages)))
      .orderBy(desc(messages.ts))
      .limit(1);
    const last = rows[0]?.ts;
    const fromMessages =
      last === undefined ? Number.POSITIVE_INFINITY : (at.getTime() - last.getTime()) / MIN;
    return Math.min(fromEvents, fromMessages);
  }

  /** Minutes since each act was last performed, from the journal. */
  private async sinceAct(at: Date): Promise<Record<string, number>> {
    const rows = await this.deps.db
      .select({ ts: events.ts, payload: events.payload })
      .from(events)
      // typed operators, not a raw template: interpolating a Date into
      // sql`` binds it as text and the driver refuses it at Bind time —
      // found by the integration suite, not by review
      .where(
        and(
          eq(events.type, "initiative_taken"),
          gte(events.ts, new Date(at.getTime() - HISTORY_MIN * MIN)),
          this.mine(events),
        ),
      )
      .orderBy(desc(events.ts));
    const out: Record<string, number> = {};
    for (const row of rows) {
      const act = (row.payload as { act?: unknown }).act;
      if (typeof act !== "string" || act in out) continue;
      out[act] = (at.getTime() - row.ts.getTime()) / MIN;
    }
    return out;
  }

  private async pendingDesire(
    at: Date,
  ): Promise<{
    count: number;
    due: boolean;
    /** the owner asked for this one, by the clock: it bypasses the quiet rules */
    isReminder: boolean;
    text: string | undefined;
    id: string | undefined;
  }> {
    const rows = await this.deps.db
      .select({ id: desires.id, text: desires.text, dueAt: desires.dueAt, dueHint: desires.dueHint })
      .from(desires)
      .where(and(eq(desires.status, "pending"), this.mine(desires)))
      .orderBy(asc(desires.createdAt));

    // A reminder the owner asked for outranks everything: it comes first, and
    // it is exact to the minute (ADR-028). `due_hint` stays the dream's own
    // fuzzy wish and is read only as an hour of the day.
    const ripe = rows
      .filter((row) => row.dueAt !== null && row.dueAt.getTime() <= at.getTime())
      .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))[0];
    if (ripe !== undefined) {
      return { count: rows.length, due: true, isReminder: true, text: ripe.text, id: ripe.id };
    }

    const hour = this.hour(at);
    const hinted = rows.some((row) => {
      const hint = row.dueHint;
      if (hint === null || hint === "") return false;
      const match = /(\d{1,2})\s*[:.]?\s*\d{0,2}/u.exec(hint);
      const named = match?.[1] === undefined ? undefined : Number(match[1]);
      return named !== undefined && named === hour;
    });
    // a desire with an appointment in the future must not be said early
    const spontaneous = rows.filter((row) => row.dueAt === null);
    const first = spontaneous[0];
    return {
      count: spontaneous.length,
      due: hinted,
      isReminder: false,
      text: first?.text,
      id: first?.id,
    };
  }

  /** Is he out right now? The last of the two shell events wins (ADR-030). */
  private async lastMode(): Promise<"home" | "out"> {
    const rows = await this.deps.db
      .select({ type: events.type })
      .from(events)
      .where(and(inArray(events.type, ["went_out", "came_home"]), this.mine(events)))
      .orderBy(desc(events.ts))
      .limit(1);
    return rows[0]?.type === "went_out" ? "out" : "home";
  }

  private async record(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.db.insert(events).values({
      source: "system",
      type,
      payload,
      ...(this.deps.gosinoId !== undefined && { gosinoId: this.deps.gosinoId }),
    });
  }

  /**
   * Did the last initiative actually help? Compared on the pressure it was
   * aimed at, not on a general feeling — otherwise everything looks like it
   * worked eventually.
   */
  private async scoreLast(current: readonly { id: string; magnitude: number }[]): Promise<void> {
    const last = this.pending;
    if (last === undefined) return;
    this.pending = undefined;
    const nowMagnitude = current.find((p) => p.id === last.driver)?.magnitude ?? 0;
    const dropped = last.magnitude - nowMagnitude;
    await this.record(dropped > 0.05 ? "initiative_worked" : "initiative_flat", {
      act: last.act,
      driver: last.driver,
      before: Number(last.magnitude.toFixed(3)),
      after: Number(nowMagnitude.toFixed(3)),
    });
  }

  private async perform(
    act: Act,
    desire: { text: string | undefined; id: string | undefined },
  ): Promise<boolean> {
    const { gateway, db } = this.deps;
    switch (act.kind) {
      case "gesture":
        gateway.broadcastGesture(act.payload ?? "earFlick");
        return true;
      case "glyph":
        gateway.broadcastGlyph(isGlyphPattern(act.payload) ? act.payload : "alert");
        return true;
      case "speakDesire": {
        if (desire.text === undefined || desire.id === undefined) return false;
        gateway.broadcastSpeak(desire.text);
        // voiced is fulfilled: the same desire must never come round twice
        await db.update(desires).set({ status: "done" }).where(eq(desires.id, desire.id));
        return true;
      }
      case "askOut": {
        // his own words, not the model's: asking to go out costs nothing
        this.deps.gateway.broadcastSpeak(ASK_TO_GO_OUT);
        this.deps.gateway.broadcastGesture("leanIn");
        // the marker the gateway looks for when the body turns portable: it is
        // what turns "he was carried somewhere" into "he was taken out"
        await this.record("wants_out", {});
        return true;
      }
      case "askQuestion": {
        const question = await this.deps.curiosity?.wonder();
        if (question === undefined) return false;
        gateway.broadcastSpeak(question);
        await db
          .update(desires)
          .set({ status: "done" })
          .where(sql`${desires.text} = ${question} and ${desires.status} = 'pending'`);
        return true;
      }
    }
  }

  /** One beat of the loop. Safe to call on a timer; never throws at the caller. */
  public async tick(): Promise<TickReport> {
    const at = this.now();
    const vars: Vars = this.deps.psyche.current(at).vars;

    const [alone, sinceInitiative, sinceAct, desire, sinceOuting, lastMode] = await Promise.all([
      this.minutesAlone(at),
      this.minutesSince(["initiative_taken"], at),
      this.sinceAct(at),
      this.pendingDesire(at),
      this.minutesSince(["went_out"], at),
      this.lastMode(),
    ]);

    const facts: WorldFacts = {
      minutesAlone: Number.isFinite(alone) ? alone : 24 * 60,
      minutesSinceInitiative: sinceInitiative,
      pendingDesires: desire.count,
      desireIsDue: desire.due,
      bodyPresent: this.deps.gateway.hasBody(),
      hour: this.hour(at),
      minutesSinceOuting: sinceOuting,
      outNow: lastMode === "out",
    };

    const list = pressures(vars, facts);
    const seen = list.map((p) => ({ id: p.id, magnitude: Number(p.magnitude.toFixed(3)) }));
    await this.scoreLast(seen);

    // A reminder the owner asked for is not an initiative to be weighed: it is
    // an instruction with a time on it. It skips the quiet hours and the floor
    // between initiatives, because "svegliami alle 6" means alle 6 (ADR-028).
    if (desire.isReminder && desire.text !== undefined && desire.id !== undefined) {
      if (!this.deps.enabled()) return { acted: undefined, because: undefined, seen };
      this.deps.gateway.broadcastSpeak(voiceReminder(desire.text));
      await this.deps.db
        .update(desires)
        .set({ status: "done" })
        .where(eq(desires.id, desire.id));
      await this.record("reminder_voiced", { late: Math.round(facts.minutesSinceInitiative) });
      return { acted: "reminder", because: "me l'avevi chiesto tu", seen };
    }

    const gates: Gates = {
      bodyPresent: facts.bodyPresent,
      localModelUp: this.deps.localModelUp(),
      hasDesire: desire.count > 0,
      hour: facts.hour,
      minutesSinceInitiative: facts.minutesSinceInitiative,
      sinceAct,
      enabled: this.deps.enabled(),
    };

    const decision = decide(list, gates);
    if (decision === undefined) return { acted: undefined, because: undefined, seen };

    const done = await this.perform(decision.act, desire);
    if (!done) return { acted: undefined, because: undefined, seen };

    await this.record("initiative_taken", {
      act: decision.act.id,
      driver: decision.driver.id,
      because: decision.driver.because,
      score: Number(decision.score.toFixed(3)),
    });
    this.pending = {
      act: decision.act.id,
      driver: decision.driver.id,
      magnitude: decision.driver.magnitude,
      at,
    };
    return { acted: decision.act.id, because: decision.driver.because, seen };
  }
}

export { ACT_BY_ID };
