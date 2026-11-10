import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBED_MODEL,
  DEFAULT_PROVIDERS,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VISION_MODEL,
} from "@ugo/memory";
import { z } from "zod";

/** empty string = not configured (compose passes empty defaults through) */
const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Un segreto che finisce in un header HTTP (`Bearer …`, `x-api-key`).
 *
 * Incollato da una nota o da una pagina web, un valore può portarsi dietro un
 * carattere invisibile — il 2026-11-09 è stato U+2028 in coda alla chiave di
 * OpenRouter — e Node lo scopre solo alla prima chiamata, con un 500 che
 * parla di ByteString. Gli spazi ai bordi non fanno mai parte di una chiave e
 * si tolgono; qualunque altro carattere fuori dall'ASCII stampabile ferma il
 * boot col nome della variabile (mai il valore), invece di ogni messaggio.
 */
const HEADER_SAFE = /^[\x21-\x7E]+$/u;
const headerSecretMessage =
  "contiene un carattere invisibile o non ASCII (spesso arriva incollando): riscrivila a mano";
const headerSecret = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1).regex(HEADER_SAFE, headerSecretMessage),
);
const optionalHeaderSecret = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(HEADER_SAFE, headerSecretMessage).optional(),
  ),
);

/** Environment contract for soul-api (Fasi 0-4). Boot fails fast if unmet. */
export const soulEnvSchema = z.object({
  DATABASE_URL: z.url(),
  /**
   * ADR-062 tempo 2b: l'utenza applicativa (`ugo_app`), su cui le politiche
   * RLS mordono davvero. Assente = si resta sull'owner, dove il muro esiste
   * ed è inerte — il flip è impostarla, e si può togliere per tornare
   * indietro. Le migrazioni restano SEMPRE su DATABASE_URL (l'owner).
   */
  DATABASE_URL_APP: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  // MQTT exists for the Nano 33 IoT firmware only (PROGETTO §5.7). With the
  // firmware set aside, a deployment has no broker and must not be forced to
  // invent one: leave these unset and the check reports "off", not "error".
  MQTT_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  MQTT_USER: optionalNonEmpty,
  MQTT_PASS: optionalNonEmpty,
  /**
   * **Ritirata** da ADR-124. Resta qui **solo per fallire al boot** se è
   * ancora in un file di ambiente (superRefine sotto).
   */
  UGO_CHAT_LOCAL_FIRST: optionalNonEmpty,
  /**
   * ADR-131: Ollama non esiste più — tutto passa da OpenRouter. Le variabili
   * OLLAMA_* rimaste in un ambiente vengono semplicemente ignorate (lo schema
   * non le conosce): toglierle è pulizia, non una condizione per partire.
   *
   * Gli embedding: lo stesso modello e le stesse 768 dimensioni dei job, o i
   * vettori del sogno e quelli della chat non sarebbero confrontabili.
   */
  OPENROUTER_EMBED_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_EMBED_MODEL),
  ),
  /** ADR-131: la dettatura (`/v1/stt`), al posto di whisper sulla percezione */
  OPENROUTER_STT_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_STT_MODEL),
  ),
  /**
   * ADR-131: le occhiate spontanee alla stanza (SceneGlance) mandavano i
   * fotogrammi al modello di casa, gratis. Via OpenRouter ogni occhiata
   * esce di casa e costa: spente finché non le accendi tu.
   */
  UGO_GLANCES: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["on", "off"]).default("off"),
  ),
  // ADR-125: OpenRouter è l'unico fornitore a pagamento — chat e voce. La
  // chiave è obbligatoria: senza, UGO non ha parole.
  OPENROUTER_API_KEY: headerSecret,
  OPENROUTER_CHAT_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_CHAT_MODEL),
  ),
  /**
   * L'elenco chiuso e ORDINATO dei fornitori (ADR-125 §3): in testa quelli che
   * fanno il caching del prefisso, mai uno con sede in Cina.
   */
  OPENROUTER_PROVIDERS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .optional()
      .transform((value) =>
        value === undefined
          ? [...DEFAULT_PROVIDERS]
          : value
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name !== ""),
      )
      .pipe(z.array(z.string().min(1)).min(1)),
  ),
  /**
   * ADR-131: chi guarda le foto — quelle mandate in chat, l'album, i ricordi
   * della stanza e (se accese) le occhiate. Servito dai fornitori di
   * `OPENROUTER_PROVIDERS`: cambiandolo, controlla che almeno uno lo serva.
   */
  OPENROUTER_VISION_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_VISION_MODEL),
  ),
  /** il modello della voce, sempre via OpenRouter (ADR-125 §6) */
  OPENROUTER_TTS_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_TTS_MODEL),
  ),
  // Initiative off by default is the wrong default for a companion, but it is
  // the right one for a machine that just learned to speak first.
  UGO_INITIATIVE: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["on", "off"]).default("on")),
  /**
   * ADR-107 — il giudice dell'astensione: prima di comporre «Ricordi
   * pertinenti», il modello di CASA guarda se i ricordi ripescati rispondono
   * davvero alla domanda. Se no, UGO dice che non lo sa **con parole sue**.
   *
   * Acceso di default per scelta del proprietario (2026-08-19), preso lo
   * scambio con gli occhi aperti: dieci confabulazioni evitate su dieci, e un
   * «non lo so» ogni dieci risposte che una risposta ce l'avevano. `off` torna
   * al comportamento di prima — risponde sempre, anche a vuoto.
   */
  UGO_ABSTAIN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["on", "off"]).default("on"),
  ),
  UGO_INITIATIVE_TICK_MINUTES: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).default(4),
  ),
  // ADR-125: ritirate. Restano nello schema solo per FERMARE il boot se sono
  // ancora in un file d'ambiente (superRefine sotto).
  ANTHROPIC_API_KEY: optionalNonEmpty,
  ANTHROPIC_BASE_URL: optionalNonEmpty,
  UGO_CHAT_MODEL: optionalNonEmpty,
  OPENAI_API_KEY: optionalNonEmpty,
  OPENAI_BASE_URL: optionalNonEmpty,
  UGO_TTS_MODEL: optionalNonEmpty,
  UGO_TTS_VOICE: optionalNonEmpty,
  OPENROUTER_BASE_URL: optionalNonEmpty,
  UGO_DAILY_BUDGET_USD: z.coerce.number().positive().default(0.5),
  /**
   * ADR-103: quanto costa un cucciolo, **per cucciolo** e dalla terza
   * generazione in poi. Zero è legittimo e vuol dire «da questa casa si nasce
   * gratis»: è una scelta dichiarata, non una manopola sul carattere.
   */
  UGO_LITTER_COST_USD: z.coerce.number().min(0).default(0.25),
  /** 32 bytes base64 — AES-256-GCM key for at-rest message encryption */
  UGO_DATA_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().min(1).default("Europe/Rome"),
  // Fase 4 — audio uploads: the feature activates only when all four are set
  S3_ENDPOINT: optionalNonEmpty,
  // Both spellings are accepted. The AWS-conventional names are what every
  // provider's console shows you (Hetzner included) and what the SDK docs
  // use, so insisting on our shorter ones only bought a confusing boot error.
  S3_ACCESS_KEY: optionalNonEmpty,
  S3_ACCESS_KEY_ID: optionalNonEmpty,
  S3_SECRET_KEY: optionalNonEmpty,
  S3_SECRET_ACCESS_KEY: optionalNonEmpty,
  S3_BUCKET_AUDIO: optionalNonEmpty,
  // ADR-054: il bucket privato dei documenti dei clienti (upload dal pannello)
  S3_BUCKET_DOCS: optionalNonEmpty,
  /** ADR-122: il secchio delle foto dell'album; assente = l'album non conserva */
  S3_BUCKET_PHOTOS: optionalNonEmpty,
  /** ADR-111: i documenti di CASA, in un bucket loro e non con quelli dei clienti */
  S3_BUCKET_HOUSE_DOCS: optionalNonEmpty,
  /** provider region; Hetzner needs its own (e.g. fsn1), AWS-alikes tolerate us-east-1 */
  S3_REGION: z.string().min(1).default("us-east-1"),
  // Fase 5 — meetings: the feature activates only when both are set
  VEXA_API_URL: optionalNonEmpty,
  VEXA_API_KEY: optionalHeaderSecret,
  UGO_OWNER_NAME: z.string().min(1).default("casa"),
  // Bearer token for destructive/expensive routes (see routes/guard.ts).
  // Mandatory in production: an unguarded erasure endpoint is not a risk
  // worth carrying just because the tailnet is usually enough.
  UGO_INTERNAL_TOKEN: optionalHeaderSecret,
  // ADR-051: il segreto di servizio della reception — dedicato, NON il token
  // interno: ruotare la superficie pubblica non deve toccare quella interna.
  // Assente = la reception non esiste e le sue rotte non vengono registrate.
  UGO_RECEPTION_TOKEN: optionalHeaderSecret,
  // ADR-128: il gosino al telefono. Il segreto che Omega HQ presenta (dedicato:
  // ruotarlo non tocca la reception né il token interno) e la casa che
  // risponde. Tutti e due o nessuno: assenti = la porta del telefono non esiste.
  UGO_PHONE_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  UGO_PHONE_ACCOUNT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
  // Dove vive l'API GitHub dello stato vivo (ADR-054). Serve agli e2e per
  // essere ermetici: '/works' la interroga sul percorso caldo, e un test che
  // aspetta api.github.com vera è un test che fallisce quando GitHub tarda.
  GITHUB_API_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  // ADR-055: i default dei contatori del cliente; ogni cliente può avere i
  // suoi dal pannello, senza deploy
  UGO_CUSTOMER_HOURLY_MESSAGES: z.coerce.number().int().positive().default(20),
  UGO_CUSTOMER_DAILY_BUDGET_USD: z.coerce.number().positive().default(0.25),
  /** ADR-058: mele per cliente in sette giorni; `customers.weekly_reward_limit` scavalca */
  UGO_CUSTOMER_WEEKLY_REWARDS: z.coerce.number().int().min(0).default(2),
  /**
   * ADR-059: la ruminazione. ADR-131: senza modelli locali ogni pensiero esce
   * su OpenRouter e costa, quindi nasce spenta — si accende, non si subisce.
   */
  UGO_RUMINATION: z.enum(["on", "off"]).default("off"),
  /** minuti fra un pensiero e l'altro, per gosino (tentativi, non successi) */
  UGO_RUMINATION_GAP_MIN: z.coerce.number().int().positive().default(45),
  // gruppo 12: dove sta la casa, per il meteo vero e il cielo di stanotte.
  // Facoltative: senza, /v1/weather risponde «non disponibile» e il cielo del
  // recinto resta quello di sempre. Coordinate, non un indirizzo: open-meteo
  // non vuole chiavi e non riceve altro.
  // ADR-063: la finestra sul mondo — SearXNG in casa. Assente = il prefisso
  // «cerca:» non esiste e niente esce verso i motori
  SEARXNG_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  // ADR-073: il libro genealogico, in un container suo. Assenti = i gosini
  // nascono esattamente come prima, solo senza atto in catena
  UGO_REGISTRY_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  UGO_REGISTRY_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  // preprocess: una stringa vuota NON è latitudine 0 (l'equatore per sbaglio)
  UGO_HOME_LAT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().min(-90).max(90).optional(),
  ),
  UGO_HOME_LON: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().min(-180).max(180).optional(),
  ),
  // ADR-045: il servizio di percezione (voce e volto). Assente = UGO risponde
  // senza sapere chi ha davanti, che è il comportamento di ogni versione fino
  // a ieri: la biometria si accende, non si subisce.
  UGO_RECOGNITION_URL: optionalNonEmpty,
  // optional HTTP trigger of the jobs runner, for POST /v1/jobs/dream
  UGO_JOBS_TRIGGER_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  // ADR-025: how long the house must be quiet before UGO uses the pause to
  // consolidate. 0 turns idle consolidation off entirely.
  UGO_IDLE_CONSOLIDATION_MINUTES: z
    .preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(0).default(90)),
  // the nightly dream's own hour, so the idle run stands well clear of it
  UGO_DREAM_AT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{2}:\d{2}$/).default("02:30"),
  ),
  // ADR-016: the Umwelt map is configuration. Malformed JSON must fail the
  // boot, not silently make UGO treat a reptile like a human.
  UGO_SPECIES_MAP: optionalNonEmpty,
  // Set to "false" only when something else owns the schema (a second
  // exemplar, or a release step that runs migrations before the rollout).
  UGO_AUTO_MIGRATE: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["true", "false"]).default("true"))
    .transform((value) => value === "true"),
  // where the built face lives inside the image (ADR-018 Tempo 1); empty in
  // development, where Vite serves it on its own port
  UGO_FACE_DIR: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  /**
   * ADR-127 — la casa sul web. Assente = la casa resta dov'era (rete di casa o
   * tailnet). Presente: HSTS, CORS chiuso su questa origine, link via email.
   */
  UGO_PUBLIC_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  /** quanti proxy fidati stanno davanti a soul: dietro Coolify (Traefik) è 1 */
  UGO_TRUST_PROXY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(5).optional(),
  ),
  /** origini in più ammesse dal CORS, separate da virgole */
  UGO_ALLOWED_ORIGINS: optionalNonEmpty,
  /** `TEAMID.bundle` per i link universali dell'app (apple-app-site-association) */
  UGO_APPLE_APP_IDS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().default("8UH44UM49Z.ai.omeganodes.ugo"),
  ),
  /** l'indirizzo del titolare: l'unico a cui parte il link per entrare */
  UGO_OWNER_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.email().optional()),
  RESEND_API_KEY: optionalHeaderSecret,
  EMAIL_FROM: optionalNonEmpty,
  NODE_ENV: z.string().default("development"),
}).superRefine((env, ctx) => {
  // ADR-124: il nome vecchio non si ignora in silenzio. Ignorarlo vorrebbe
  // dire che una casa convinta di avere la voce di casa davanti scopre il
  // contrario dal comportamento, che è esattamente come il guasto è arrivato
  // sul campo invece che in un test.
  if (env.UGO_CHAT_LOCAL_FIRST !== undefined) {
    ctx.addIssue({
      code: "custom",
      message:
        "UGO_CHAT_LOCAL_FIRST non esiste più (ADR-124): l'ordine della catena è " +
        "solo OpenRouter (ADR-131). Togli la riga.",
      path: ["UGO_CHAT_LOCAL_FIRST"],
    });
  }
  // ADR-128: mezza porta del telefono non è una porta — fail fast (regola 4)
  if ((env.UGO_PHONE_TOKEN === undefined) !== (env.UGO_PHONE_ACCOUNT_ID === undefined)) {
    ctx.addIssue({
      code: "custom",
      message: "UGO_PHONE_TOKEN e UGO_PHONE_ACCOUNT_ID vanno insieme (ADR-128): o tutte e due, o nessuna",
      path: ["UGO_PHONE_TOKEN"],
    });
  }
  // ADR-125: i fornitori ritirati non si ignorano in silenzio. Una casa
  // convinta di parlare con Anthropic deve sapere al boot che non è più così.
  const retired: Record<string, string> = {
    ANTHROPIC_API_KEY: "la chat passa da OpenRouter: usa OPENROUTER_API_KEY",
    ANTHROPIC_BASE_URL: "non esiste più un indirizzo Anthropic da cambiare",
    UGO_CHAT_MODEL: "il modello della chat è OPENROUTER_CHAT_MODEL",
    OPENAI_API_KEY: "la voce passa da OpenRouter: usa OPENROUTER_API_KEY",
    OPENAI_BASE_URL: "non esiste più un indirizzo OpenAI da cambiare",
    UGO_TTS_MODEL: "il modello della voce è OPENROUTER_TTS_MODEL",
    UGO_TTS_VOICE: "la voce è un gene del gosino, non un'impostazione (ADR-126)",
    OPENROUTER_BASE_URL: "serviva agli stub di rete, che non esistono più",
  };
  for (const [name, instead] of Object.entries(retired)) {
    if (env[name as keyof typeof env] !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `${name} non esiste più (ADR-125): ${instead}. Togli la riga.`,
        path: [name],
      });
    }
  }
  // ADR-127: il link via email è tre cose insieme o niente — una a metà non
  // manda email e non lo dice a nessuno
  const mail = [env.UGO_OWNER_EMAIL, env.RESEND_API_KEY, env.EMAIL_FROM, env.UGO_PUBLIC_URL];
  const someMail = [env.UGO_OWNER_EMAIL, env.RESEND_API_KEY, env.EMAIL_FROM].some((v) => v !== undefined);
  if (someMail && mail.some((v) => v === undefined)) {
    ctx.addIssue({
      code: "custom",
      message:
        "il link via email (ADR-127) vuole tutte e quattro: UGO_OWNER_EMAIL, RESEND_API_KEY, " +
        "EMAIL_FROM e UGO_PUBLIC_URL — oppure nessuna delle tre email",
      path: ["UGO_OWNER_EMAIL"],
    });
  }
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;

