import { resolve } from "node:path";
import { createDbClient, gosini, households, runMigrations } from "@ugo/db";
import { asc, eq } from "drizzle-orm";
import { LlmClient, OllamaEmbeddingsClient,
  OllamaTextClient,
} from "@ugo/memory";
import { EnvValidationError, loadSpeciesMap, parseDataKey, parseEnv } from "@ugo/shared";
import { RecognitionClient } from "./services/recognitionClient.js";
import { assertProductionSecrets, audioStorageFromEnv, soulEnvSchema } from "./config/env.js";
import { ChatService } from "./services/chatService.js";
import { FaceGateway } from "./services/faceGateway.js";
import { MeetingsService } from "./services/meetingsService.js";
import { PackService } from "./services/packService.js";
import { ExportService } from "./services/privacy/exportService.js";
import { ForgetService } from "./services/privacy/forgetService.js";
import { PsycheService } from "./services/psycheService.js";
import { IdleConsolidation } from "./services/idleConsolidation.js";
import { SolitudeMonitor } from "./services/solitudeMonitor.js";
import { CouncilService } from "./services/council/councilService.js";
import { GosinoRegistry } from "./services/pack/runtimes.js";
import { InitiativeSwitch } from "./services/volition/initiativeSwitch.js";
import { buildServer } from "./server.js";

const SNAPSHOT_INTERVAL_MS = 15 * 60_000; // §5.3: periodic snapshot

let env;
try {
  env = parseEnv(soulEnvSchema);
  assertProductionSecrets(env);
} catch (error) {
  // Fail fast with variable NAMES only — never values (they may be secrets).
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
}

/**
 * Migrations run at boot, not from a deployment step somebody has to remember
 * to configure. They are additive by contract (CLAUDE.md rule 5) and guarded
 * by a Postgres advisory lock, so two containers starting together is safe.
 *
 * The failure this prevents is not hypothetical: without them soul crash-loops
 * on `relation "psyche_baselines" does not exist`, which reads like a bug in
 * the code rather than a missing step in the platform.
 */
if (env.UGO_AUTO_MIGRATE) {
  try {
    await runMigrations(env.DATABASE_URL);
    console.log(JSON.stringify({ level: "info", msg: "migrations applied" }));
  } catch (error) {
    // never print the URL: it carries the password
    console.error(
      JSON.stringify({
        level: "fatal",
        msg: "migrations failed",
        detail: error instanceof Error ? error.message : "unknown",
      }),
    );
    process.exit(1);
  }
}

const db = createDbClient(env.DATABASE_URL);
const psyche = await PsycheService.restore(db);
const llmFor = (householdId: string, gosinoId: string): LlmClient =>
  new LlmClient({
    db,
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.UGO_CHAT_MODEL,
    dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD,
    householdId,
    gosinoId,
    ...(env.ANTHROPIC_BASE_URL !== undefined && { baseUrl: env.ANTHROPIC_BASE_URL }),
    timezone: env.TZ,
  });
const speciesMap = loadSpeciesMap(env.UGO_SPECIES_MAP);

/**
 * The house the boot-time fallback apparatus belongs to.
 *
 * Every route resolves its own house from the request (ADR-019 phase 2); this
 * is only for the single `chat`/`psyche`/`face` built before the registry
 * exists, which answers when nothing else has been resolved. Ordered by
 * `created_at` on purpose: the two `limit 1` queries this replaces had no
 * `order by`, so with two families which one you got depended on the plan.
 */
const [bootstrapHouse] = await db
  .select({ id: households.id })
  .from(households)
  .orderBy(asc(households.createdAt))
  .limit(1);
if (bootstrapHouse === undefined) throw new Error("no household: run the migrations");
const bootstrapHouseholdId = bootstrapHouse.id;
const [bootstrapExemplar] = await db
  .select({ id: gosini.id })
  .from(gosini)
  .where(eq(gosini.householdId, bootstrapHouseholdId))
  .orderBy(asc(gosini.bornAt))
  .limit(1);
if (bootstrapExemplar === undefined) throw new Error("no exemplar: run the migrations");

