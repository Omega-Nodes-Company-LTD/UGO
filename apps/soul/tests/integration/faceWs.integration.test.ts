import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  desires,
  events,
  PRIME_GOSINO_ID,
  runMigrations,
} from "@ugo/db";
import { EMBED_MODEL, startLlmStub, startOllama, type LlmStub, type OllamaHandle } from "@ugo/factories";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import type { ServerToFaceMessage } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ChatService } from "../../src/services/chatService.js";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

// Real WS over a real listening server, real Postgres, real Ollama, provider
// stubbed at network level. The face client below is exactly what the webapp
// does: JSON frames over ws.

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let stub: LlmStub;
let db: DbClient;

interface FaceTestClient {
  send: (message: Record<string, unknown>) => void;
  received: ServerToFaceMessage[];
  waitFor: (type: ServerToFaceMessage["type"], count?: number) => Promise<ServerToFaceMessage>;
  close: () => Promise<void>;
}

let app: FastifyInstance | undefined;

async function startSoul(fakeHour: number): Promise<{ url: string; gateway: FaceGateway }> {
  const psyche = await PsycheService.restore(db, new Date(), PRIME_GOSINO_ID);
  const chat = new ChatService({
    gosinoId: PRIME_GOSINO_ID,
    db,
    embedder: new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL),
    llm: new LlmClient({
      db,
      apiKey: "test",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: stub.baseUrl,
    }),
    psyche,
    dataKey: randomBytes(32),
  });
  const gateway = new FaceGateway({ gosinoId: PRIME_GOSINO_ID, db, chat, psyche, hourOf: () => fakeHour });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: ollama.baseUrl,
    logger: false,
    features: { chat, psyche, face: gateway },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no address");
  return { url: `ws://127.0.0.1:${String(address.port)}/v1/face`, gateway };
}

async function connectFace(url: string): Promise<FaceTestClient> {
  const socket = new WebSocket(url);
  const received: ServerToFaceMessage[] = [];
  const waiters: { predicate: () => ServerToFaceMessage | undefined; resolve: (m: ServerToFaceMessage) => void }[] = [];
  socket.on("message", (raw: Buffer) => {
    received.push(JSON.parse(raw.toString()) as ServerToFaceMessage);
    for (const waiter of [...waiters]) {
      const match = waiter.predicate();
      if (match !== undefined) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(match);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    send: (message) => {
      socket.send(JSON.stringify(message));
    },
    received,
    waitFor: (type, count = 1) =>
      new Promise((resolve, reject) => {
        const predicate = (): ServerToFaceMessage | undefined => {
          const matches = received.filter((m) => m.type === type);
          return matches.length >= count ? matches[count - 1] : undefined;
        };
        const immediate = predicate();
        if (immediate !== undefined) {
          resolve(immediate);
          return;
        }
        waiters.push({ predicate, resolve });
        setTimeout(() => {
          reject(new Error(`timed out waiting for "${type}" x${String(count)}`));
        }, 15_000);
      }),
    close: () =>
      new Promise((resolve) => {
        socket.once("close", () => {
          resolve();
        });
        socket.close();
      }),
  };
}

beforeAll(async () => {
  [pg, ollama, stub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop(), stub.close()]);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  stub.reset();
});

describe("WS /v1/face", () => {
  it("greets a new connection with state and mood", async () => {
    const { url } = await startSoul(15);
    const face = await connectFace(url);
    const state = await face.waitFor("state");
    const mood = await face.waitFor("mood");
    expect(state).toEqual({ type: "state", state: "idle" });
    expect(mood.type === "mood" && mood.label.length > 0).toBe(true);
    await face.close();
  });

  it("goes to sleep with darkness after 22, wakes on face_seen with a desire greeting", async () => {
    await db.insert(desires).values({ gosinoId: PRIME_GOSINO_ID, text: "chiedigli com'è andata dal cliente", status: "pending" });
    const { url, gateway } = await startSoul(23);
    const face = await connectFace(url);
    await face.waitFor("state");

    face.send({ type: "light", lux: 2 });
    const sleeping = await face.waitFor("state", 2);
    expect(sleeping).toEqual({ type: "state", state: "sleeping" });
    expect(gateway.currentState()).toBe("sleeping");

    face.send({ type: "face_seen" });
    const speak = await face.waitFor("speak");
    expect(speak.type === "speak" && speak.text).toContain("dal cliente");
    expect(gateway.currentState()).toBe("idle");

    // proactivity (Fase 3): the voiced desire is marked done, never repeated
    const remaining = await db.select().from(desires).where(eq(desires.status, "pending"));
    expect(remaining).toHaveLength(0);
    await face.close();
  });

  it("does not sleep in daylight hours even in the dark", async () => {
    const { url, gateway } = await startSoul(15);
    const face = await connectFace(url);
    await face.waitFor("state");
    face.send({ type: "light", lux: 0 });
    // frames are handled in order: when the tap's mood arrives, light is done
    face.send({ type: "tap" });
    await face.waitFor("mood", 2);
    expect(gateway.currentState()).not.toBe("sleeping");
    await face.close();
  });

  it("loud noise startles: alert state, stress up, event persisted", async () => {
    const { url } = await startSoul(15);
    const face = await connectFace(url);
    const hello = await face.waitFor("mood");
    const stressBefore = hello.type === "mood" ? (hello.vars.stress ?? 0) : 0;

    face.send({ type: "noise", db: 95 });
    const alert = await face.waitFor("state", 2);
    expect(alert).toEqual({ type: "state", state: "alert" });
    const mood = await face.waitFor("mood", 2);
    expect(mood.type === "mood" && (mood.vars.stress ?? 0) > stressBefore).toBe(true);

    const rows = await db.select().from(events).where(eq(events.type, "noise"));
    expect(rows.length).toBeGreaterThan(0);
    await face.close();
  });

  it("heard_text triggers the full chat loop: thinking → talking → speak + mood", async () => {
    stub.nextResponse = { text: "Grunf, tutto bene qui in casa." };
    const { url } = await startSoul(15);
    const face = await connectFace(url);
    await face.waitFor("state");

    face.send({ type: "heard_text", text: "come va, UGO?" });
    const speak = await face.waitFor("speak");
    expect(speak.type === "speak" && speak.text).toContain("Grunf");
    const states = face.received.filter((m) => m.type === "state").map((m) => m.state);
    expect(states).toContain("thinking");
    expect(states).toContain("talking");
    expect(states.at(-1)).toBe("idle");
    await face.close();
  });

  it("ignores malformed frames without dropping the connection", async () => {
    const { url } = await startSoul(15);
    const face = await connectFace(url);
    await face.waitFor("state");
    face.send({ type: "not_in_contract", foo: 1 });
    face.send({ type: "tap" });
    const mood = await face.waitFor("mood", 2); // tap still answered after junk
    expect(mood.type).toBe("mood");
    await face.close();
  });
});
