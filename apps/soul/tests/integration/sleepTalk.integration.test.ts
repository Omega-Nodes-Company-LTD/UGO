import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, diaryEntries, events, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fragmentOf, SleepTalk } from "../../src/services/sleepTalk.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * Parla nel sonno (gruppo 12): di notte un frammento del diario di ieri come
 * nuvoletta senza voce. Le promesse che valgono un test: borbotta SOLO di
 * notte, solo a un corpo connesso, col frammento che viene davvero dal
 * diario; il distanziatore ferma il ticchettio; e nel registro degli eventi
 * restano id e tipo, mai le parole.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let house: TestHouse;

/** un corpo finto quanto basta: un gateway vero qui proverebbe il socket, non il teatro */
function body(connected = true): {
  gateway: { hasBody: () => boolean; broadcastMurmur: (text: string) => void };
  murmurs: string[];
} {
  const murmurs: string[] = [];
  return {
    murmurs,
    gateway: {
      hasBody: () => connected,
      broadcastMurmur: (text: string) => {
        murmurs.push(text);
      },
    },
  };
}

const NIGHT = new Date("2026-08-16T02:00:00Z");

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  house = await createHouse(db, "casa-sonno");
  await db.insert(diaryEntries).values({
    gosinoId: house.gosinoId,
    date: "2026-08-15",
    text: "Oggi ho sentito la voce di Francesco e ho dormito sul cuscino nuovo.",
  });
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("il borbottio notturno", () => {
  it("di notte, col dado buono, borbotta un frammento del diario — senza voce", async () => {
    const talk = new SleepTalk({ dbFor: () => db, hourOf: () => 2 });
    const { gateway, murmurs } = body();
    const did = await talk.maybe({ id: house.gosinoId, accountId: house.id, gateway }, NIGHT, 0.01);
    expect(did).toBe("murmured");
    expect(murmurs).toHaveLength(1);
    expect(murmurs[0]).toContain("...grunf...");
    // le parole vengono DAL diario, non da una sagoma vuota
    const diary = "oggi ho sentito la voce di francesco e ho dormito sul cuscino nuovo";
    const spoken = murmurs[0]?.replace("...grunf... ", "").replace(/\.\.\.$/, "") ?? "";
    expect(diary).toContain(spoken.split(" ")[0] ?? "x");

    // nel registro degli eventi: il tipo, mai il testo (regola 6)
    const [logged] = await db
      .select({ type: events.type, payload: events.payload })
      .from(events)
      .where(eq(events.type, "sleep_talk"));
    expect(logged?.type).toBe("sleep_talk");
    expect(JSON.stringify(logged?.payload)).not.toContain("Francesco");
  });

  it("il distanziatore: il secondo borbottio ravvicinato non parte", async () => {
    const talk = new SleepTalk({ dbFor: () => db, hourOf: () => 2 });
    const { gateway, murmurs } = body();
    await talk.maybe({ id: house.gosinoId, accountId: house.id, gateway }, NIGHT, 0.01);
    expect(murmurs).toHaveLength(0);
  });

  it("di giorno tace, a stanza vuota tace, col dado cattivo tace", async () => {
    const fresh = await createHouse(db, "casa-sonno-due");
    await db.insert(diaryEntries).values({
      gosinoId: fresh.gosinoId,
      date: "2026-08-15",
      text: "Una giornata qualunque di grugniti.",
    });
    const { gateway, murmurs } = body();
    const daytime = new SleepTalk({ dbFor: () => db, hourOf: () => 15 });
    expect(await daytime.maybe({ id: fresh.gosinoId, accountId: house.id, gateway }, NIGHT, 0.01)).toBe("nothing");
    const night = new SleepTalk({ dbFor: () => db, hourOf: () => 2 });
    const empty = body(false);
    expect(await night.maybe({ id: fresh.gosinoId, accountId: house.id, gateway: empty.gateway }, NIGHT, 0.01)).toBe(
      "nothing",
    );
    expect(await night.maybe({ id: fresh.gosinoId, accountId: house.id, gateway }, NIGHT, 0.9)).toBe("nothing");
    expect(murmurs).toHaveLength(0);
  });

  it("senza diario non c'è niente da borbottare", async () => {
    const mute = await createHouse(db, "casa-sonno-muta");
    const { gateway } = body();
    const talk = new SleepTalk({ dbFor: () => db, hourOf: () => 2 });
    expect(await talk.maybe({ id: mute.gosinoId, accountId: house.id, gateway }, NIGHT, 0.01)).toBe("nothing");
  });
});

describe("il frammento", () => {
  it("poche parole, minuscole, senza punteggiatura in coda", () => {
    const made = fragmentOf("Prima frase Importante. Poi altre cose ancora dopo!", 0.4);
    expect(made.startsWith("...grunf... ")).toBe(true);
    expect(made.endsWith("...")).toBe(true);
    const words = made.replace("...grunf... ", "").replace(/\.\.\.$/, "").split(" ");
    expect(words.length).toBeGreaterThanOrEqual(3);
    expect(words.length).toBeLessThanOrEqual(6);
  });

  it("un diario vuoto dà un frammento vuoto, non un borbottio finto", () => {
    expect(fragmentOf("", 0.5)).toBe("");
    expect(fragmentOf("   ", 0.5)).toBe("");
  });
});
