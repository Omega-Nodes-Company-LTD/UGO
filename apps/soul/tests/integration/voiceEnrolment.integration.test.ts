import { randomBytes } from "node:crypto";
import { CreateBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  type DbClient,
  desires,
  events,
  gosini,
  households,
  perceptionEvents,
  recognitionProfiles,
  runMigrations,
  unknownPrints,
} from "@ugo/db";
import { startMinio, startPostgres, type MinioHandle } from "@ugo/factories";
import { loadSpeciesMap, type ServerToFaceMessage } from "@ugo/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { FaceGateway } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import {
  openVoiceAsk,
  storeVoiceSample,
  voiceAskOpen,
  VOICE_ASK_WINDOW_MIN,
  VOICE_WANTED_KIND,
} from "../../src/services/voiceEnrolment.js";
import { buildServer } from "../../src/server.js";

/**
 * La voce dopo il volto, dal chiosco (ADR-057, la seconda metà).
 *
 * Le promesse che valgono un test vero:
 *
 * 1. il claim del volto **apre** la richiesta — desiderio + finestra — e NON
 *    la apre per un minore, un opt-out audio, o chi un profilo ce l'ha già;
 * 2. il chiosco può depositare un campione **solo dentro la finestra**: fuori,
 *    il frame si ignora e nel bucket non finisce un byte;
 * 3. un campione basta: la finestra si consuma, non è un raccoglitore;
 * 4. il deposito è lo stesso del pannello, con gli stessi rifiuti a monte.
 */

const BUCKET = "ugo-audio";

let container: StartedPostgreSqlContainer;
let minio: MinioHandle;
let s3: S3Client;
let db: DbClient;
let app: FastifyInstance;
let token = "";
let house = "";
let gosinoId = "";
let gateway: FaceGateway;
let storage: { endpoint: string; accessKey: string; secretKey: string; bucket: string; region: string };

async function newBeing(fields: Record<string, unknown> = {}): Promise<string> {
  const [born] = await db
    .insert(beings)
    .values({ householdId: house, displayName: "Marco", ...fields })
    .returning({ id: beings.id });
  if (born === undefined) throw new Error("being insert failed");
  return born.id;
}

async function inboxKeys(): Promise<string[]> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "inbox/" }));
  return (listed.Contents ?? []).map((item) => item.Key ?? "");
}

beforeAll(async () => {
  const [pg, blob] = await Promise.all([startPostgres(), startMinio()]);
  container = pg.container;
  minio = blob;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  s3 = new S3Client({
    endpoint: minio.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
  });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  storage = {
    endpoint: minio.endpoint,
    accessKey: minio.accessKey,
    secretKey: minio.secretKey,
    bucket: BUCKET,
    region: "us-east-1",
  };

  const [born] = await db
    .insert(households)
    .values({ slug: "casa-voce", name: "Voce" })
    .returning({ id: households.id });
  house = born?.id ?? "";
  const [creature] = await db
    .insert(gosini)
    .values({ householdId: house, name: "ugo" })
    .returning({ id: gosini.id });
  gosinoId = creature?.id ?? "";

  const psyche = await PsycheService.restore(db, new Date(), gosinoId);
  const chat = new ChatService({
    gosinoId,
    character: characterFrom({}),
    db,
    // il percorso sotto test non li sfiora; se un giorno lo farà, questo cast
    // smette di compilare per finta e il test lo dice subito
    embedder: undefined as never,
    llm: undefined as never,
    psyche,
    dataKey: randomBytes(32),
  });
  gateway = new FaceGateway({
    gosinoId,
    db,
    chat,
    psyche,
    voiceSample: (input) => storeVoiceSample({ db, storage }, { householdId: house, ...input }),
  });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat,
      psyche,
      // la pagina «I volti» legge /v1/pack: serve la mappa delle specie
      speciesMap: loadSpeciesMap(undefined),
      // il claim che "impara" sempre: qui si prova ciò che viene DOPO il
      // riconoscitore, non il riconoscitore (che ha i suoi test in ops/jobs)
      prints: () => ({ claimPrint: () => Promise.resolve("learned" as const) }),
    },
  });
  token = (await issueToken(db, { householdId: house, role: "owner", label: "prova" })).token;
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await Promise.all([container.stop(), minio.container.stop()]);
});

