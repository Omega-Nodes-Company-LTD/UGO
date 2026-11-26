import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, events, runMigrations, type DbClient } from "@ugo/db";
import type { ServerToFaceMessage } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import type { ChatService } from "../../src/services/chatService.js";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { firstMeetingLine } from "../../src/services/firstMeeting.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";
import { chatFor } from "./helpers/chat.js";
import { connectFace } from "./helpers/faceSocket.js";

/**
 * Il saluto del primo incontro, dal socket vero (UGOMKT-11): WebSocket reale su
 * un server reale, Postgres vero. Il muso riceve la frase **dopo `whoami`** e
 * **una volta sola** per creatura. L'assenza si prova sul metodo del gateway e
 * non sul socket: aspettare «che non arrivi niente» vorrebbe dire un'attesa a
 * tempo fisso, e un test così passa per fortuna.
 */
let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance | undefined;
let counter = 0;

async function creature(name: string): Promise<{ gosinoId: string; accountId: string }> {
  counter += 1;
  const house = await createAccountWithFounder(db, randomBytes(32), {
    slug: `socket-${String(counter)}`,
    name: `Casa ${String(counter)}`,
    gosinoName: name,
  });
  return { gosinoId: house.gosinoId, accountId: house.accountId };
}

interface Body {
  gateway: FaceGateway;
  chat: ChatService;
  psyche: PsycheService;
}

async function bodyFor(
  who: { gosinoId: string; accountId: string },
  firstMeeting: boolean,
): Promise<Body> {
  const psyche = await PsycheService.restore(db, new Date(), who.gosinoId);
  const chat = chatFor(db, who, psyche);
  const gateway = new FaceGateway({
    gosinoId: who.gosinoId,
    db,
    chat,
    psyche,
    ...(firstMeeting && { firstMeeting: true }),
  });
  return { gateway, chat, psyche };
}

async function serve(body: Body): Promise<string> {
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    features: { chat: body.chat, psyche: body.psyche, face: body.gateway },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no address");
  return `ws://127.0.0.1:${String(address.port)}/v1/face`;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("il primo incontro dal socket del muso", () => {
  it("alla prima connessione il muso riceve il saluto, dopo whoami", async () => {
    const who = await creature("Briciola");
    const url = await serve(await bodyFor(who, true));

    const face = await connectFace(url);
    const speak = await face.waitFor("speak");

    expect(speak).toMatchObject({ type: "speak", text: firstMeetingLine("Briciola") });
    const order = face.received.map((message: ServerToFaceMessage) => message.type);
    expect(order.indexOf("whoami")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("whoami")).toBeLessThan(order.indexOf("speak"));
    await face.close();

    const written = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.gosinoId, who.gosinoId), eq(events.type, "first_meeting")));
    expect(written).toHaveLength(1);
  });

  it("il saluto non si ripete: la seconda volta il gateway non dice niente", async () => {
    const who = await creature("Gosino");
    const { gateway } = await bodyFor(who, true);
    const sent: ServerToFaceMessage[] = [];

    expect(await gateway.greetFirstMeeting((message) => sent.push(message))).toBe(true);
    expect(await gateway.greetFirstMeeting((message) => sent.push(message))).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("senza l'interruttore la creatura non parla per prima e non scrive niente", async () => {
    const who = await creature("Muto");
    const { gateway } = await bodyFor(who, false);
    const sent: ServerToFaceMessage[] = [];

    expect(await gateway.greetFirstMeeting((message) => sent.push(message))).toBe(false);
    expect(sent).toHaveLength(0);
    const marked = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.gosinoId, who.gosinoId), eq(events.type, "first_meeting")));
    expect(marked).toHaveLength(0);
  });
});
