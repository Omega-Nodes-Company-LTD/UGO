import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDbClient, runMigrations } from "@ugo/db";
import { DEFAULT_EMBED_MODEL, DEFAULT_PROVIDERS } from "@ugo/memory";
import Fastify from "fastify";
import { SetupGuard } from "./guard.js";
import { HomeSecrets } from "./secrets.js";
import { registerSetupRoutes } from "./setupRoutes.js";
import { SetupService } from "./setupService.js";

/**
 * L'ingresso della casa locale (`UGO_MODE=home`, ADR-132 §2, MKT-10.6).
 *
 *   avvio → chiave maestra (nasce qui) → migrazioni → stato
 *     ├─ `ready`   → il runtime di sempre (`index.ts`), con i segreti letti dai file
 *     └─ altrimenti → solo `/setup`; a installazione finita il setup si spegne e
 *                     parte il runtime, senza riavviare il contenitore
 *
 * Il runtime non cambia: legge le sue variabili d'ambiente come in ogni altro
 * posto. Questo file si limita a riempirle dai file dei segreti **prima** di
 * importarlo — e i file vincono sempre sulle variabili, perché la chiave
 * maestra con cui l'archivio è stato ricifrato è quella del file, e una
 * variabile diversa renderebbe illeggibile la casa appena entrata.
 */
const MAX_ARCHIVE_BYTES = 8 * 1024 ** 3;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`manca ${name} (la casa locale lo riceve dal kit di avvio)`);
    process.exit(1);
  }
  return value;
}

function homeDir(): string {
  const configured = process.env.UGO_HOME_DIR;
  if (configured !== undefined && configured !== "") return resolve(configured);
  return existsSync("/data") ? "/data" : resolve(".ugo-home");
}

async function startRuntime(secrets: HomeSecrets, masterKey: Buffer): Promise<void> {
  process.env.UGO_DATA_KEY = masterKey.toString("base64");
  process.env.UGO_INTERNAL_TOKEN = await secrets.internalToken();
  const key = await secrets.openRouterKey();
  if (key === undefined) throw new Error("home mode: runtime requested without an OpenRouter key");
  process.env.OPENROUTER_API_KEY = key;
  await import("../index.js");
}

const databaseUrl = required("DATABASE_URL");
const secrets = new HomeSecrets(homeDir());
const masterKey = await secrets.dataKey();
await runMigrations(databaseUrl);
const db = createDbClient(databaseUrl);
const service = new SetupService({
  db,
  secrets,
  masterKey,
  embeddingModel: process.env.OPENROUTER_EMBED_MODEL ?? DEFAULT_EMBED_MODEL,
  providers: process.env.OPENROUTER_PROVIDERS?.split(",").map((name) => name.trim()).filter(Boolean) ?? DEFAULT_PROVIDERS,
  timezone: process.env.TZ ?? "Europe/Rome",
  maxArchiveBytes: MAX_ARCHIVE_BYTES,
});

if ((await service.state()) === "ready") {
  await db.$client.end();
  await startRuntime(secrets, masterKey);
} else {
  const guard = new SetupGuard();
  const app = Fastify({ logger: { level: "info", redact: ["req.headers.x-setup-token"] }, bodyLimit: 1024 * 1024 });
  registerSetupRoutes(app, service, guard);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
  // il gettone va SOLO sulla console di chi ha avviato: è la chiave della porta
  console.log(`\nUGO è pronto per l'installazione. Apri:\n  http://localhost:${String(port)}/setup#t=${guard.token}\n`);

  // installata la casa (e scritta la chiave), il setup lascia il posto al runtime
  const poll = setInterval(() => {
    void service.state().then(async (state) => {
      if (state !== "ready") return;
      clearInterval(poll);
      await app.close();
      await db.$client.end();
      await startRuntime(secrets, masterKey);
    });
  }, 1500);
}