describe("openVoiceAsk: il claim apre la richiesta", () => {
  it("per un adulto senza profilo: desiderio scritto e finestra aperta", async () => {
    const beingId = await newBeing({ displayName: "Francesco" });
    const opened = await openVoiceAsk(db, { householdId: house, beingId });
    expect(opened).toEqual({ name: "Francesco" });

    const [wish] = await db
      .select({ text: desires.text })
      .from(desires)
      .where(eq(desires.gosinoId, gosinoId))
      .orderBy(desc(desires.createdAt))
      .limit(1);
    expect(wish?.text).toContain("Francesco");
    await expect(voiceAskOpen(db, beingId)).resolves.toBe(true);
  });

  it("MAI per un minore o un opt-out audio: nessuna riga, nessuna finestra", async () => {
    for (const fields of [{ isMinor: true }, { noAudio: true }]) {
      const beingId = await newBeing({ displayName: "Sofia", ...fields });
      await expect(openVoiceAsk(db, { householdId: house, beingId })).resolves.toBeUndefined();
      await expect(voiceAskOpen(db, beingId)).resolves.toBe(false);
    }
  });

  it("non richiede la voce a chi già riconosciamo", async () => {
    const beingId = await newBeing({ displayName: "Anna" });
    await db.insert(recognitionProfiles).values({
      beingId,
      householdId: house,
      modality: "voice",
      model: "ecapa",
      dimensions: 4,
      payload: randomBytes(16),
    });
    await expect(openVoiceAsk(db, { householdId: house, beingId })).resolves.toBeUndefined();
  });
});

