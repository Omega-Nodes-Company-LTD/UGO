import { resolve } from "node:path";
import { createDbClient, createScopedDbClient, gosini, accounts, runMigrations, traitSets, type DbClient } from "@ugo/db";
import { asc, desc, eq } from "drizzle-orm";
import { DEFAULT_LOCALE } from "@ugo/prompts";
import { LlmClient, ChatChain, type ChatLlm, OllamaEmbeddingsClient,
  OllamaTextClient,
  OllamaVisionClient,
  OpenAiTtsClient,
} from "@ugo/memory";
import { EnvValidationError, loadSpeciesMap, parseDataKey, parseEnv } from "@ugo/shared";
import { RecognitionClient } from "./services/recognitionClient.js";
import { NudgeService } from "./services/nudges.js";
import { SceneReader } from "./services/sceneReader.js";
import { assertProductionSecrets, audioStorageFromEnv, soulEnvSchema } from "./config/env.js";
import { ChatService } from "./services/chatService.js";
import { characterFrom } from "./services/council/character.js";
import type { HouseClock } from "./services/pack/runtimes.js";
import { FaceGateway } from "./services/faceGateway.js";
import { MeetingsService } from "./services/meetingsService.js";
import { PackService } from "./services/packService.js";
import { ExportService } from "./services/privacy/exportService.js";
import { ForgetService } from "./services/privacy/forgetService.js";
import { PsycheService } from "./services/psycheService.js";
import { IdleConsolidation } from "./services/idleConsolidation.js";
import { MortalityWatch } from "./services/mortalityWatch.js";
import { RegistryClient } from "./services/registryClient.js";
import { SolitudeMonitor } from "./services/solitudeMonitor.js";
import { CheckinWatch } from "./services/checkinService.js";
import { TimerWatch } from "./services/volition/timerWatch.js";
import { CouncilService } from "./services/council/councilService.js";
import { GosinoRegistry } from "./services/pack/runtimes.js";
import { RuminationService } from "./services/rumination.js";
import { SearxClient, WebWindow } from "./services/webSearch.js";
import { SceneGlance } from "./services/sceneGlance.js";
import { SleepTalk } from "./services/sleepTalk.js";
import { storeVoiceSample } from "./services/voiceEnrolment.js";
import { InitiativeSwitch } from "./services/volition/initiativeSwitch.js";
import { CustomerQuota } from "./services/reception/customerQuota.js";
import { GithubLiveService } from "./services/reception/githubLiveService.js";
import { buildServer } from "./server.js";
import { createAccount } from "./services/accountService.js";
import type { Capability } from "./routes/capabilities.js";

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

/**
 * ADR-062 tempo 2b: il servizio parla col database come `ugo_app` quando
 * `DATABASE_URL_APP` è impostata — è il flip che accende RLS in produzione.
 * Le migrazioni sopra restano sull'owner: i privilegi non si applicano al
 * proprietario delle tabelle, ed è per questo che sono due utenze.
 */
const appUrl = env.DATABASE_URL_APP ?? env.DATABASE_URL;
const db = createDbClient(appUrl);

/**
 * ADR-098: la connessione della casa. Un client per account, creato una volta
 * e riusato: `app.account_id` è nel pacchetto di startup, quindi ogni query
 * dei runtime è già dentro il muro — riconnessioni comprese.
 */
const houseClients = new Map<string, DbClient>();
const dbFor = (accountId: string): DbClient => {
  const cached = houseClients.get(accountId);
  if (cached !== undefined) return cached;
  const scoped = createScopedDbClient(appUrl, accountId);
  houseClients.set(accountId, scoped);
  return scoped;
};

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
  .select({ id: accounts.id })
  .from(accounts)
  .orderBy(asc(accounts.createdAt))
  .limit(1);
if (bootstrapHouse === undefined) throw new Error("no account: run the migrations");
const bootstrapAccountId = bootstrapHouse.id;
const [bootstrapExemplar] = await dbFor(bootstrapAccountId)
  .select({ id: gosini.id })
  .from(gosini)
  .where(eq(gosini.accountId, bootstrapAccountId))
  .orderBy(asc(gosini.bornAt))
  .limit(1);
