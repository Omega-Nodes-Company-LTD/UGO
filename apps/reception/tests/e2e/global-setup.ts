import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  customerAccessTokens,
  customerGosini,
  customerRepos,
  customers,
  gosini,
  households,
  runMigrations,
} from "@ugo/db";
import { startLlmStub, startOllama, type LlmStub, type OllamaHandle } from "@ugo/factories";

/**
 * Real backend for the reception E2E (Zero-Mock): Postgres+pgvector, real
 * Ollama embeddings, the network-level LLM stub, and soul itself as a child
 * process on the production entrypoint — the same dual-credential path the
 * public container uses. The customer, their gosino and their token are
 * seeded here and handed to the tests via env.
 */

const SOUL_PORT = 3988;
const RECEPTION_TOKEN = "e2e-reception-secret";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let stub: LlmStub;
let soul: ChildProcess;

async function waitForHealth(url: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
  [pg, ollama, stub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  stub.nextResponse = { text: "Grunf: la funzione di avvio sta in main.ts." };

  // the house, the exemplar, the customer, the assignment, the token — the
  // same rows the panel would write, seeded straight so the E2E stays fast
  const db = createDbClient(pg.getConnectionUri());
  const [house] = await db
    .insert(households)
    .values({ slug: "casa-e2e", name: "casa-e2e" })
    .returning({ id: households.id });
  if (house === undefined) throw new Error("house not seeded");
  const [exemplar] = await db
    .insert(gosini)
    .values({ householdId: house.id, name: "Ugo", locationLabel: "officina" })
    .returning({ id: gosini.id });
  if (exemplar === undefined) throw new Error("gosino not seeded");
  const [customer] = await db
    .insert(customers)
    .values({ householdId: house.id, name: "Rossi SRL", slug: "rossi-srl" })
    .returning({ id: customers.id });
  if (customer === undefined) throw new Error("customer not seeded");
  await db
    .insert(customerGosini)
    .values({ householdId: house.id, customerId: customer.id, gosinoId: exemplar.id });
  await db.insert(customerRepos).values({
    householdId: house.id,
    customerId: customer.id,
    remoteUrl: "https://github.com/studio/progetto",
    lastCommitSha: "abc1234def5678",
    status: "ok",
  });
  const customerToken = randomBytes(32).toString("base64url");
  await db.insert(customerAccessTokens).values({
    householdId: house.id,
    customerId: customer.id,
    tokenHash: createHash("sha256").update(customerToken, "utf8").digest("hex"),
    label: "e2e",
  });
  await db.$client.end();

  soul = spawn("node", ["../soul/dist/index.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: pg.getConnectionUri(),
      OLLAMA_URL: ollama.baseUrl,
      OLLAMA_EMBED_MODEL: "nomic-embed-text",
      ANTHROPIC_API_KEY: "e2e-key",
      ANTHROPIC_BASE_URL: stub.baseUrl,
      UGO_DAILY_BUDGET_USD: "5",
      UGO_DATA_KEY: randomBytes(32).toString("base64"),
      UGO_INTERNAL_TOKEN: "e2e-internal",
      UGO_RECEPTION_TOKEN: RECEPTION_TOKEN,
      UGO_AUTO_MIGRATE: "false",
      PORT: String(SOUL_PORT),
      TZ: "Europe/Rome",
    },
  });
  await waitForHealth(`http://127.0.0.1:${String(SOUL_PORT)}/health`);

  // the Next server (webServer) starts after this and reads both of these
  process.env.SOUL_URL = `http://127.0.0.1:${String(SOUL_PORT)}`;
  process.env.UGO_RECEPTION_TOKEN = RECEPTION_TOKEN;
  process.env.UGO_E2E_CUSTOMER_TOKEN = customerToken;

  return async () => {
    soul.kill("SIGTERM");
    await Promise.all([pg.stop(), ollama.container.stop(), stub.close()]);
  };
}