describe("/v1/pack dice anche il volto (il 404 della pagina «I volti»)", () => {
  it("hasFaceProfile è vero per chi ha un'impronta del volto, falso per gli altri", async () => {
    // la pagina «I volti» chiamava GET /v1/beings, che non è MAI esistita:
    // in produzione moriva con «HTTP 404» sotto il selettore. Adesso legge
    // /v1/pack, e /v1/pack deve saper dire chi ha un profilo del volto.
    const faced = await newBeing({ displayName: "Volto Noto" });
    await db.insert(recognitionProfiles).values({
      beingId: faced,
      householdId: house,
      modality: "face",
      model: "arcface",
      dimensions: 4,
      payload: randomBytes(16),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/pack",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const pack = response.json<{
      beings: { displayName: string; hasFaceProfile: boolean }[];
    }>();
    const known = pack.beings.find((being) => being.displayName === "Volto Noto");
    expect(known?.hasFaceProfile).toBe(true);
    expect(
      pack.beings.filter((being) => being.displayName !== "Volto Noto")
        .every((being) => !being.hasFaceProfile),
    ).toBe(true);
  });
});

describe("voiceAskOpen: la finestra", () => {
  it("chiusa quando la richiesta è più vecchia della finestra", async () => {
    const beingId = await newBeing();
    const stale = new Date(Date.now() - (VOICE_ASK_WINDOW_MIN + 5) * 60_000);
    await db.insert(perceptionEvents).values({
      gosinoId,
      modality: "audio_speech",
      beingId,
      observed: { kind: VOICE_WANTED_KIND, channel: "home" },
      occurredAt: stale,
    });
    await expect(voiceAskOpen(db, beingId)).resolves.toBe(false);
  });
});

describe("il chiosco deposita (FaceGateway)", () => {
  const clip = Buffer.from("finto webm, ma sono byte e sono nostri");
  const sent: ServerToFaceMessage[] = [];
  const send = (message: ServerToFaceMessage): void => {
    sent.push(message);
  };
  const frame = (beingId: string): string =>
    JSON.stringify({ type: "voice_sample", beingId, audio: clip.toString("base64") });

  it("fuori dalla finestra il frame si ignora: zero byte nel bucket", async () => {
    const beingId = await newBeing({ displayName: "Nessuno" });
    const before = await inboxKeys();
    expect(await gateway.handleRaw(frame(beingId), send)).toBe(true);
    expect(await inboxKeys()).toEqual(before);
    const [logged] = await db
      .select({ type: events.type })
      .from(events)
      .where(and(eq(events.gosinoId, gosinoId), eq(events.type, "voice_sample_rejected")))
      .limit(1);
    expect(logged?.type).toBe("voice_sample_rejected");
  });

  it("dentro la finestra il clip finisce in inbox/ e l'arruolamento è in coda", async () => {
    const beingId = await newBeing({ displayName: "Ivan" });
    await openVoiceAsk(db, { householdId: house, beingId });
    const before = await inboxKeys();

    expect(await gateway.handleRaw(frame(beingId), send)).toBe(true);

    const after = await inboxKeys();
    expect(after.length).toBe(before.length + 1);
    const [queued] = await db
      .select({ observed: perceptionEvents.observed })
      .from(perceptionEvents)
      .where(
        and(
          eq(perceptionEvents.beingId, beingId),
          sql`${perceptionEvents.observed}->>'kind' = 'enrollment_requested'`,
        ),
      );
    expect(queued).toBeDefined();
    // e lo dice a voce: chi ha appena parlato deve sapere che è servito
    expect(sent.some((m) => m.type === "speak" && m.text.includes("voce"))).toBe(true);
  });

  it("un campione basta: il secondo trova la finestra consumata", async () => {
    const beingId = await newBeing({ displayName: "Piero" });
    await openVoiceAsk(db, { householdId: house, beingId });
    expect(await gateway.handleRaw(frame(beingId), send)).toBe(true);
    const before = await inboxKeys();
    expect(await gateway.handleRaw(frame(beingId), send)).toBe(true);
    expect(await inboxKeys()).toEqual(before);
  });
});

describe("l'invito sul filo", () => {
  it("broadcastAskVoice raggiunge ogni corpo connesso", () => {
    const got: ServerToFaceMessage[] = [];
    const sender = (message: ServerToFaceMessage): void => {
      got.push(message);
    };
    gateway.registerSender(sender);
    gateway.broadcastAskVoice("b-1", "Marco");
    gateway.unregisterSender(sender);
    expect(got).toEqual([{ type: "enroll_voice", beingId: "b-1", name: "Marco" }]);
  });
});

describe("POST /v1/prints/:id/claim apre la voce", () => {
  async function plantPrint(): Promise<string> {
    const [planted] = await db
      .insert(unknownPrints)
      .values({
        householdId: house,
        modality: "face",
        model: "mobilefacenet",
        dimensions: 4,
        payload: randomBytes(32),
      })
      .returning({ id: unknownPrints.id });
    if (planted === undefined) throw new Error("print insert failed");
    return planted.id;
  }

  it("dopo «learned» la risposta dice voiceAsked e la finestra è aperta", async () => {
    const beingId = await newBeing({ displayName: "Renata" });
    const response = await app.inject({
      method: "POST",
      url: `/v1/prints/${await plantPrint()}/claim`,
      headers: { authorization: `Bearer ${token}` },
      payload: { beingId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ learned: true, voiceAsked: true });
    await expect(voiceAskOpen(db, beingId)).resolves.toBe(true);
  });

  it("per un minore il claim resta un claim: voiceAsked è false", async () => {
    const beingId = await newBeing({ displayName: "Nino", isMinor: true });
    const response = await app.inject({
      method: "POST",
      url: `/v1/prints/${await plantPrint()}/claim`,
      headers: { authorization: `Bearer ${token}` },
      payload: { beingId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ learned: true, voiceAsked: false });
    await expect(voiceAskOpen(db, beingId)).resolves.toBe(false);
  });
});