const pack = new PackService(db, speciesMap, bootstrapExemplar.id, bootstrapHouseholdId);
const llm = llmFor(bootstrapHouseholdId, bootstrapExemplar.id);
const chat = new ChatService({
  db,
  embedder: new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL),
  llm,
  psyche,
  dataKey: parseDataKey(env.UGO_DATA_KEY),
  pack,
});

const face = new FaceGateway({
  db,
  chat,
  psyche,
  // hour in project TZ so the sleep rule follows Europe/Rome, not the host
  hourOf: (at) =>
    Number(
      new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: env.TZ }).format(
        at,
      ),
    ),
});

const audio = audioStorageFromEnv(env);
const dataKey = parseDataKey(env.UGO_DATA_KEY);
const embedder = new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL);
const privacy = {
  forget: new ForgetService({ db, dataKey, embedder }),
  exporter: new ExportService(db, dataKey),
};
const meetings =
  env.VEXA_API_URL !== undefined && env.VEXA_API_KEY !== undefined
    ? new MeetingsService({
        db,
        gosinoId: bootstrapExemplar.id,
        householdId: bootstrapHouseholdId,
        embedder,
        llm,
        dataKey,
        vexa: { baseUrl: env.VEXA_API_URL, apiKey: env.VEXA_API_KEY, ownerName: env.UGO_OWNER_NAME },
        psyche,
        // ADR-013 opzione b: finché Vexa open-core non espone /speak, la
        // risposta viene pronunciata in stanza dal corpo di casa
        speakPort: {
          speak: (_ref, text) => {
            face.broadcastSpeak(text);
            return Promise.resolve();
          },
        },
      })
    : undefined;

// ADR-027: initiative. Until now every single thing UGO said was a reply.
const localText = new OllamaTextClient(
  env.OLLAMA_URL,
  env.OLLAMA_TEXT_MODEL ?? env.OLLAMA_BATCH_MODEL,
);
let localTextUp = false;
const probeLocal = (): void => {
  localText
    .available()
    .then((up) => {
      localTextUp = up;
    })
    .catch(() => {
      localTextUp = false;
    });
};
probeLocal();
const localProbeTimer = setInterval(probeLocal, 10 * 60_000);
localProbeTimer.unref();

const hourOf = (at: Date): number =>
  Number(at.toLocaleString("it-IT", { hour: "2-digit", hour12: false, timeZone: env.TZ }));

// ADR-032: one runtime per exemplar. Everything that makes him himself — mood,
// memories, thread, initiative — is his; the house is shared.
// ADR-034: the durable setting is UGO_INITIATIVE; this only holds the
// runtime override /admin can flip, and it is lost on restart on purpose.
const initiative = new InitiativeSwitch(() => env.UGO_INITIATIVE === "on");

// ADR-045: il servizio di percezione, se c'è. Senza, tutto continua come
// prima — UGO risponde senza sapere chi ha davanti, che è il comportamento di
// ogni versione fino a ieri.
const recognitionUrl = env.UGO_RECOGNITION_URL;
const recognitionToken = env.UGO_INTERNAL_TOKEN;
// one client per house: the biometric centroids are the house's, and a single
// client would compare one family's voice against another's profiles
const recognition =
  recognitionUrl === undefined || recognitionToken === undefined
    ? undefined
    : (householdId: string): RecognitionClient =>
        new RecognitionClient({
          baseUrl: recognitionUrl,
          token: recognitionToken,
          householdId,
        });

const registry = await GosinoRegistry.load({
  db,
  embedder,
  llm: llmFor,
  local: localText,
  dataKey,
  timezone: env.TZ,
  speciesMap,
  localModelUp: () => localTextUp,
  initiativeEnabled: () => initiative.on(),
  hourOf,
  ...(recognition !== undefined && { recognition }),
});

