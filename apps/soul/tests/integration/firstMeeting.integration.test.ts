import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, events, messages, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirstMeeting, firstMeetingLine } from "../../src/services/firstMeeting.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";

/**
 * Il primo incontro (UGOMKT-11, copione): Postgres vero. Quello che si prova
 * non è il testo (sta nel test puro) ma che il saluto sia UNA VOLTA SOLA per
 * creatura, anche con più connessioni insieme, e che chi ha già una storia non
 * lo riceva come se fosse nuovo.
 */
const KEY = randomBytes(32);
let container: StartedPostgreSqlContainer;
let db: DbClient;
let counter = 0;

async function creature(name: string): Promise<string> {
  counter += 1;
  const house = await createAccountWithFounder(db, KEY, {
    slug: `primo-incontro-${String(counter)}`,
    name: `Casa ${String(counter)}`,
    gosinoName: name,
  });
  return house.gosinoId;
}

const meetings = (gosinoId: string): Promise<{ id: string; payload: unknown }[]> =>
  db
    .select({ id: events.id, payload: events.payload })
    .from(events)
    .where(and(eq(events.gosinoId, gosinoId), eq(events.type, "first_meeting")));

beforeAll(async () => {
  const started = await startPostgres();
  container = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("FirstMeeting.greeting", () => {
  it("una creatura che nessuno ha incontrato saluta col suo nome, e lo scrive", async () => {
    const gosinoId = await creature("Ugo");
    const line = await new FirstMeeting(db).greeting(gosinoId);

    expect(line).toBe(firstMeetingLine("Ugo"));
    const written = await meetings(gosinoId);
    expect(written).toHaveLength(1);
    // regola 6: il registro dice che è successo, non cosa è stato detto
    expect(written[0]?.payload).toEqual({});
  });

  it("saluta una volta sola: la seconda volta tace", async () => {
    const gosinoId = await creature("Briciola");
    const first = new FirstMeeting(db);
    expect(await first.greeting(gosinoId)).toBeDefined();
    expect(await first.greeting(gosinoId)).toBeUndefined();
    expect(await new FirstMeeting(db).greeting(gosinoId)).toBeUndefined();
    expect(await meetings(gosinoId)).toHaveLength(1);
  });

  it("con dieci connessioni insieme saluta una volta sola", async () => {
    const gosinoId = await creature("Gosino");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => new FirstMeeting(db).greeting(gosinoId)),
    );

    expect(results.filter((line) => line !== undefined)).toHaveLength(1);
    expect(await meetings(gosinoId)).toHaveLength(1);
  });

  it("chi ha già una storia non è al primo incontro: non saluta e non scrive niente", async () => {
    const gosinoId = await creature("Veterano");
    await db.insert(messages).values({
      gosinoId,
      channel: "home",
      role: "user",
      text: encryptText("ciao", KEY),
    });

    expect(await new FirstMeeting(db).greeting(gosinoId)).toBeUndefined();
    expect(await meetings(gosinoId)).toHaveLength(0);
  });

  it("ogni creatura ha il suo primo incontro", async () => {
    const one = await creature("Uno");
    const two = await creature("Due");

    expect(await new FirstMeeting(db).greeting(one)).toBe(firstMeetingLine("Uno"));
    expect(await new FirstMeeting(db).greeting(two)).toBe(firstMeetingLine("Due"));
    expect(await new FirstMeeting(db).greeting(one)).toBeUndefined();
  });

  it("una creatura che non esiste non saluta e non lascia tracce", async () => {
    const missing = "00000000-0000-4000-8000-0000000000ff";
    expect(await new FirstMeeting(db).greeting(missing)).toBeUndefined();
    expect(await meetings(missing)).toHaveLength(0);
  });
});
