import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accessTokens, accounts, createDbClient, PRIME_ACCOUNT_ID, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { exportSoulArchive } from "../../src/services/soulExport/exportSoul.js";
import { SetupGuard } from "../../src/home/guard.js";
import { HomeSecrets } from "../../src/home/secrets.js";
import { registerSetupRoutes } from "../../src/home/setupRoutes.js";
import { SetupService } from "../../src/home/setupService.js";

/**
 * «A casa tua», la procedura guidata (ADR-132, MKT-10.6): server vero, database
 * vero, file veri su disco, e una casa ospitata (A) da cui si esporta un
 * archivio vero. L'installazione (B) ha un'ALTRA chiave maestra.
 *
 * L'archivio non ha testi da vettorizzare: qui non serve la rete. Il percorso
 * con i vettori sul fornitore vero sta in `soulImportEmbeddings`.
 */

const MASTER_A = randomBytes(32);
const SECRET = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";
const KDF = { log2N: 10, r: 8, p: 1 } as const;
const MODEL = "openai/text-embedding-3-small";
/** non è una chiave vera e non deve esserlo: il setup non la usa se non c'è nulla da vettorizzare */
const USER_KEY = "sk-or-v1-prova-di-setup-0123456789";

const stops: (() => Promise<void>)[] = [];
const dirs: string[] = [];
let archive: Buffer;

async function freshDatabase(): Promise<DbClient> {
  const started = await startPostgres();
  const container: StartedPostgreSqlContainer = started.container;
  await runMigrations(started.url);
  const db = createDbClient(started.url);
  stops.push(async () => {
    await db.$client.end();
    await container.stop();
  });
  return db;
}

interface Rig {
  db: DbClient;
  dir: string;
  secrets: HomeSecrets;
  service: SetupService;
  guard: SetupGuard;
  app: FastifyInstance;
  base: string;
}

