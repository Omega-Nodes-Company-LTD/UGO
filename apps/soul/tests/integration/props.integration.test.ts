import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  events,
  gosini,
  accounts,
  placedProps,
  propStock,
  rooms,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import type { ServerToFaceMessage } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";

/**
 * Gli arredi, dal pannello al chiosco (ADR-056).
 *
 * Le due promesse che valgono un test vero, e che nessun test di unità può
 * dimostrare, sono:
 *
 * 1. **arrivano a scena aperta.** Il `roster` si manda solo all'apertura del
 *    socket; se gli arredi seguissero quella cadenza, il proprietario dovrebbe
 *    ricaricare il chiosco a ogni cuscino — e un pannello così si legge come
 *    rotto. Qui il socket è aperto **prima** che l'arredo esista.
 * 2. **la scorta e il piazzamento sono un atto solo.** In due punti diversi si
 *    otterrebbe una casa con un cuscino in più e una scorta intatta, che non è
 *    un errore che qualcuno segnala perché non è un errore che si vede.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let url = "";
let token = "";
let house = "";

/** Un muso finto: apre, ascolta, e aspetta un tipo di frame. */
async function connect(query: string): Promise<{
  received: ServerToFaceMessage[];
  waitFor: (type: ServerToFaceMessage["type"], count?: number) => Promise<ServerToFaceMessage>;
  close: () => void;
}> {
  const socket = new WebSocket(`${url}${query}`, { headers: { authorization: `Bearer ${token}` } });
  const received: ServerToFaceMessage[] = [];
  socket.on("message", (raw: Buffer) => {
    received.push(JSON.parse(raw.toString()) as ServerToFaceMessage);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    received,
    waitFor: async (type, count = 1) => {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const matches = received.filter((message) => message.type === type);
        const hit = matches[count - 1];
        if (hit !== undefined) return hit;
        if (Date.now() > deadline) throw new Error(`nessun "${type}" x${String(count)}`);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    },
    close: () => {
      socket.close();
    },
  };
}

const post = async (path: string, body: unknown) =>
  app.inject({
    method: "POST",
    url: path,
    headers: { authorization: `Bearer ${token}` },
    payload: body as never,
  });

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);

  const [born] = await db
    .insert(accounts)
    .values({ slug: "casa-arredi", name: "Arredi" })
    .returning({ id: accounts.id });
  house = born?.id ?? "";
  const [creature] = await db
    .insert(gosini)
    .values({ accountId: house, name: "ugo", locationLabel: "cucina" })
    .returning({ id: gosini.id });
  await db.insert(rooms).values({ accountId: house, name: "Cucina", slug: "cucina" });

  const psyche = await PsycheService.restore(db, new Date(), creature?.id ?? "");
  const chat = new ChatService({
    gosinoId: creature?.id ?? "",
    accountId: house,
    character: characterFrom({}),
    db,
    // le rotte sotto test non li sfiorano; se un giorno lo faranno, questo
    // cast smette di compilare per finta e il test lo dice subito
    embedder: undefined as never,
    llm: undefined as never,
    psyche,
    dataKey: randomBytes(32),
  });
  const gateway = new FaceGateway({ gosinoId: creature?.id ?? "", db, chat, psyche });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: { chat, psyche, face: gateway },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no address");
  url = `ws://127.0.0.1:${String(address.port)}/v1/face`;
  token = (await issueToken(db, { accountId: house, role: "owner", label: "prova" })).token;
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
});

describe("gli arredi sul filo", () => {
  it("pushes the scene to a socket that is ALREADY open", async () => {
    const face = await connect("?stanza=cucina");
    // all'apertura: una stanza spoglia è una scena vuota, non l'assenza di una
    const first = await face.waitFor("scene");
    expect(first).toEqual({ type: "scene", props: [] });

    const made = await post("/v1/props?stanza=cucina", { kind: "cushion", x: 0.3, z: -0.2 });
    expect(made.statusCode).toBe(201);

    const pushed = (await face.waitFor("scene", 2)) as { type: "scene"; props: { kind: string }[] };
    expect(pushed.props.map((p) => p.kind)).toEqual(["cushion"]);
    face.close();
  });

  // NB: che un chiosco indirizzato `?gosino=` erediti la stanza in cui la
  // creatura vive è provato dal test di unità su `roomForSocket` — qui non c'è
  // un registro, e montarne uno finto proverebbe il finto invece della regola.

  it("never tags the scene with a creature: a cushion belongs to the room", async () => {
    const face = await connect("?stanza=cucina");
    const scene = await face.waitFor("scene");
    expect(Object.keys(scene)).not.toContain("who");
    face.close();
  });
});

