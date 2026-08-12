import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  desires,
  events,
  memories,
  psycheSnapshots,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { encryptText, type ServerToFaceMessage } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { Curiosity } from "../../src/services/volition/curiosity.js";
import { VolitionService } from "../../src/services/volition/volitionService.js";

/**
 * Initiative against a real database (ADR-027).
 *
 * The question these answer is not "does the code run" but "does he actually
 * start something, and does he shut up when he should". The local model is the
 * one thing stubbed — at the object boundary, not the network — because a 30B
 * MoE does not belong in a test runner (TESTING_PLAYBOOK §3 P2); everything it
 * touches around that is real.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
const dataKey = randomBytes(32);

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
}, 240_000);

afterAll(async () => {
  await pg.stop();
});

afterEach(async () => {
  await db.execute(
    sql`truncate table events, desires, memories, psyche_snapshots restart identity cascade`,
  );
});

/** Puts UGO in a given mood by writing the snapshot the psyche restores from. */
async function seedPsyche(overrides: Record<string, number>): Promise<void> {
  await db.insert(psycheSnapshots).values({
    vars: {
      umore: 0.55,
      energia: 0.7,
      affetto: 0.5,
      noia: 0.4,
      stress: 0.3,
      curiosita: 0.5,
      ...overrides,
    },
    label: "test",
  });
}

/** A body that is connected and remembers what it was told. */
function connectBody(gateway: FaceGateway): ServerToFaceMessage[] {
  const heard: ServerToFaceMessage[] = [];
  gateway.registerSender((message) => heard.push(message));
  return heard;
}

const localSaying = (answer: string | undefined): LocalTextClient => ({
  generate: () => Promise.resolve(answer),
  available: () => Promise.resolve(answer !== undefined),
});

async function buildVolition(options: {
  hour?: number;
  enabled?: boolean;
  localAnswer?: string | undefined;
  localUp?: boolean;
}): Promise<{ volition: VolitionService; gateway: FaceGateway; heard: ServerToFaceMessage[] }> {
  const psyche = await PsycheService.restore(db);
  const gateway = new FaceGateway({
    db,
    psyche,
    chat: { handle: () => Promise.resolve({ reply: "" }) } as never,
  });
  const heard = connectBody(gateway);
  const volition = new VolitionService({
    db,
    psyche,
    gateway,
    curiosity: new Curiosity({
      db,
      local: localSaying(options.localAnswer),
      dataKey,
      name: "UGO",
    }),
    localModelUp: () => options.localUp ?? true,
    enabled: () => options.enabled ?? true,
    hourOf: () => options.hour ?? 15,
  });
  return { volition, gateway, heard };
}

