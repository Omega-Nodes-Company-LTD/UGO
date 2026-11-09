import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { runMigrations } from "@ugo/db";
import {
  openRouterKey,
  startMinio,
  startOllama,
  type MinioHandle,
  type OllamaHandle,
} from "@ugo/factories";

/**
 * Real backend for the E2E run (Zero-Mock): Postgres+pgvector container,
 * real Ollama embeddings, the REAL OpenRouter (ADR-125: no stubs — the key
 * comes from the environment), and soul itself as a child process running
 * the production entrypoint (dist/index.js).
 */

const SOUL_PORT = 3987;
const E2E_TOKEN = "e2e-operator-token";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let minio: MinioHandle;
let soul: ChildProcess;

/**
 * L'ambiente ereditato, senza i nomi che ADR-125 ha ritirato: soul si
 * rifiuta di partire se li trova, e un e2e non deve dipendere da cosa c'è
 * nella shell di chi lo lancia (un terminale con ANTHROPIC_BASE_URL era già
 * abbastanza per un «soul did not become healthy» muto).
 */
const RETIRED = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "UGO_CHAT_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "UGO_TTS_MODEL",
  "UGO_TTS_VOICE",
  "OPENROUTER_BASE_URL",
]);
const inherited = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const name of RETIRED) Reflect.deleteProperty(env, name);
  return env;
};

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
  // prima la chiave: un e2e senza fornitore vero fallisce qui, non a metà
  const apiKey = openRouterKey();
  [pg, ollama, minio] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startMinio(),
  ]);
  await runMigrations(pg.getConnectionUri());

  soul = spawn("node", ["../soul/dist/index.js"], {
    stdio: "inherit",
    env: {
      ...inherited(),
      DATABASE_URL: pg.getConnectionUri(),
      // deliberately unset, exactly like the real deployment: the Nano 33
      // firmware is shelved, so there is no broker and health says "off"
      OLLAMA_URL: ollama.baseUrl,
      OLLAMA_EMBED_MODEL: "nomic-embed-text",
      OPENROUTER_API_KEY: apiKey,
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
    await Promise.allSettled([pg.stop(), ollama.container.stop(), minio.container.stop()]);
  };
}