if (bootstrapExemplar === undefined) throw new Error("no exemplar: run the migrations");
const psyche = await PsycheService.restore(dbFor(bootstrapAccountId), new Date(), bootstrapExemplar.id);
// ADR-050: l'orologio e la lingua arrivano dalla CASA. `env.TZ` resta il
// ripiego per l'apparato di avvio, che nasce prima che una casa sia risolta.
/**
 * ADR-094/095: la catena — casa (Ollama), poi OpenRouter se c'è la chiave,
 * poi Anthropic. Ogni anello che risponde scrive la sua riga sul ledger col
 * suo listino, e il metabolismo gira su tutti: anche la voce di casa mangia,
 * a listino nominale. I muri (tetto, salvadanaio) stanno all'ingresso della
 * catena. Il modello locale: `OLLAMA_CHAT_MODEL`, o quello del testo
 * dell'iniziativa, o quello del sogno — la casa ne ha sempre almeno uno.
 */
const localChatModel = env.OLLAMA_CHAT_MODEL ?? env.OLLAMA_TEXT_MODEL ?? env.OLLAMA_BATCH_MODEL;
const llmFor = (
  accountId: string,
  gosinoId: string,
  clock: HouseClock = { timezone: env.TZ, locale: DEFAULT_LOCALE },
): ChatLlm => {
  const remote = new LlmClient({
    // ADR-098: il muro del budget legge il ledger DELLA casa — sulla
    // connessione nuda, sotto ugo_app, vedrebbe zero e non morderebbe mai
    db: dbFor(accountId),
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.UGO_CHAT_MODEL,
    dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD,
    accountId,
    gosinoId,
    ...(env.ANTHROPIC_BASE_URL !== undefined && { baseUrl: env.ANTHROPIC_BASE_URL }),
    timezone: clock.timezone,
    locale: clock.locale,
  });
  if (env.UGO_CHAT_LOCAL_FIRST !== "on") return remote;
  return new ChatChain({
    db: dbFor(accountId),
    accountId,
    gosinoId,
    timezone: clock.timezone,
    locale: clock.locale,
    local: { baseUrl: env.OLLAMA_URL, model: localChatModel },
    ...(env.OPENROUTER_API_KEY !== undefined &&
      env.OPENROUTER_CHAT_MODEL !== undefined && {
        openRouter: {
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_CHAT_MODEL,
          ...(env.OPENROUTER_BASE_URL !== undefined && { baseUrl: env.OPENROUTER_BASE_URL }),
        },
      }),
    remote,
    // pigro, e non e' un vezzo: llmFor gira al bootstrap, PRIMA che `app`
    // esista — toccare app.log qui era una TDZ che uccideva il boot vero
    // (l'ha detto l'e2e, non i test d'integrazione, che montano buildServer)
    logger: {
      info: (o, m) => {
        app.log.info(o, m);
      },
      warn: (o, m) => {
        app.log.warn(o, m);
      },
    },
  });
};
const speciesMap = loadSpeciesMap(env.UGO_SPECIES_MAP);

// ADR-063: la finestra sul mondo — solo se SearXNG è configurato. Un'istanza
// per processo: le query non portano la casa, portano solo la domanda
const web =
  env.SEARXNG_URL === undefined
    ? undefined
    : new WebWindow({
        searx: new SearxClient({ baseUrl: env.SEARXNG_URL }),
        local: new OllamaTextClient(env.OLLAMA_URL, env.OLLAMA_TEXT_MODEL ?? env.OLLAMA_BATCH_MODEL),
        localUp: () => localTextUp,
      });


