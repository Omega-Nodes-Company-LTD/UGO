import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, events, messages, runMigrations, type DbClient } from "@ugo/db";
import { encryptText } from "@ugo/shared";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { PsycheService } from "../../src/services/psycheService.js";
import { SolitudeMonitor } from "../../src/services/solitudeMonitor.js";

// Time is injected, infrastructure is real: the clock is the only thing a
// loneliness test can legitimately fake.

const dataKey = randomBytes(32);
const NOW = new Date("2026-08-09T15:00:00Z");
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;

let pg: StartedPostgreSqlContainer;
let db: DbClient;

async function freshMonitor(): Promise<{ monitor: SolitudeMonitor; psyche: PsycheService }> {
  const psyche = await PsycheService.restore(db, NOW);
  return { monitor: new SolitudeMonitor({ db, psyche }), psyche };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

afterEach(async () => {
  await db.delete(events);
  await db.delete(messages);
});

describe("solitude_hour", () => {
  it("does nothing while someone was around recently", async () => {
    await db.insert(events).values({ ts: ago(10 * 60_000), source: "face", type: "face_seen", payload: {} });
    const { monitor } = await freshMonitor();
    expect((await monitor.tick(NOW)).solitudeApplied).toBe(false);
  });

  it("raises noia after an hour alone and journals the event", async () => {
    await db.insert(events).values({ ts: ago(2 * HOUR), source: "face", type: "face_seen", payload: {} });
    const { monitor, psyche } = await freshMonitor();
    const before = psyche.current(NOW).vars.noia;

    expect((await monitor.tick(NOW)).solitudeApplied).toBe(true);
    expect(psyche.current(NOW).vars.noia).toBeGreaterThan(before);
    const journal = await db.select().from(events).where(eq(events.type, "solitude_hour"));
    expect(journal).toHaveLength(1);
  });

  it("is idempotent within the hour, even across a restart", async () => {
    await db.insert(events).values({ ts: ago(3 * HOUR), source: "face", type: "tap", payload: {} });
    const first = await freshMonitor();
    expect((await first.monitor.tick(NOW)).solitudeApplied).toBe(true);

    // same instant, brand new services: the journal must stop the double-dip
    const second = await freshMonitor();
    expect((await second.monitor.tick(NOW)).solitudeApplied).toBe(false);
    // and an hour later it is allowed again
    const later = new Date(NOW.getTime() + HOUR + 60_000);
    expect((await second.monitor.tick(later)).solitudeApplied).toBe(true);
    expect(await db.select().from(events).where(eq(events.type, "solitude_hour"))).toHaveLength(2);
  });
});

describe("ignored_day", () => {
  it("lowers umore after a full day without being addressed", async () => {
    await db.insert(messages).values({
      ts: ago(30 * HOUR),
      channel: "home",
      role: "user",
      text: encryptText("ciao UGO", dataKey),
    });
    const { monitor, psyche } = await freshMonitor();
    const before = psyche.current(NOW).vars.umore;

    const report = await monitor.tick(NOW);
    expect(report.ignoredApplied).toBe(true);
    expect(psyche.current(NOW).vars.umore).toBeLessThan(before);
    expect(await db.select().from(events).where(eq(events.type, "ignored_day"))).toHaveLength(1);
  });

  it("does not sulk twice on the same day", async () => {
    await db.insert(messages).values({
      ts: ago(40 * HOUR),
      channel: "home",
      role: "user",
      text: encryptText("ci sei?", dataKey),
    });
    const first = await freshMonitor();
    expect((await first.monitor.tick(NOW)).ignoredApplied).toBe(true);
    const second = await freshMonitor();
    expect((await second.monitor.tick(new Date(NOW.getTime() + 2 * HOUR))).ignoredApplied).toBe(false);
  });

  it("forgives immediately when the owner speaks again", async () => {
    await db.insert(messages).values({
      ts: ago(5 * 60_000),
      channel: "home",
      role: "user",
      text: encryptText("eccomi!", dataKey),
    });
    const { monitor } = await freshMonitor();
    expect((await monitor.tick(NOW)).ignoredApplied).toBe(false);
  });
});
