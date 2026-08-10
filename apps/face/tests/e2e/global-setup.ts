import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { runMigrations } from "@ugo/db";
import {
  startLlmStub,
  startMinio,
  startOllama,
  type LlmStub,
  type MinioHandle,
  type OllamaHandle,
} from "@ugo/factories";

/**
 * Real backend for the E2E run (Zero-Mock): Postgres+pgvector container,
 * real Ollama embeddings, network-level LLM stub, and soul itself as a
 * child process running the production entrypoint (dist/index.js).
 */

const SOUL_PORT = 3987;
const E2E_TOKEN = "e2e-operator-token";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let minio: MinioHandle;
let stub: LlmStub;
let soul: ChildProcess;

async function waitForHealth(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 200 || response.status === 503) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("soul did not become healthy in time");
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  [pg, ollama, minio, stub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startMinio(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  stub.nextResponse = { text: "Grunf, ti sento forte e chiaro." };

  soul = spawn("node", ["../soul/dist/index.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: pg.getConnectionUri(),
      MQTT_URL: "mqtt://127.0.0.1:1",
      MQTT_USER: "soul",
      MQTT_PASS: "e2e-only",
      OLLAMA_URL: ollama.baseUrl,
      OLLAMA_EMBED_MODEL: "nomic-embed-text",
      ANTHROPIC_API_KEY: "e2e-key",
      ANTHROPIC_BASE_URL: stub.baseUrl,
      UGO_DAILY_BUDGET_USD: "5",
      UGO_DATA_KEY: randomBytes(32).toString("base64"),
      UGO_INTERNAL_TOKEN: E2E_TOKEN,
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY: minio.accessKey,
      S3_SECRET_KEY: minio.secretKey,
      S3_BUCKET_AUDIO: "ugo-audio",
      PORT: String(SOUL_PORT),
      TZ: "Europe/Rome",
    },
  });
  await waitForHealth(`http://127.0.0.1:${String(SOUL_PORT)}/health`);
  process.env.UGO_E2E_SOUL_WS = `ws://127.0.0.1:${String(SOUL_PORT)}/v1/face`;
  process.env.UGO_E2E_TOKEN = E2E_TOKEN;
  process.env.UGO_E2E_DATABASE_URL = pg.getConnectionUri();
  process.env.UGO_E2E_S3_ENDPOINT = minio.endpoint;
  process.env.UGO_E2E_S3_ACCESS_KEY = minio.accessKey;
  process.env.UGO_E2E_S3_SECRET_KEY = minio.secretKey;

  // the audio bucket must exist before the first presigned PUT
  const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    endpoint: minio.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
  });
  await s3.send(new CreateBucketCommand({ Bucket: "ugo-audio" }));

  return async () => {
    soul.kill("SIGTERM");
    await Promise.allSettled([pg.stop(), ollama.container.stop(), minio.container.stop(), stub.close()]);
  };
}