describe("initiative", () => {
  it("says a desire the dream wrote, and never says it twice", async () => {
    await db.insert(desires).values({ text: "Com'è andata la consegna DHL?", status: "pending" });
    const { volition, heard } = await buildVolition({});

    const first = await volition.tick();
    expect(first.acted).toBeDefined();
    const spoken = heard.filter((m) => m.type === "speak");
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: "Com'è andata la consegna DHL?" });

    // voiced is fulfilled: the row must be closed, not left to come round again
    const rows = await db.select({ status: desires.status }).from(desires);
    expect(rows.every((row) => row.status === "done")).toBe(true);
  });

  it("writes down what it did and why, so an initiative can be explained after", async () => {
    await db.insert(desires).values({ text: "Chi era la persona di ieri?", status: "pending" });
    const { volition } = await buildVolition({});
    await volition.tick();

    const rows = await db
      .select({ type: events.type, payload: events.payload })
      .from(events)
      .where(eq(events.type, "initiative_taken"));
    expect(rows).toHaveLength(1);
    const payload = rows[0]?.payload as { act?: string; driver?: string; because?: string };
    expect(payload.act).toBeTruthy();
    expect(payload.driver).toBeTruthy();
    expect(payload.because).toBeTruthy();
  });

  it("keeps quiet at night: nothing that would wake the house", async () => {
    await db.insert(desires).values({ text: "Ti va di uscire?", status: "pending" });
    const { volition, heard } = await buildVolition({ hour: 3 });
    await volition.tick();
    expect(heard.filter((m) => m.type === "speak")).toHaveLength(0);
  });

  it("does nothing at all when the owner switched initiative off", async () => {
    await db.insert(desires).values({ text: "Ti va di uscire?", status: "pending" });
    const { volition, heard } = await buildVolition({ enabled: false });
    const report = await volition.tick();
    expect(report.acted).toBeUndefined();
    expect(heard).toHaveLength(0);
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("does not start twice in a row: the floor between initiatives is real", async () => {
    await db.insert(desires).values([
      { text: "Prima domanda?", status: "pending" },
      { text: "Seconda domanda?", status: "pending" },
    ]);
    const { volition, heard } = await buildVolition({});
    await volition.tick();
    await volition.tick();
    expect(heard.filter((m) => m.type === "speak")).toHaveLength(1);
  });

  it("forms a question of its own on the local model, and files it as a desire", async () => {
    await db.insert(memories).values({
      text: encryptText("il fattorino DHL si chiama Ivan", dataKey),
      kind: "fact",
      importance: 0.8,
      embedding: Array.from({ length: 768 }, () => 0.01),
    });
    // curiosity is the pressure that produces a question; loneliness alone
    // must NOT — a nudge is cheaper, and choosing it is the point of the loop
    await seedPsyche({ curiosita: 0.95 });
    const { volition, heard } = await buildVolition({
      localAnswer: "Ecco:\nIvan passa anche il sabato?",
    });
    const report = await volition.tick();

    expect(report.acted).toBe("askQuestion");
    expect(heard.filter((m) => m.type === "speak")).toMatchObject([
      { text: "Ivan passa anche il sabato?" },
    ]);
    // the question survives as a closed desire: it happened, and it is on record
    const rows = await db.select({ text: desires.text, status: desires.status }).from(desires);
    expect(rows).toMatchObject([{ text: "Ivan passa anche il sabato?", status: "done" }]);
  });

  it("falls back to a wordless act when the local model has nothing to say", async () => {
    await db.insert(memories).values({
      text: encryptText("qualcosa", dataKey),
      kind: "fact",
      importance: 0.5,
      embedding: Array.from({ length: 768 }, () => 0.01),
    });
    const { volition } = await buildVolition({ localAnswer: undefined, localUp: false });
    const report = await volition.tick();
    // he may still move, and he may still say one of HIS OWN fixed lines
    // (asking to go out needs no model). What he must not do is invent.
    expect(report.acted).not.toBe("askQuestion");
    // `desires` is the ground truth for "he invented something": his own fixed
    // lines are questions too, so punctuation proves nothing
    const invented = await db.select().from(desires);
    expect(invented).toHaveLength(0);
  });

  it("gives back a reminder the owner asked for, even in the quiet hours", async () => {
    // "svegliami alle 6" means alle 6: an explicit instruction outranks the
    // politeness rule that keeps him silent at night (ADR-028)
    await db.insert(desires).values({
      text: "buttare l'acqua",
      status: "pending",
      dueAt: new Date(Date.now() - 60_000),
    });
    const { volition, heard } = await buildVolition({ hour: 3 });
    const report = await volition.tick();

    expect(report.acted).toBe("reminder");
    expect(heard.filter((m) => m.type === "speak")).toMatchObject([
      { text: expect.stringContaining("buttare l'acqua") as unknown },
    ]);
    const rows = await db.select({ status: desires.status }).from(desires);
    expect(rows).toMatchObject([{ status: "done" }]);
  });

  it("does not blurt out a reminder before its time", async () => {
    await db.insert(desires).values({
      text: "girare l'arrosto",
      status: "pending",
      dueAt: new Date(Date.now() + 30 * 60_000),
    });
    const { volition, heard } = await buildVolition({});
    await volition.tick();

    expect(
      heard.filter((m) => m.type === "speak" && m.text.includes("arrosto")),
    ).toHaveLength(0);
    const rows = await db.select({ status: desires.status }).from(desires);
    expect(rows).toMatchObject([{ status: "pending" }]);
  });

  it("asks to go out when he has been indoors too long, and leaves a marker", async () => {
    await seedPsyche({ noia: 0.95, energia: 0.9 });
    const { volition, heard } = await buildVolition({ hour: 11 });
    const report = await volition.tick();

    expect(report.acted).toBe("askToGoOut");
    expect(heard.filter((m) => m.type === "speak")).toMatchObject([
      { text: expect.stringContaining("fuori") as unknown },
    ]);
    // the marker is what turns "he was carried somewhere" into "he was taken
    // out": without it going portable is just a change of shell (ADR-030)
    const asked = await db.select().from(events).where(eq(events.type, "wants_out"));
    expect(asked).toHaveLength(1);
  });

  it("stops wanting out once he is out", async () => {
    await seedPsyche({ noia: 0.95, energia: 0.9 });
    await db.insert(events).values({ source: "system", type: "went_out", payload: {} });
    const { volition, heard } = await buildVolition({ hour: 11 });
    const report = await volition.tick();

    expect(report.acted).not.toBe("askToGoOut");
    expect(heard.filter((m) => m.type === "speak" && m.text.includes("fuori"))).toHaveLength(0);
  });

  it("scores whether the last initiative actually helped", async () => {
    await db.insert(desires).values({ text: "Una domanda?", status: "pending" });
    const { volition } = await buildVolition({});
    await volition.tick();
    await volition.tick(); // the second tick judges the first

    const verdicts = await db
      .select({ type: events.type })
      .from(events)
      .where(sql`${events.type} in ('initiative_worked', 'initiative_flat')`);
    expect(verdicts).toHaveLength(1);
  });
});