const pack = new PackService(dbFor(bootstrapAccountId), speciesMap, bootstrapExemplar.id, bootstrapAccountId);
// ADR-031: anche l'apparato di ripiego ha un carattere. Senza genoma in
// `trait_sets` `characterFrom({})` risponde «un UGO senza spigoli», che e' la
// verita' su una casa che non ha ancora scelto niente — non un valore neutro
// messo li' per far compilare.
const [bootstrapTraits] = await dbFor(bootstrapAccountId)
  .select({ traits: traitSets.traits })
  .from(traitSets)
  .where(eq(traitSets.gosinoId, bootstrapExemplar.id))
  .orderBy(desc(traitSets.version))
  .limit(1);
const bootstrapCharacter = characterFrom(bootstrapTraits?.traits);
const llm = llmFor(bootstrapAccountId, bootstrapExemplar.id);
// ADR-065: la lettura su gesto anche per l'apparato di avvio — la rotta
// /v1/chat parla con QUESTA istanza, e «leggi» dalla PWA deve funzionare
// come dal chiosco. `() => face` perché il gateway nasce più sotto.
const bootstrapPercezione =
  env.UGO_RECOGNITION_URL === undefined || env.UGO_INTERNAL_TOKEN === undefined
    ? undefined
    : new RecognitionClient({
        baseUrl: env.UGO_RECOGNITION_URL,
        token: env.UGO_INTERNAL_TOKEN,
        accountId: bootstrapAccountId,
      });
// gruppo 12: gli occhi che raccontano — il modello vision locale, se c'è
const localVision =
  env.OLLAMA_VISION_MODEL === undefined
    ? undefined
    : new OllamaVisionClient(env.OLLAMA_URL, env.OLLAMA_VISION_MODEL);
// ADR-064: le spinte — il servizio nasce PRIMA di ogni chat (l'apparato di
// avvio e i runtime lo vogliono fra le dipendenze) e legge il registro al
// momento del gesto, quando esiste da un pezzo
let registryRef: GosinoRegistry | undefined = undefined;
const nudges = new NudgeService({ dbFor, registry: () => registryRef });

// l'annotazione esplicita spezza il cerchio dell'inferenza: chat → lettore →
// gateway → chat (il lettore guarda il corpo solo al momento del gesto)
const chat: ChatService = new ChatService({
  db: dbFor(bootstrapAccountId),
  embedder: new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL),
  llm,
  psyche,
  dataKey: parseDataKey(env.UGO_DATA_KEY),
  pack,
  gosinoId: bootstrapExemplar.id,
  accountId: bootstrapAccountId,
  character: bootstrapCharacter,
  ...(web !== undefined && { web }),
  ...(bootstrapPercezione !== undefined && {
    reader: new SceneReader({
      gateway: (): FaceGateway => face,
      ocr: (image) => bootstrapPercezione.ocr(image),
    }),
  }),
  nudges: { answer: (text, at) => nudges.answer(bootstrapExemplar.id, text, at) },
  ...(localVision !== undefined && {
    vision: { describe: (image: string) => localVision.describe(image) },
  }),
});