describe("le scorte", () => {
  it("counts down, and refuses when the house has run out", async () => {
    await db.insert(propStock).values({ accountId: house, kind: "ball", remaining: 1 });

    const first = await post("/v1/props?stanza=cucina", { kind: "ball", x: 0, z: 0 });
    expect(first.statusCode).toBe(201);
    const [after] = await db
      .select({ remaining: propStock.remaining })
      .from(propStock)
      .where(and(eq(propStock.accountId, house), eq(propStock.kind, "ball")));
    expect(after?.remaining).toBe(0);

    const second = await post("/v1/props?stanza=cucina", { kind: "ball", x: 0.1, z: 0.1 });
    expect(second.statusCode).toBe(409);
    // e non ha lasciato mezzo arredo dietro di sé
    const balls = await db
      .select({ id: placedProps.id })
      .from(placedProps)
      .where(and(eq(placedProps.accountId, house), eq(placedProps.kind, "ball")));
    expect(balls).toHaveLength(1);
  });

  /**
   * Togliere restituisce. Senza, il pannello punirebbe il ripensamento — e uno
   * strumento che punisce il ripensamento è uno strumento che si ha paura di
   * toccare.
   */
  it("gives the stock back when the owner takes the prop away", async () => {
    const [ball] = await db
      .select({ id: placedProps.id })
      .from(placedProps)
      .where(and(eq(placedProps.accountId, house), eq(placedProps.kind, "ball")));
    const gone = await app.inject({
      method: "DELETE",
      url: `/v1/props/${ball?.id ?? ""}?stanza=cucina`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(gone.statusCode).toBe(200);
    const [back] = await db
      .select({ remaining: propStock.remaining })
      .from(propStock)
      .where(and(eq(propStock.accountId, house), eq(propStock.kind, "ball")));
    expect(back?.remaining).toBe(1);
  });

  /** Una casa senza riga non ha limiti, e non richiede una semina. */
  it("lets a house with no stock row place whatever it likes", async () => {
    for (let i = 0; i < 3; i += 1) {
      const made = await post("/v1/props?stanza=cucina", { kind: "grass", x: 0.1 * i, z: 0 });
      expect(made.statusCode).toBe(201);
    }
  });

  it("refuses to fill a room past the ceiling", async () => {
    // ce ne sono già alcuni; si riempie fino al tetto e poi si insiste
    let last = 200;
    for (let i = 0; i < 12 && last < 400; i += 1) {
      last = (await post("/v1/props?stanza=cucina", { kind: "bush", x: 0, z: 0.1 * i })).statusCode;
    }
    expect(last).toBe(409);
  });

  it("refuses a room this house does not have", async () => {
    const made = await post("/v1/props?stanza=sottoscala", { kind: "cushion", x: 0, z: 0 });
    expect(made.statusCode).toBe(404);
  });
});

describe("used_prop", () => {
  /**
   * L'unico evento che la creatura si procura da sé: il corpo decide da solo di
   * andare sul cuscino (ADR-026 §6, zero token) e lo dichiara. Va registrato
   * come qualunque altro, o «cosa ha fatto oggi» avrebbe un buco esattamente
   * dove sta l'unica cosa che ha fatto di sua iniziativa.
   */
  it("is journalled when the body says it went and used something", async () => {
    const socket = new WebSocket(`${url}?stanza=cucina`, {
      headers: { authorization: `Bearer ${token}` },
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ type: "used_prop", kind: "cushion" }));

    const deadline = Date.now() + 10_000;
    let seen: unknown[] = [];
    while (Date.now() < deadline && seen.length === 0) {
      seen = await db.select().from(events).where(eq(events.type, "used_prop"));
      if (seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 60));
    }
    expect(seen).toHaveLength(1);
    socket.close();
  });
});
