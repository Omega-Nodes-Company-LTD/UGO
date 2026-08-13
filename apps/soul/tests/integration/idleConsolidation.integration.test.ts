import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, events, messages, runMigrations, type DbClient,
  PRIME_GOSINO_ID,
} from "@ugo/db";
import { encryptText } from "@ugo/shared";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdleConsolidation } from "../../src/services/idleConsolidation.js";

// Time is injected, infrastructure is real: the clock is the only thing a
// test about quiet afternoons can legitimately fake.

const dataKey = randomBytes(32);
const MINUTE = 60_000;
const NOW = new Date("2026-08-09T15:00:00Z"); // 17:00 in Europe/Rome
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

let pg: StartedPostgreSqlContainer;
let db: DbClient;

function build(
  overrides: { idleMinutes?: number; dreamAt?: string } = {},
): { idle: IdleConsolidation; triggered: string[] } {
  const triggered: string[] = [];
  const idle = new IdleConsolidation({
    db,
    gosinoId: PRIME_GOSINO_ID,
    options: {
      idleMinutes: overrides.idleMinutes ?? 90,
      nightGuardMinutes: 60,
      dreamAt: overrides.dreamAt ?? "02:30",
      timezone: "Europe/Rome",
    },
    trigger: async (mode) => {
      triggered.push(mode);
      await Promise.resolve();
    },
  });
  return { idle, triggered };
}

const sawSomeone = async (at: Date): Promise<void> => {
  await db.insert(events).values({ gosinoId: PRIME_GOSINO_ID, ts: at, source: "face", type: "face_seen", payload: {} });
};

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

describe("consolidamento su inattività (ADR-025)", () => {
  it("asks for a light dream once the house has been quiet long enough", async () => {
    await sawSomeone(ago(120 * MINUTE));
    const { idle, triggered } = build();

    const report = await idle.tick(NOW);
    expect(report.requested).toBe(true);
    expect(triggered).toEqual(["light"]);

    const marker = await db
      .select({ payload: events.payload })
      .from(events)
      .where(eq(events.type, "idle_consolidation_requested"));
    expect(marker).toHaveLength(1);
    expect(marker[0]?.payload).toMatchObject({ quietMinutes: 120 });
  });

  it("says nothing while somebody is still around", async () => {
    await sawSomeone(ago(20 * MINUTE));
    const { idle, triggered } = build();

    expect((await idle.tick(NOW)).reason).toBe("too-soon");
    expect(triggered).toEqual([]);
  });

  it("counts a spoken message as company, not only a face", async () => {
    await sawSomeone(ago(300 * MINUTE));
    await db.insert(messages).values({
      gosinoId: PRIME_GOSINO_ID,
      ts: ago(10 * MINUTE),
      channel: "home",
      role: "user",
      text: encryptText("ci sei?", dataKey),
    });
    const { idle } = build();
    expect((await idle.tick(NOW)).reason).toBe("too-soon");
  });

  it("asks once per stretch of quiet, not once per tick", async () => {
    await sawSomeone(ago(200 * MINUTE));
    const { idle, triggered } = build();

    expect((await idle.tick(NOW)).requested).toBe(true);
    // fifteen minutes later, still nobody: it must not ask again
    expect((await idle.tick(new Date(NOW.getTime() + 15 * MINUTE))).reason).toBe("already-done");
    expect(triggered).toEqual(["light"]);
  });

  it("asks again after somebody has been and gone", async () => {
    await sawSomeone(ago(200 * MINUTE));
    const { idle, triggered } = build();
    await idle.tick(NOW);

    // company, then quiet again: a new stretch, a new request
    const later = new Date(NOW.getTime() + 300 * MINUTE);
    await sawSomeone(new Date(NOW.getTime() + 10 * MINUTE));
    expect((await idle.tick(later)).requested).toBe(true);
    expect(triggered).toEqual(["light", "light"]);
  });

  it("stands down near the dream's own hour", async () => {
    await sawSomeone(ago(600 * MINUTE));
    const { idle, triggered } = build({ dreamAt: "17:00" }); // = NOW in Europe/Rome
    expect((await idle.tick(NOW)).reason).toBe("near-the-dream");
    expect(triggered).toEqual([]);
  });

  it("does nothing in a house that has never seen anyone", async () => {
    const { idle, triggered } = build();
    expect((await idle.tick(NOW)).reason).toBe("never-seen-anyone");
    expect(triggered).toEqual([]);
  });

  it("keeps the marker when the runner is unreachable, instead of retrying all afternoon", async () => {
    await sawSomeone(ago(200 * MINUTE));
    const idle = new IdleConsolidation({
      db,
      gosinoId: PRIME_GOSINO_ID,
      options: {
        idleMinutes: 90,
        nightGuardMinutes: 60,
        dreamAt: "02:30",
        timezone: "Europe/Rome",
      },
      trigger: () => Promise.reject(new Error("runner down")),
    });

    expect((await idle.tick(NOW)).requested).toBe(true);
    expect((await idle.tick(new Date(NOW.getTime() + MINUTE))).reason).toBe("already-done");
  });
});
