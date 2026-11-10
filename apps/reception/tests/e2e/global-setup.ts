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
  accounts,
  runMigrations,
} from "@ugo/db";
import { openRouterKey } from "@ugo/factories";

/**
 * Real backend for the reception E2E (Zero-Mock): Postgres+pgvector and the
 * REAL OpenRouter for every model (ADR-125/131: no stubs, the key comes
 * from the environment), and soul itself as a child
 * process on the production entrypoint — the same dual-credential path the
 * public container uses. The customer, their gosino and their token are
 * seeded here and handed to the tests via env.
 */

const SOUL_PORT = 3988;
const RECEPTION_TOKEN = "e2e-reception-secret";

let pg: StartedPostgreSqlContainer;
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
  // prima la chiave: un e2e senza fornitore vero fallisce qui, non a metà
  const apiKey = openRouterKey();
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());

  // the house, the exemplar, the customer, the assignment, the token — the
  // same rows the panel would write, seeded straight so the E2E stays fast
  const db = createDbClient(pg.getConnectionUri());
  const [house] = await db
    .insert(accounts)
    .values({ slug: "casa-e2e", name: "casa-e2e" })
    .returning({ id: accounts.id });
  if (house === undefined) throw new Error("house not seeded");
  const [exemplar] = await db
    .insert(gosini)
    .values({ accountId: house.id, name: "Ugo", locationLabel: "officina" })
    .returning({ id: gosini.id });
  if (exemplar === undefined) throw new Error("gosino not seeded");
  const [customer] = await db
    .insert(customers)
    .values({ accountId: house.id, name: "Rossi SRL", slug: "rossi-srl" })
    .returning({ id: customers.id });
  if (customer === undefined) throw new Error("customer not seeded");
  await db
    .insert(customerGosini)
    .values({ accountId: house.id, customerId: customer.id, gosinoId: exemplar.id });
  await db.insert(customerRepos).values({
    accountId: house.id,
    customerId: customer.id,
    remoteUrl: "https://github.com/studio/progetto",
    lastCommitSha: "abc1234def5678",
    status: "ok",
  });
  const customerToken = randomBytes(32).toString("base64url");
  await db.insert(customerAccessTokens).values({
    accountId: house.id,
    customerId: customer.id,
    tokenHash: createHash("sha256").update(customerToken, "utf8").digest("hex"),
    label: "e2e",
  });
  await db.$client.end();

  soul = spawn("node", ["../soul/dist/index.js"], {
    stdio: "inherit",
    env: {
      ...inherited(),
      DATABASE_URL: pg.getConnectionUri(),
      OPENROUTER_API_KEY: apiKey,
      UGO_DAILY_BUDGET_USD: "5",
      UGO_DATA_KEY: randomBytes(32).toString("base64"),
      UGO_INTERNAL_TOKEN: "e2e-internal",
      UGO_RECEPTION_TOKEN: RECEPTION_TOKEN,
      // hermetic: '/works' asks GitHub live on the hot path, and an e2e that
      // waits on the real api.github.com fails whenever GitHub is slow (seen
      // in CI). A dead loopback port refuses in milliseconds instead.
      GITHUB_API_URL: "http://127.0.0.1:9",
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
    await pg.stop();
  };
}
