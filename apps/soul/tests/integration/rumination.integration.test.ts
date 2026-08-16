import { type StartedPostgreSqlContainer, PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  desires,
  events,
  gosini,
  households,
  memories,
  messages,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PsycheService } from "../../src/services/psycheService.js";
import { RuminationService, type Ruminator } from "../../src/services/rumination.js";

/**
 * La ruminazione (ADR-059) contro Postgres vero. Il modello locale è
 * registrato, non finto alla cieca — stesso patto del consiglio: quel che si
 * asserisce è cosa la ruminazione SCRIVE e quando tace, non cosa il modello
 * si inventa.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let householdId: string;

/** Mezzogiorno: dentro la finestra di veglia, lontano dalla quiete. */
const NOON = new Date("2026-08-17T12:00:00Z");
const NIGHT = new Date("2026-08-17T23:30:00Z");
const hourOf = (at: Date): number => at.getUTCHours();

function recorder(answer: string | undefined): { client: LocalTextClient; prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    client: {
      available: () => Promise.resolve(true),
      generate: (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve(answer);
      },
    },
  };
}

function service(
  client: LocalTextClient,
  rolls: number[],
  overrides: Partial<{ enabled: boolean; up: boolean; gapMin: number }> = {},
): RuminationService {
  let index = 0;
  return new RuminationService({
    db,
    local: client,
    localUp: () => overrides.up ?? true,
    hourOf,
    enabled: () => overrides.enabled ?? true,
    gapMin: overrides.gapMin ?? 45,
    dice: () => rolls[index++ % rolls.length] ?? 0.5,
  });
}

async function bornWithMemories(name: string, texts: string[]): Promise<Ruminator> {
  const rows = await db
    .insert(gosini)
    .values({ householdId, name })
    .returning({ id: gosini.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("not created");
  for (const text of texts) {
    await db.insert(memories).values({ gosinoId: id, kind: "episode", text, importance: 0.6 });
  }
  return { id, name, psyche: await PsycheService.restore(db, NOON, id) };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const houses = await db.select({ id: households.id }).from(households).limit(1);
  const first = houses[0]?.id;
  if (first === undefined) throw new Error("the migrations seed one household");
  householdId = first;
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("la ruminazione", () => {
  it("un accostamento riuscito finisce in `events`, dove il sogno lo leggerà — mai in `memories`", async () => {
    const self = await bornWithMemories("Ugo", [
      "il proprietario lavora al progetto del garage",
      "martedì è passato il corriere con una scatola pesante",
    ]);
    const { client } = recorder("Magari nella scatola c'era la ferramenta per il garage.");
    // roll 0.3 → accostamento (niente compagni)
    const report = await service(client, [0.3, 0.1, 0.1]).maybe(self, [], NOON);
    expect(report.did).toBe("association");

    const thoughts = await db
      .select()
      .from(events)
      .where(and(eq(events.gosinoId, self.id), eq(events.type, "rumination")));
    expect(thoughts).toHaveLength(1);
    const payload = thoughts[0]?.payload as { about?: string[]; thought?: string };
    expect(payload.about).toHaveLength(2);
    expect(payload.thought).toContain("garage");
    // il vaglio del sogno: la ruminazione NON scrive memorie da sola
    const written = await db.select().from(memories).where(eq(memories.gosinoId, self.id));
    expect(written).toHaveLength(2);
  });

  it("un modello che risponde NIENTE lascia solo il distanziatore: niente pensiero, niente desiderio", async () => {
    const self = await bornWithMemories("Nino", ["ricordo uno", "ricordo due"]);
    const { client } = recorder("NIENTE.");
    const report = await service(client, [0.3, 0.1, 0.1]).maybe(self, [], NOON);
    expect(report.did).toBe("nothing");
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.gosinoId, self.id), eq(events.type, "rumination")));
    expect(rows).toHaveLength(1);
    expect((rows[0]?.payload as { thought?: string }).thought).toBeUndefined();
  });

  it("la domanda diventa un desiderio pending: la dirà sayDesire, non la ruminazione", async () => {
    const self = await bornWithMemories("Lino", ["il proprietario parlava di un viaggio a maggio"]);
    const { client } = recorder("Alla fine il viaggio di maggio si fa?");
    // roll 0.8 → domanda
    const report = await service(client, [0.8, 0.1, 0.1]).maybe(self, [], NOON);
    expect(report.did).toBe("question");
    const queued = await db.select().from(desires).where(eq(desires.gosinoId, self.id));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.status).toBe("pending");
    expect(queued[0]?.text).toContain("viaggio");
  });

  it("due battute con l'altro gosino restano nella giornata di ENTRAMBI, e li scaldano come un saluto", async () => {
    const self = await bornWithMemories("Gino", ["oggi l'erba profumava"]);
    const mate = await bornWithMemories("Pino", ["il truogolo era vuoto"]);
    const moodBefore = mate.psyche.current(NOON).vars.umore;
    const { client } = recorder("Grunf, che giornata!");
    // roll 0.1 → chiacchiera (c'è un compagno)
    const report = await service(client, [0.1, 0.0, 0.2]).maybe(self, [mate], NOON);
    expect(report.did).toBe("chat");

    const mine = await db
      .select()
      .from(events)
      .where(and(eq(events.gosinoId, self.id), eq(events.type, "peer_chat")));
    const theirs = await db
      .select()
      .from(events)
      .where(and(eq(events.gosinoId, mate.id), eq(events.type, "peer_chat")));
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect((mine[0]?.payload as { with?: string }).with).toBe(mate.id);
    expect((theirs[0]?.payload as { with?: string }).with).toBe(self.id);
    expect(mate.psyche.current(NOON).vars.umore).toBeGreaterThan(moodBefore);
  });

  it("di notte tace: la quiete è del sogno", async () => {
    const self = await bornWithMemories("Dino", ["ricordo qualunque", "un altro"]);
    const { client, prompts } = recorder("qualcosa");
    const report = await service(client, [0.3]).maybe(self, [], NIGHT);
    expect(report.did).toBe("nothing");
    expect(prompts).toHaveLength(0);
  });

  it("se ha appena parlato con qualcuno non rumina: il pensiero è il tempo vuoto", async () => {
    const self = await bornWithMemories("Rino", ["ricordo uno", "ricordo due"]);
    await db.insert(messages).values({
      gosinoId: self.id,
      channel: "home",
      role: "user",
      text: "v1:finto-cifrato",
      ts: new Date(NOON.getTime() - 5 * 60_000),
    });
    const { client, prompts } = recorder("qualcosa");
    const report = await service(client, [0.3]).maybe(self, [], NOON);
    expect(report.did).toBe("nothing");
    expect(prompts).toHaveLength(0);
  });

  it("il distanziatore conta i tentativi: subito dopo un giro, il secondo tace", async () => {
    const self = await bornWithMemories("Tino", ["ricordo uno", "ricordo due"]);
    const { client, prompts } = recorder("NIENTE.");
    const svc = service(client, [0.3, 0.1, 0.1]);
    await svc.maybe(self, [], NOON);
    expect(prompts).toHaveLength(1);
    const again = await svc.maybe(self, [], new Date(NOON.getTime() + 60_000));
    expect(again.did).toBe("nothing");
    expect(prompts).toHaveLength(1);
  });
});