const audio = audioStorageFromEnv(env);
const face: FaceGateway = new FaceGateway({
  db: dbFor(bootstrapAccountId),
  chat,
  psyche,
  gosinoId: bootstrapExemplar.id,
  // hour in project TZ so the sleep rule follows Europe/Rome, not the host
  hourOf: (at) =>
    Number(
      new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: env.TZ }).format(
        at,
      ),
    ),
  // ADR-057: anche il corpo di ripiego può ricevere un `voice_sample` — la
  // finestra la controlla il gateway, il deposito è lo stesso del pannello
  ...(audio !== undefined && {
    voiceSample: (input: { beingId: string; audio: Buffer }) =>
      storeVoiceSample({ db: dbFor(bootstrapAccountId), storage: audio }, { accountId: bootstrapAccountId, ...input }),
  }),
});
const dataKey = parseDataKey(env.UGO_DATA_KEY);
const embedder = new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL);
// ADR-062: fabbriche — l'oblio e l'export girano sulla transazione che ha
// dichiarato la casa, non sulla connessione nuda del processo
const privacy = {
  forget: (tx: DbClient) => new ForgetService({ db: tx, dataKey, embedder }),
  exporter: (tx: DbClient) => new ExportService(tx, dataKey),
};
const meetings =
  env.VEXA_API_URL !== undefined && env.VEXA_API_KEY !== undefined
    ? new MeetingsService({
        db,
        dbFor,
        gosinoId: bootstrapExemplar.id,
        accountId: bootstrapAccountId,
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
let localVisionUp = false;
const probeLocal = (): void => {
  localText
    .available()
    .then((up) => {
      localTextUp = up;
    })
    .catch(() => {
      localTextUp = false;
    });
  localVision
    ?.available()
    .then((up) => {
      localVisionUp = up;
    })
    .catch(() => {
      localVisionUp = false;
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
    : (accountId: string): RecognitionClient =>
        new RecognitionClient({
          baseUrl: recognitionUrl,
          token: recognitionToken,
          accountId,
        });

const registry = await GosinoRegistry.load({
  db,
  dbFor,
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
  // ADR-057: senza bucket niente `voice_sample`, dal chiosco come dal pannello
  ...(audio !== undefined && { audio }),
  ...(web !== undefined && { web }),
  nudges: { answer: (gosinoId, text, at) => nudges.answer(gosinoId, text, at) },
  // gruppo 4 — input immagini: gli stessi occhi locali delle occhiate
  ...(localVision !== undefined && {
    vision: { describe: (image: string) => localVision.describe(image) },
  }),
});
registryRef = registry;

/**
 * Cosa è acceso e cosa no, con il perché scritto accanto.
 *
 * Tre volte di fila una funzione spenta si è presentata come una funzione
 * rotta — «la camera non mi funziona» senza `OLLAMA_VISION_MODEL`, un cielo
 * sereno durante un temporale senza le coordinate della casa, un «cerca:»
 * inesistente senza `SEARXNG_URL` — e ogni volta la diagnosi è costata una
 * lettura del codice. Spenta è uno stato legittimo; spenta che finge di
 * essere rotta no.
 */
const capabilities = (): Capability[] => [
  {
    id: "vision",
    label: "Guardare le foto che gli mandi",
    on: localVision !== undefined,
    ...(localVision === undefined && {
      why: "manca OLLAMA_VISION_MODEL (e il modello va scaricato in Ollama). Senza, alle foto risponde che non riesce a vederle.",
    }),
  },
  {
    id: "recognition",
    label: "Riconoscere voce e volto",
    on: env.UGO_RECOGNITION_URL !== undefined && env.UGO_INTERNAL_TOKEN !== undefined,
    ...(!(env.UGO_RECOGNITION_URL !== undefined && env.UGO_INTERNAL_TOKEN !== undefined) && {
      why: "manca UGO_RECOGNITION_URL o UGO_INTERNAL_TOKEN: il servizio di percezione non viene mai chiamato.",
    }),
  },
  {
    id: "web",
    label: "Cercare sul web («cerca: …»)",
    on: env.SEARXNG_URL !== undefined,
    ...(env.SEARXNG_URL === undefined && {
      why: "manca SEARXNG_URL: il gesto «cerca:» non esiste e la frase va al modello come una qualunque.",
    }),
  },
  {
    id: "ttsProvider",
    label: "Voce espressiva del provider",
    on: env.OPENAI_API_KEY !== undefined,
    ...(env.OPENAI_API_KEY === undefined && {
      why: "manca OPENAI_API_KEY: si scende alla voce di casa (Piper) o a quella di sistema.",
    }),
  },
  {
    id: "sttLocal",
    label: "Dettatura locale (whisper in casa)",
    // passa dallo stesso servizio di percezione: se non c'è quello, non c'è
    // nemmeno il ponte /v1/stt, che risponde 501 e rimanda al browser
    on: recognition !== undefined,
    ...(recognition === undefined && {
      why: "serve il servizio di percezione (UGO_RECOGNITION_URL): senza, le orecchie restano quelle del browser.",
    }),
  },
  {
    id: "meetings",
    label: "Riunioni (Vexa)",
    on: env.VEXA_API_URL !== undefined && env.VEXA_API_KEY !== undefined,
    ...(!(env.VEXA_API_URL !== undefined && env.VEXA_API_KEY !== undefined) && {
      why: "mancano VEXA_API_URL/VEXA_API_KEY: non può entrare in una call.",
    }),
  },
  {
    id: "audio",
    label: "Registrazioni e arruolamento voce",
    on: audio !== undefined,
    ...(audio === undefined && {
      why: "manca la configurazione S3_*: senza deposito non si registra e non si impara una voce.",
    }),
  },
];

const app = buildServer({
  db,
  capabilities,
  // ADR-061: la stessa nascita di `ugo casa nuova`, ma dal pannello — perché
  // «una persona può avere più case e più negozi» finché crearne una vuol dire
  // entrare nel container è una promessa scritta e non una funzione
  // ADR-097: `tx` è la transazione del mercato (withMarket), non il db nudo
  createHouse: (tx, input) =>
    createAccount(tx, parseDataKey(env.UGO_DATA_KEY), {
      slug: input.slug,
      name: input.name,
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.kind !== undefined && {
        kind: input.kind === "azienda" ? ("business" as const) : ("home" as const),
      }),
    }),
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
    // ADR-070: la chiave della casa serve a firmare gli atti di nascita
    gosini: {
      dataKey,
      // ADR-074: il sapere della dote entra ripescabile come tutto il resto
      embedder,
      // ADR-073: si accende con l'indirizzo del registro; senza, si nasce
      // esattamente come prima, solo senza atto in catena
      ...(env.UGO_REGISTRY_URL !== undefined &&
        env.UGO_REGISTRY_TOKEN !== undefined && {
          chain: { baseUrl: env.UGO_REGISTRY_URL, token: env.UGO_REGISTRY_TOKEN },
        }),
    },
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
    // ADR-052: the house side of the reception, in the panel
    customers: {
      dataKey,
      ...(audio !== undefined &&
        env.S3_BUCKET_DOCS !== undefined && {
          docsStorage: { ...audio, bucket: env.S3_BUCKET_DOCS },
        }),
      ...(env.UGO_JOBS_TRIGGER_URL !== undefined && {
        syncTriggerUrl: env.UGO_JOBS_TRIGGER_URL,
      }),
    },
    // ADR-051: the reception exists only when its dedicated secret does
    ...(env.UGO_RECEPTION_TOKEN !== undefined && {
      reception: {
        token: env.UGO_RECEPTION_TOKEN,
        dataKey,
        dbFor,
        quota: new CustomerQuota(
          db,
          {
            hourlyMessages: env.UGO_CUSTOMER_HOURLY_MESSAGES,
            dailyBudgetUsd: env.UGO_CUSTOMER_DAILY_BUDGET_USD,
            timezone: env.TZ,
          },
          dbFor,
        ),
        weeklyRewards: env.UGO_CUSTOMER_WEEKLY_REWARDS,
        llmFor,
        embedder,
        github: new GithubLiveService({
          db,
          dbFor,
          dataKey,
          ...(env.GITHUB_API_URL !== undefined && { baseUrl: env.GITHUB_API_URL }),
        }),
      },
    }),
    // ADR-057: rivendicare un'impronta ignota passa dallo stesso servizio che
    // tiene gli encoder, e con lo stesso client per casa
    ...(recognition !== undefined && { prints: recognition }),
    // gruppo 13: la dettatura locale passa dallo stesso servizio di percezione
    ...(recognition !== undefined && { stt: recognition }),
    // decisione 2026-08-16: la voce di casa (Piper) sta sullo stesso servizio
    ...(recognition !== undefined && { ttsLocal: recognition }),
    // backlog gruppo 3: la memoria interrogabile da altri agenti (MCP, sola
    // lettura, token di casa). Gli embedding sono quelli di Ollama: zero provider
    mcp: { embedder, dataKey },
    // gruppo 12: il meteo vero — solo se la casa ha detto dove sta
    ...(env.UGO_HOME_LAT !== undefined &&
      env.UGO_HOME_LON !== undefined && {
        weather: { home: { lat: env.UGO_HOME_LAT, lon: env.UGO_HOME_LON } },
      }),
    // gruppo 13: la voce interim — si accende con la chiave, si spegne col
    // budget (ogni frase è una riga di budget_ledger)
    ...(env.OPENAI_API_KEY !== undefined && {
      tts: new OpenAiTtsClient({
        db,
        dbFor,
        apiKey: env.OPENAI_API_KEY,
        dailyBudgetUsd: env.UGO_DAILY_BUDGET_USD,
        model: env.UGO_TTS_MODEL,
        voice: env.UGO_TTS_VOICE,
        timezone: env.TZ,
        ...(env.OPENAI_BASE_URL !== undefined && { baseUrl: env.OPENAI_BASE_URL }),
      }),
    }),
  },
});

/**
 * I battiti periodici che vivono dentro un `if`, e che lo spegnimento deve
 * poter fermare lo stesso.
 *
 * `pollTimer` e `idleTimer` nascevano in uno scope di blocco e restavano
 * invisibili a `shutdown`: a ogni SIGTERM il poller delle riunioni ripartiva
 * (ogni tre secondi) su un `db.$client` che `Promise.allSettled` stava
 * chiudendo, e il log si riempiva di `Connection terminated` mentre il
 * processo se ne andava. Raccolti qui, si fermano insieme agli altri.
 */
const periodic: NodeJS.Timeout[] = [];

const MEETINGS_POLL_MS = 3000;
if (meetings !== undefined) {
  const pollTimer = setInterval(() => {
    meetings.pollAll().catch((error: unknown) => {
      app.log.warn(error, "meetings polling round failed");
    });
  }, MEETINGS_POLL_MS);
  pollTimer.unref();
  periodic.push(pollTimer);
}

// ADR-059: la ruminazione — pensa coi modelli locali, mai col provider.
// Cavalca il battito delle iniziative invece di avere un ciclo suo: stesso
// sfalsamento, un solo posto da guardare quando ci si chiede «cosa gira».
// gruppo 12: parla nel sonno — di notte, un frammento del diario di ieri
// come nuvoletta senza voce. Stesso battito delle iniziative, zero token.
const sleepTalk = new SleepTalk({ dbFor, hourOf });

// gruppo 12, secondo taglio della visione: ogni tanto UGO dà un'occhiata —
// lo sguardo si chiede al chiosco, il modello locale lo racconta, la frase
// entra nella ruminazione. Solo se il modello vision è configurato.
const sceneGlance =
  localVision === undefined
    ? undefined
    : new SceneGlance({ dbFor, vision: localVision, visionUp: () => localVisionUp, hourOf });

const rumination = new RuminationService({
  dbFor,
  local: localText,
  localUp: () => localTextUp,
  hourOf,
  enabled: () => env.UGO_RUMINATION === "on",
  gapMin: env.UGO_RUMINATION_GAP_MIN,
});

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
        sceneGlance
          ?.maybe(runtime)
          .then((did) => {
            // id e verbo, mai la frase (regola 6): il pensiero sta in events
            if (did !== "nothing") app.log.info({ did, gosino: runtime.id }, "scene glance");
          })
          .catch((error: unknown) => {
            app.log.warn(error, "scene glance failed");
          });
        sleepTalk
          .maybe(runtime)
          .then((did) => {
            // id e basta, mai il frammento (regola 6)
            if (did !== "nothing") app.log.info({ gosino: runtime.id }, "sleep talk");
          })
          .catch((error: unknown) => {
            app.log.warn(error, "sleep talk failed");
          });
        rumination
          .maybe(
            runtime,
            registry.all(runtime.accountId).filter((mate) => mate.id !== runtime.id),
          )
          .then((report) => {
            // IDs only, never the words he thought (rule 6)
            if (report.did !== "nothing") {
              app.log.info({ did: report.did, gosino: runtime.id }, "rumination");
            }
          })
          .catch((error: unknown) => {
            app.log.warn(error, "rumination failed");
          });
      },
      index * 7_000,
    ).unref();
  });
}, env.UGO_INITIATIVE_TICK_MINUTES * 60_000);
volitionTimer.unref();

