import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, events, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { SceneGlance } from "../../src/services/sceneGlance.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * Lo sguardo che diventa una frase (gruppo 12). Le promesse che valgono un
 * test: lo sguardo si CHIEDE e non si prende; arriva, viene raccontato dal
 * modello locale (qui un client registrato, il pattern accettato per i
 * modelli locali) e il pensiero entra dal canale della ruminazione; i pixel
 * si consumano alla lettura e non toccano MAI il database; di notte e a
 * modello spento non succede niente.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let house: TestHouse;
let gateway: FaceGateway;

const DAY = new Date("2026-08-16T10:00:00Z");
const JPEG = Buffer.from("finti pixel di una stanza").toString("base64");

/** il modello vision «registrato»: risponde come moondream, senza moondream */
const vision = {
  seen: [] as string[],
  describe(image: string): Promise<string | undefined> {
    vision.seen.push(image);
    return Promise.resolve("C'è una scatola sul tavolo e una tazza rossa.");
  },
  available: () => Promise.resolve(true),
};

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  house = await createHouse(db, "casa-occhiata");
  const psyche = await PsycheService.restore(db, new Date(), house.gosinoId);
  const chat = new ChatService({
    gosinoId: house.gosinoId,
    accountId: house.id,
    character: characterFrom({}),
    db,
    embedder: undefined as never,
    llm: undefined as never,
    psyche,
    dataKey: randomBytes(32),
  });
  gateway = new FaceGateway({ gosinoId: house.gosinoId, db, chat, psyche });
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

function glance(overrides: Partial<ConstructorParameters<typeof SceneGlance>[0]> = {}): SceneGlance {
  return new SceneGlance({
    dbFor: () => db,
    vision,
    visionUp: () => true,
    hourOf: () => 10,
    ...overrides,
  });
}

async function thoughts(): Promise<string[]> {
  const rows = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.gosinoId, house.gosinoId),
        eq(events.type, "rumination"),
        sql`${events.payload}->>'about' = 'vista'`,
      ),
    );
  return rows.map((row) => (row.payload as { thought: string }).thought);
}

describe("l'occhiata", () => {
  it("primo battito: chiede lo sguardo; secondo: lo racconta, e i pixel svaniscono", async () => {
    const asked: string[] = [];
    const sender = (message: { type: string }): void => {
      asked.push(message.type);
    };
    gateway.registerSender(sender);

    // primo battito: niente sguardo in mano → si chiede
    expect(await glance().maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.01)).toBe("asked");
    expect(asked).toContain("glimpse_ask");

    // il corpo risponde sul socket, come farà davvero
    expect(await gateway.handleRaw(JSON.stringify({ type: "glimpse", image: JPEG }), sender as never)).toBe(true);

    // secondo battito: lo sguardo c'è → frase nel canale della ruminazione
    expect(await glance().maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.9)).toBe("thought");
    expect(vision.seen).toEqual([JPEG]);
    const written = await thoughts();
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("scatola");

    // i pixel NON sono nel database: né in events né altrove in quella riga
    const [row] = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.gosinoId, house.gosinoId), eq(events.type, "rumination")));
    expect(JSON.stringify(row?.payload)).not.toContain(JPEG);

    // e si sono consumati: un secondo racconto dello stesso sguardo non esiste
    expect(gateway.takeGlimpse(600_000, DAY)).toBeUndefined();
    gateway.unregisterSender(sender);
  });

  it("il distanziatore: dopo un pensiero recente non si richiede", async () => {
    expect(await glance().maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.01)).toBe("nothing");
  });

  it("di notte, a corpo scollegato o a modello spento: niente", async () => {
    const night = glance({ hourOf: () => 2 });
    expect(await night.maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.01)).toBe("nothing");
    const blind = glance({ visionUp: () => false });
    expect(await blind.maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.01)).toBe("nothing");
    // nessun sender registrato = nessun corpo
    expect(await glance().maybe({ id: house.gosinoId, accountId: house.id, gateway }, DAY, 0.01)).toBe("nothing");
  });

  it("uno sguardo vecchio non vale una frase: takeGlimpse lo scarta, consumandolo", async () => {
    const sender = (): void => undefined;
    gateway.registerSender(sender);
    await gateway.handleRaw(JSON.stringify({ type: "glimpse", image: JPEG }), sender);
    // invecchiato oltre il tetto: si butta — e si è comunque consumato
    expect(gateway.takeGlimpse(1000, new Date(Date.now() + 5000))).toBeUndefined();
    expect(gateway.takeGlimpse(600_000)).toBeUndefined();
    gateway.unregisterSender(sender);
  });
});
