import { randomBytes } from "node:crypto";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  meetings,
  PRIME_GOSINO_ID,
  PRIME_HOUSEHOLD_ID,
  runMigrations,
  transcriptSegments,
} from "@ugo/db";
import {
  EMBED_MODEL,
  startLlmStub,
  startMinio,
  startOllama,
  type LlmStub,
  type MinioHandle,
  type OllamaHandle,
} from "@ugo/factories";
import { DEFAULT_SPECIES_MAP } from "@ugo/shared";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";
import { characterFrom } from "../../src/services/council/character.js";

// Fase 4 soul side, on real infrastructure: presigned upload to real MinIO,
// and recordings interrogable through /chat (real pgvector + real embeddings).

const dataKey = randomBytes(32);
const BUCKET = "ugo-audio";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let minio: MinioHandle;
let s3: S3Client;
let stub: LlmStub;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;
let app: FastifyInstance;

beforeAll(async () => {
  [pg, ollama, minio, stub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startMinio(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);

  s3 = new S3Client({
    endpoint: minio.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
  });
  await s3.send(
    new (await import("@aws-sdk/client-s3")).CreateBucketCommand({ Bucket: BUCKET }),
  );

  const psyche = await PsycheService.restore(db, new Date(), PRIME_GOSINO_ID);
  const chat = new ChatService({
    gosinoId: PRIME_GOSINO_ID,
    householdId: PRIME_HOUSEHOLD_ID,
    character: characterFrom({}),
    db,
    embedder,
    llm: new LlmClient({
      db,
      apiKey: "test",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: stub.baseUrl,
    }),
    psyche,
    dataKey,
  });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: ollama.baseUrl,
    logger: false,
    features: {
      chat,
      psyche,
      // registers the pack routes, where enrolment audio now arrives
      speciesMap: DEFAULT_SPECIES_MAP,
      audio: {
        endpoint: minio.endpoint,
        accessKey: minio.accessKey,
        secretKey: minio.secretKey,
        bucket: BUCKET,
        region: "us-east-1",
      },
    },
  });
});

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop(), minio.container.stop(), stub.close()]);
});

describe("POST /v1/audio/presign", () => {
  it("issues a working presigned PUT: the blob lands in inbox/", async () => {
    const presign = await app.inject({
      method: "POST",
      url: "/v1/audio/presign",
      payload: { filename: "2026-08-07_1830_giro-in-centro.opus" },
    });
    expect(presign.statusCode).toBe(200);
    const { url, key } = presign.json<{ url: string; key: string }>();
    expect(key).toBe("inbox/2026-08-07_1830_giro-in-centro.opus");

    const audioBytes = randomBytes(2048); // opaque payload: content is irrelevant here
    const upload = await fetch(url, { method: "PUT", body: audioBytes });
    expect(upload.status).toBe(200);

    const s3 = new S3Client({
      endpoint: minio.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
    });
    const listing = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "inbox/" }));
    expect((listing.Contents ?? []).map((o) => o.Key)).toContain(key);
  });

  it("rejects path traversal and non-audio extensions", async () => {
    for (const filename of ["../../etc/passwd", "note.txt", "a/b.opus", ".hidden.opus"]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/audio/presign",
        payload: { filename },
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe("recordings interrogable through /chat (§4.2)", () => {
  it("feeds matching transcript segments, decrypted, into the dynamic block", async () => {
    const [meeting] = await db
      .insert(meetings)
      .values({ gosinoId: PRIME_GOSINO_ID, platform: "ear", title: "giro-in-centro", status: "archived" })
      .returning({ id: meetings.id });
    if (meeting === undefined) throw new Error("meeting insert failed");
    const spoken = "Ivan ha detto che la consegna dei gusci slitta a giovedì prossimo.";
    const [embedding] = await embedder.embed([spoken]);
    await db.insert(transcriptSegments).values({
      householdId: PRIME_HOUSEHOLD_ID,
      meetingId: meeting.id,
      t0: 12.5,
      t1: 16.0,
      text: encryptText(spoken, dataKey),
      embedding,
    });

    stub.nextResponse = { text: "Ivan aveva detto che slitta a giovedì. Grunf." };
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { channel: "home", text: "cosa aveva detto Ivan sulla consegna?" },
    });
    expect(response.statusCode).toBe(200);
    const captured = stub.requests.at(-1);
    const dynamicBlock = captured?.body.system[2]?.text ?? "";
    expect(dynamicBlock).toContain("Dalle registrazioni:");
    expect(dynamicBlock).toContain("slitta a giovedì");
  });
});

/**
 * The panel used to presign and PUT straight to object storage. That is a
 * cross-origin request, and a bucket without a CORS rule never even receives
 * it — the browser reports "Failed to fetch", which is what the owner saw.
 * MinIO is permissive by default, so these tests could not have caught it;
 * now the audio comes through soul and there is only one origin to trust.
 */
describe("POST /v1/beings/:id/enroll/voice/audio", () => {
  const audio = Buffer.from("not really webm, but it is bytes and it is ours");

  async function newBeing(fields: Record<string, unknown> = {}): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/beings",
      payload: { displayName: "Francesco", ...fields },
    });
    return response.json<{ id: string }>().id;
  }

  it("stores the audio itself and files the enrollment for tonight", async () => {
    const beingId = await newBeing();
    const response = await app.inject({
      method: "POST",
      url: `/v1/beings/${beingId}/enroll/voice/audio`,
      headers: { "content-type": "audio/webm" },
      payload: audio,
    });

    expect(response.statusCode).toBe(202);
    const { objectKey } = response.json<{ objectKey: string }>();
    // secondi + nonce anti-collisione: due depositi ravvicinati per lo stesso
    // essere non si sovrascrivono più nel bucket (#50)
    expect(objectKey).toMatch(/^inbox\/enroll_[0-9a-f]{8}_\d{14}_[0-9a-f]{8}\.webm$/);

    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "inbox/" }));
    const stored = (listed.Contents ?? []).find((item) => item.Key === objectKey);
    expect(stored?.Size).toBe(audio.length);
  });

  it("refuses a minor BEFORE the audio ever reaches the bucket", async () => {
    const beingId = await newBeing({ displayName: "Sofia", isMinor: true });
    const before = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "inbox/" }));

    const response = await app.inject({
      method: "POST",
      url: `/v1/beings/${beingId}/enroll/voice/audio`,
      headers: { "content-type": "audio/webm" },
      payload: audio,
    });
    expect(response.statusCode).toBe(403);

    const after = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "inbox/" }));
    expect((after.Contents ?? []).length).toBe((before.Contents ?? []).length);
  });

  it("says so plainly when no audio arrived", async () => {
    const beingId = await newBeing({ displayName: "Monika" });
    const response = await app.inject({
      method: "POST",
      url: `/v1/beings/${beingId}/enroll/voice/audio`,
      headers: { "content-type": "audio/webm" },
      payload: Buffer.alloc(0),
    });
    expect(response.statusCode).toBe(400);
  });
});
