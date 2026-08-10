import { randomBytes } from "node:crypto";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, meetings, runMigrations, transcriptSegments, type DbClient } from "@ugo/db";
import {
  EMBED_MODEL,
  startLlmStub,
  startMinio,
  startOllama,
  type LlmStub,
  type MinioHandle,
  type OllamaHandle,
} from "@ugo/factories";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

// Fase 4 soul side, on real infrastructure: presigned upload to real MinIO,
// and recordings interrogable through /chat (real pgvector + real embeddings).

const dataKey = randomBytes(32);
const BUCKET = "ugo-audio";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let minio: MinioHandle;
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

  const s3 = new S3Client({
    endpoint: minio.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
  });
  await s3.send(
    new (await import("@aws-sdk/client-s3")).CreateBucketCommand({ Bucket: BUCKET }),
  );

  const psyche = await PsycheService.restore(db);
  const chat = new ChatService({
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
      .values({ platform: "ear", title: "giro-in-centro", status: "archived" })
      .returning({ id: meetings.id });
    if (meeting === undefined) throw new Error("meeting insert failed");
    const spoken = "Ivan ha detto che la consegna dei gusci slitta a giovedì prossimo.";
    const [embedding] = await embedder.embed([spoken]);
    await db.insert(transcriptSegments).values({
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