/**
 * ADR-078: il timer suona in orario, e quindi ha un orologio suo.
 *
 * Quindici secondi: l'iniziativa gira ogni quattro minuti perché sceglie il
 * momento buono, e per la pasta il momento buono è adesso. Non tiene stato —
 * la verità è la riga con l'ora sopra — quindi un riavvio non perde nessuna
 * sveglia.
 */
const TIMER_TICK_MS = 15_000;
const timerTimer = setInterval(() => {
  for (const runtime of registry.everywhere()) {
    new TimerWatch({ db: dbFor(runtime.accountId), gateway: runtime.gateway, gosinoId: runtime.id })
      .tick()
      .then((rang) => {
        // id e quanti, mai l'etichetta (regola 6): «per la pasta» è roba di casa
        if (rang > 0) app.log.info({ gosino: runtime.id, rang }, "timer");
      })
      .catch((error: unknown) => {
        app.log.warn(error, "timer tick failed");
      });
  }
}, TIMER_TICK_MS);
timerTimer.unref();
periodic.push(timerTimer);

/**
 * ADR-085: le domande che tornano.
 *
 * Un minuto, non quindici secondi: un check-in non è una sveglia, è una cosa
 * che vuole chiedere. Quando è l'ora scrive un desiderio, e a dirlo ci pensa
 * l'iniziativa — che sceglie il momento buono, rispetta le ore di quiete e,
 * a interruttore spento, tace. Farsi vivi è precisamente ciò che
 * quell'interruttore spegne, e per questo qui non c'è nessuna voce.
 */