/**
 * Quale connessione usa il SERVIZIO (soul e i job), quando il flip di RLS è
 * acceso. ADR-062 tempo 2b: con `DATABASE_URL_APP` il servizio parla come
 * `ugo_app`, a cui le politiche mordono; senza, resta sull'owner e il muro
 * è inerte. Le migrazioni non passano MAI da qui.
 */
export function appDatabaseUrl(env: SoulEnv): string {
  return env.DATABASE_URL_APP ?? env.DATABASE_URL;
}

export function assertProductionSecrets(env: SoulEnv): void {
  if (env.NODE_ENV === "production" && env.UGO_INTERNAL_TOKEN === undefined) {
    throw new Error(
      "UGO_INTERNAL_TOKEN is required when NODE_ENV=production: refusing to expose " +
        "erasure, export, meeting and upload routes without authentication",
    );
  }
}

export interface AudioStorageEnv {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** provider region: Hetzner rejects a wrong one, AWS-alikes ignore it */
  region: string;
}

/** All-or-nothing S3 group: a partial configuration is a config error. */
export function audioStorageFromEnv(env: SoulEnv): AudioStorageEnv | undefined {
  const accessKey = env.S3_ACCESS_KEY ?? env.S3_ACCESS_KEY_ID;
  const secretKey = env.S3_SECRET_KEY ?? env.S3_SECRET_ACCESS_KEY;
  const required = {
    S3_ENDPOINT: env.S3_ENDPOINT,
    "S3_ACCESS_KEY (o S3_ACCESS_KEY_ID)": accessKey,
    "S3_SECRET_KEY (o S3_SECRET_ACCESS_KEY)": secretKey,
    S3_BUCKET_AUDIO: env.S3_BUCKET_AUDIO,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  // nothing configured at all is a valid choice: audio upload simply stays off
  if (missing.length === Object.keys(required).length) return undefined;
  if (missing.length > 0) {
    // name the variables, never their values (CLAUDE.md rule 6)
    throw new Error(
      `configurazione S3 incompleta: mancano ${missing.join(", ")}. ` +
        "Impostale tutte, oppure nessuna per disattivare l'upload audio.",
    );
  }
  return {
    endpoint: env.S3_ENDPOINT ?? "",
    accessKey: accessKey ?? "",
    secretKey: secretKey ?? "",
    bucket: env.S3_BUCKET_AUDIO ?? "",
    region: env.S3_REGION,
  };
}