const app = buildServer({
  db,
  ...(env.UGO_FACE_DIR !== undefined && { faceRoot: resolve(env.UGO_FACE_DIR) }),
  mqtt: { url: env.MQTT_URL, username: env.MQTT_USER, password: env.MQTT_PASS },
  ollamaUrl: env.OLLAMA_URL,
  features: {
    chat,
    // ADR-031: more than one exemplar, and a way to ask them all at once.
    // Local model only: a room full of pigs arguing must never touch the
    // API budget.
    council: { council: new CouncilService({ db, local: localText }) },
    // ADR-036: the population is its own surface — a house can hold several
    // creatures and never convene a council
    gosini: {},
    psyche,
    face,
    privacy,
    speciesMap,
    stats: { dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD, timezone: env.TZ },
    registry,
    initiative,
    ...(env.UGO_INTERNAL_TOKEN !== undefined && { internalToken: env.UGO_INTERNAL_TOKEN }),
    ...(env.UGO_JOBS_TRIGGER_URL !== undefined && { dreamTriggerUrl: env.UGO_JOBS_TRIGGER_URL }),
    ...(audio !== undefined && { audio }),
    ...(meetings !== undefined && { meetings }),
  },
});

const MEETINGS_POLL_MS = 3000;
if (meetings !== undefined) {
  const pollTimer = setInterval(() => {
    meetings.pollAll().catch((error: unknown) => {
      app.log.warn(error, "meetings polling round failed");
    });
  }, MEETINGS_POLL_MS);
  pollTimer.unref();
}

const volitionTimer = setInterval(() => {
  // every exemplar decides for himself, and they are staggered so two of them
  // never speak on top of each other
  registry.everywhere().forEach((runtime, index) => {
    setTimeout(
      () => {
        runtime.volition
          .tick()
          .then((report) => {
            // IDs only, never the words he said (rule 6)
            if (report.acted !== undefined) {
              app.log.info({ act: report.acted, gosino: runtime.id }, "initiative");
            }
          })
          .catch((error: unknown) => {
            app.log.warn(error, "initiative tick failed");
          });
      },
      index * 7_000,
    ).unref();
  });
}, env.UGO_INITIATIVE_TICK_MINUTES * 60_000);
volitionTimer.unref();

// §5.3: loneliness and neglect are perturbations no sensor can emit
const solitude = new SolitudeMonitor({ db, gosinoId: bootstrapExemplar.id, psyche });
const SOLITUDE_TICK_MS = 15 * 60_000;
const solitudeTimer = setInterval(() => {
  solitude.tick().catch((error: unknown) => {
    app.log.warn(error, "solitude tick failed");
  });
}, SOLITUDE_TICK_MS);
solitudeTimer.unref();

// backlog gruppo 1: the dream exists, what was missing was the trigger for
// when UGO has been left alone for a while (ADR-025)
if (env.UGO_IDLE_CONSOLIDATION_MINUTES > 0) {
  const triggerUrl = env.UGO_JOBS_TRIGGER_URL;
  const idle = new IdleConsolidation({
    db,
    gosinoId: bootstrapExemplar.id,
    options: {
      idleMinutes: env.UGO_IDLE_CONSOLIDATION_MINUTES,
      nightGuardMinutes: 60,
      dreamAt: env.UGO_DREAM_AT,
      timezone: env.TZ,
    },
    logger: app.log,
    ...(triggerUrl !== undefined && {
      trigger: async (mode: "light"): Promise<void> => {
        const response = await fetch(triggerUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`status ${String(response.status)}`);
      },
    }),
  });
  const idleTimer = setInterval(() => {
    idle.tick().catch((error: unknown) => {
      app.log.warn(error, "idle consolidation tick failed");
    });
  }, SOLITUDE_TICK_MS);
  idleTimer.unref();
}

const snapshotTimer = setInterval(() => {
  psyche.snapshot().catch((error: unknown) => {
    app.log.error(error, "periodic psyche snapshot failed");
  });
}, SNAPSHOT_INTERVAL_MS);
snapshotTimer.unref();

const shutdown = (signal: NodeJS.Signals): void => {
  app.log.info({ signal }, "shutting down");
  clearInterval(snapshotTimer);
  clearInterval(solitudeTimer);
  clearInterval(volitionTimer);
  clearInterval(localProbeTimer);
  void Promise.allSettled([app.close(), db.$client.end()]).then(() => {
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  await db.$client.end();
  process.exit(1);
}