const CHECKIN_TICK_MS = 60_000;
const checkinTimer = setInterval(() => {
  for (const runtime of registry.everywhere()) {
    new CheckinWatch({ db: dbFor(runtime.accountId), gosinoId: runtime.id, timezone: runtime.timezone })
      .tick()
      .then((report) => {
        // quante, mai il testo (regola 6): la domanda è roba di casa
        if (report.asked > 0) app.log.info({ gosino: runtime.id, asked: report.asked }, "checkin");
      })
      .catch((error: unknown) => {
        app.log.warn(error, "checkin tick failed");
      });
  }
}, CHECKIN_TICK_MS);
checkinTimer.unref();
periodic.push(checkinTimer);

// §5.3: loneliness and neglect are perturbations no sensor can emit
const solitude = new SolitudeMonitor({ db: dbFor(bootstrapAccountId), gosinoId: bootstrapExemplar.id, psyche });
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
    db: dbFor(bootstrapAccountId),
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
  periodic.push(idleTimer);
}

/**
 * ADR-077: l'arco che finisce da solo. Sei ore — non è un lavoro urgente, ma
 * deve girare anche nelle case dove il sogno è spento: il preavviso dei
 * sessanta giorni è una promessa fatta al proprietario, e una promessa che
 * dipende da un container opzionale non è una promessa.
 */
const mortality = new MortalityWatch({
  db,
  dbFor,
  dataKey,
  registry,
  logger: app.log,
  ...(env.UGO_REGISTRY_URL !== undefined &&
    env.UGO_REGISTRY_TOKEN !== undefined && {
      chain: new RegistryClient({
        baseUrl: env.UGO_REGISTRY_URL,
        token: env.UGO_REGISTRY_TOKEN,
      }),
    }),
});
const MORTALITY_TICK_MS = 6 * 3_600_000;
const mortalityTimer = setInterval(() => {
  mortality.tick().catch((error: unknown) => {
    app.log.warn(error, "mortality tick failed");
  });
}, MORTALITY_TICK_MS);
mortalityTimer.unref();
periodic.push(mortalityTimer);

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
  for (const timer of periodic) clearInterval(timer);
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