async function rig(options: { maxArchiveBytes?: number } = {}): Promise<Rig> {
  const db = await freshDatabase();
  const dir = await mkdtemp(join(tmpdir(), "ugo-home-"));
  dirs.push(dir);
  const secrets = new HomeSecrets(dir);
  const service = new SetupService({
    db,
    secrets,
    masterKey: await secrets.dataKey(),
    embeddingModel: MODEL,
    providers: ["deepinfra"],
    timezone: "Europe/Rome",
    maxArchiveBytes: options.maxArchiveBytes ?? 1024 ** 3,
  });
  const guard = new SetupGuard();
  const app = Fastify();
  registerSetupRoutes(app, service, guard);
  await app.listen({ port: 0, host: "127.0.0.1" });
  stops.push(() => app.close());
  return { db, dir, secrets, service, guard, app, base: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}` };
}

const auth = (r: Rig): Record<string, string> => ({ "x-setup-token": r.guard.token });
const json = (r: Rig): Record<string, string> => ({ ...auth(r), "content-type": "application/json" });
const upload = (r: Rig, body: Buffer): Promise<Response> =>
  fetch(`${r.base}/setup/archive`, { method: "POST", headers: { ...auth(r), "content-type": "application/octet-stream" }, body: new Uint8Array(body) });
const post = (r: Rig, path: string, body: unknown): Promise<Response> =>
  fetch(`${r.base}${path}`, { method: "POST", headers: json(r), body: JSON.stringify(body) });

beforeAll(async () => {
  const source = await freshDatabase();
  const house = await createAccountWithFounder(source, MASTER_A, { slug: "casa-origine", name: "Origine", gosinoName: "Ugo" });
  const chunks: Buffer[] = [];
  await exportSoulArchive(
    source,
    { masterKey: MASTER_A, generatorVersion: "test", embeddingModel: MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS, kdf: KDF, chunkLog2: 12 },
    { accountId: house.accountId, gosinoIds: [house.gosinoId], mode: "trasloco", secret: SECRET },
    (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
  );
  archive = Buffer.concat(chunks);
}, 300_000);

afterAll(async () => {
  await Promise.all(stops.map((stop) => stop()));
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("la porta del setup", () => {
  it("la pagina si serve con una CSP chiusa e senza cache; le chiamate chiedono il gettone", async () => {
    const r = await rig();
    const page = await fetch(`${r.base}/setup`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).not.toMatch(/<script>[^<]/u); // nessuno script in linea

    expect((await fetch(`${r.base}/setup/state`)).status).toBe(401);
    expect((await fetch(`${r.base}/setup/state`, { headers: { "x-setup-token": "indovinato" } })).status).toBe(401);
    expect((await fetch(`${r.base}/setup/state`, { headers: auth(r) })).status).toBe(200);
  });

  it("rifiuta un host che non è locale (DNS rebinding) e un'origine altrui", async () => {
    const r = await rig();
    // fetch non lascia scegliere Host né Origin: qui si parla HTTP grezzo
    const status = (headers: Record<string, string>): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = request(`${r.base}/setup/state`, { headers: { ...auth(r), ...headers } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end();
      });
    expect(await status({ host: "evil.example" })).toBe(421);
    expect(await status({ origin: "http://evil.example" })).toBe(403);
    expect(await status({ origin: "null" })).toBe(403);
    expect(await status({})).toBe(200);
  });

  it("dopo troppi tentativi falliti non risponde più, nemmeno col gettone giusto", async () => {
    const r = await rig();
    expect((await upload(r, archive)).status).toBe(200);
    for (let i = 0; i < 10; i += 1) {
      expect((await post(r, "/setup/inspect", { recoveryCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ" })).status).toBe(422);
    }
    expect((await post(r, "/setup/inspect", { recoveryCode: SECRET })).status).toBe(429);
  });
});

describe("l'installazione, dal file alla casa", () => {
  it("carica, ispeziona, installa: la casa entra, la chiave va su disco, l'archivio sparisce", async () => {
    const r = await rig();
    expect(((await (await fetch(`${r.base}/setup/state`, { headers: auth(r) })).json()) as { state: string }).state).toBe("fresh");

    expect((await upload(r, archive)).status).toBe(200);
    const bad = await post(r, "/setup/inspect", { recoveryCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ" });
    expect(bad.status).toBe(422);

    const inspected = (await (await post(r, "/setup/inspect", { recoveryCode: SECRET.toLowerCase() })).json()) as {
      compatibility: { ok: boolean };
      manifest: { mode: string; gosinoIds: string[] };
      embeddings: { rows: number };
    };
    expect(inspected.compatibility.ok).toBe(true);
    expect(inspected.manifest.mode).toBe("trasloco");
    expect(inspected.embeddings.rows).toBe(0);
    // ispezionare non scrive nulla: il database è ancora il seme
    expect((await r.db.select({ id: accounts.id }).from(accounts)).map((a) => a.id)).toEqual([PRIME_ACCOUNT_ID]);

    const response = await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: `  ${USER_KEY}\n`, dailyBudgetUsd: 0.75 });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    expect(text, "la chiave non torna indietro nelle risposte").not.toContain(USER_KEY);
    const done = JSON.parse(text) as { ownerToken: string; gosinoIds: string[]; accountId: string };
    expect(done.gosinoIds).toEqual(inspected.manifest.gosinoIds);
    expect(done.ownerToken.length).toBeGreaterThan(20);

    expect(await r.secrets.openRouterKey()).toBe(USER_KEY); // pulita ai bordi
    expect(existsSync(join(r.dir, "incoming"))).toBe(false);
    expect(await r.service.state()).toBe("ready");
    const [house] = await r.db.select({ budget: accounts.dailyBudgetUsd }).from(accounts);
    expect(Number(house?.budget)).toBeCloseTo(0.75);
    expect(await r.db.select().from(accessTokens)).not.toHaveLength(0);

    // una casa installata non si reinstalla: né il file, né l'installazione
    expect((await upload(r, archive)).status).toBe(409);
    expect((await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: USER_KEY, dailyBudgetUsd: 0.5 })).status).toBe(409);
  }, 120_000);

  it("la chiave non finisce in nessun posto che non sia il suo file", async () => {
    const r = await rig();
    await upload(r, archive);
    await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: USER_KEY, dailyBudgetUsd: 0.5 });
    const leaks: string[] = [];
    for (const name of ["data.key", "internal.token"]) {
      const path = join(r.dir, name);
      if (existsSync(path) && (await readFile(path, "utf8")).includes(USER_KEY)) leaks.push(name);
    }
    expect(leaks).toEqual([]);
    const audit = (await r.db.execute(
      sql`select count(*)::int as n from audit_log where audit_log::text like ${`%${USER_KEY}%`}`,
    )) as unknown as { n: number }[];
    expect(audit[0]?.n).toBe(0);
    if (process.platform !== "win32") {
      expect((await stat(join(r.dir, "openrouter.key"))).mode & 0o777).toBe(0o600);
      expect((await stat(join(r.dir, "data.key"))).mode & 0o777).toBe(0o600);
    }
  }, 120_000);

  it("una chiave con un carattere invisibile si rifiuta, e non si scrive niente", async () => {
    const r = await rig();
    await upload(r, archive);
    const response = await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: "sk-or-v1-​prova", dailyBudgetUsd: 0.5 });
    expect(response.status).toBe(422);
    expect(await r.secrets.openRouterKey()).toBeUndefined();
    expect(await r.service.state()).toBe("fresh");
  });

  it("un archivio manomesso non lascia né la casa né la chiave", async () => {
    const r = await rig();
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 40] = (tampered[tampered.length - 40] ?? 0) ^ 0xff;
    await upload(r, tampered);
    const response = await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: USER_KEY, dailyBudgetUsd: 0.5 });
    expect(response.status).toBe(422);
    expect(await r.secrets.openRouterKey()).toBeUndefined();
    expect((await r.db.select({ id: accounts.id }).from(accounts)).map((a) => a.id)).toEqual([PRIME_ACCOUNT_ID]);
    expect(await r.service.state()).toBe("fresh");
  }, 120_000);

  it("un file più grande del tetto si ferma e non resta su disco", async () => {
    const r = await rig({ maxArchiveBytes: 1024 });
    const response = await upload(r, archive);
    expect(response.status).toBe(413);
    expect(existsSync(join(r.dir, "incoming", "archive.ugosoul"))).toBe(false);
  });

  it("senza aver caricato il file non si ispeziona né si installa", async () => {
    const r = await rig();
    expect((await post(r, "/setup/inspect", { recoveryCode: SECRET })).status).toBe(409);
    expect((await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: USER_KEY, dailyBudgetUsd: 0.5 })).status).toBe(409);
  });

  it("casa entrata ma senza chiave (spegnimento a metà): resta solo l'ultimo passo", async () => {
    const r = await rig();
    await upload(r, archive);
    await post(r, "/setup/install", { recoveryCode: SECRET, openRouterKey: USER_KEY, dailyBudgetUsd: 0.5 });
    await rm(join(r.dir, "openrouter.key"));
    expect(await r.service.state()).toBe("needs-key");
    // non si può reinstallare sopra, ma la chiave si può dare
    expect((await upload(r, archive)).status).toBe(409);
    expect((await post(r, "/setup/key", { openRouterKey: "" })).status).toBe(400);
    expect((await post(r, "/setup/key", { openRouterKey: USER_KEY })).status).toBe(200);
    expect(await r.service.state()).toBe("ready");
    expect((await post(r, "/setup/key", { openRouterKey: USER_KEY })).status).toBe(409);
  }, 120_000);
});

describe("i segreti della casa locale", () => {
  it("la chiave maestra nasce una volta e poi è sempre quella", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ugo-home-"));
    dirs.push(dir);
    const first = await new HomeSecrets(dir).dataKey();
    expect(first).toHaveLength(32);
    expect((await new HomeSecrets(dir).dataKey()).equals(first)).toBe(true);
    expect(await new HomeSecrets(dir).internalToken()).toBe(await new HomeSecrets(dir).internalToken());
  });

  it("un file di chiave scritto a metà (temporaneo) non si scambia per la chiave", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ugo-home-"));
    dirs.push(dir);
    await writeFile(join(dir, "openrouter.key.deadbeef.tmp"), "sk-or-a-meta");
    expect(await new HomeSecrets(dir).openRouterKey()).toBeUndefined();
  });
});
