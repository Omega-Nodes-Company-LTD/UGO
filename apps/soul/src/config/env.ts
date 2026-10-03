import { z } from "zod";

/** empty string = not configured (compose passes empty defaults through) */
const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
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
  OLLAMA_URL: z.url(),
  /**
   * ADR-122: Ollama resta SOLO per gli embedding — millisecondi su CPU, e
   * cambiarli vorrebbe dire ricalcolare ogni vettore. Tutto il resto (chat,
   * pensiero, visione, voce) passa dalle chiavi della casa.
   */
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
  /**
   * ADR-122 / ADR-130: le chiavi di PIATTAFORMA — le «chiavi UGO» che una casa
   * può usare a consumo, scalando dal suo credito. Tutte facoltative: senza,
   * le case possono solo portare le proprie. Mai mostrate, mai per account.
   */
  OPENROUTER_API_KEY: optionalNonEmpty,
  /** override per gli stub di rete nei test; vuoto = https://openrouter.ai */
  OPENROUTER_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  ELEVENLABS_API_KEY: optionalNonEmpty,
  ELEVENLABS_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  /** ADR-130: ricarico sul costo reale delle chiavi UGO (1.3 = +30%) */
  UGO_TOKEN_MARKUP: z.coerce.number().min(1).default(1.3),
  /** ADR-130: il cambio con cui la spesa in dollari scala un credito in euro */
  UGO_USD_EUR: z.coerce.number().positive().default(0.92),
  // Initiative off by default is the wrong default for a companion, but it is
  // the right one for a machine that just learned to speak first.
  UGO_INITIATIVE: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["on", "off"]).default("on")),
  /**
   * ADR-107 — il giudice dell'astensione: prima di comporre «Ricordi
   * pertinenti», il ruolo `judge` della casa (ADR-122) guarda se i ricordi ripescati rispondono
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
  /** ADR-122: facoltativa — è la chiave UGO a consumo, non quella di tutti */
  ANTHROPIC_API_KEY: optionalNonEmpty,
  /** override for network-level test stubs; defaults to the official API */
  ANTHROPIC_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
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
  /** ADR-109: il secchio delle foto dell'album; assente = l'album non conserva */
  S3_BUCKET_PHOTOS: optionalNonEmpty,
  /** ADR-111: i documenti di CASA, in un bucket loro e non con quelli dei clienti */
  S3_BUCKET_HOUSE_DOCS: optionalNonEmpty,
  /** provider region; Hetzner needs its own (e.g. fsn1), AWS-alikes tolerate us-east-1 */
  S3_REGION: z.string().min(1).default("us-east-1"),
  // Fase 5 — meetings: the feature activates only when both are set
  VEXA_API_URL: optionalNonEmpty,
  VEXA_API_KEY: optionalNonEmpty,
  UGO_OWNER_NAME: z.string().min(1).default("casa"),
  // Bearer token for destructive/expensive routes (see routes/guard.ts).
  // Mandatory in production: an unguarded erasure endpoint is not a risk
  // worth carrying just because the tailnet is usually enough.
  UGO_INTERNAL_TOKEN: optionalNonEmpty,
  // ADR-051: il segreto di servizio della reception — dedicato, NON il token
  // interno: ruotare la superficie pubblica non deve toccare quella interna.
  // Assente = la reception non esiste e le sue rotte non vengono registrate.
  UGO_RECEPTION_TOKEN: optionalNonEmpty,
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
  /** ADR-059: la ruminazione — col ruolo `think` della casa (ADR-122) */
  UGO_RUMINATION: z.enum(["on", "off"]).default("on"),
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
  // ADR-123: la chiave OpenAI di PIATTAFORMA (voce UGO a consumo). La voce di
  // una casa usa la chiave della casa; senza nessuna delle due, voce di sistema
  OPENAI_API_KEY: optionalNonEmpty,
  OPENAI_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
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
  NODE_ENV: z.string().default("development"),
  /**
   * ADR-121: soul su internet. `on` spegne la porta aperta dello sviluppo e il
   * ripiego «c'è un solo account, quindi è quello» per chi non presenta
   * credenziali; ogni rotta vuole una sessione o un token, tranne un elenco
   * esplicito (sito, accesso, vetrina, webhook). `off` = installazione di casa
   * sulla tailnet, come prima.
   */
  UGO_PUBLIC: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["on", "off"]).default("off")),
  /** l'indirizzo pubblico, senza barra finale: CORS, CSRF, link nelle mail */
  PUBLIC_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  /** ADR-124: le mail dei link d'accesso, via Resend */
  RESEND_API_KEY: optionalNonEmpty,
  RESEND_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  EMAIL_FROM: optionalNonEmpty,
  /** la versione dei termini e dell'informativa che chi si iscrive accetta */
  UGO_TERMS_VERSION: z.string().min(1).default("2026-10-03"),
  /**
   * ADR-125/126/130 — Stripe. Facoltative: senza, la via Stripe risponde 501
   * e lo dice. I prezzi stanno in Stripe, non qui: qui gli id dei prezzi.
   */
  STRIPE_SECRET_KEY: optionalNonEmpty,
  STRIPE_WEBHOOK_SECRET: optionalNonEmpty,
  STRIPE_API_BASE: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  STRIPE_PRICE_PRO: optionalNonEmpty,
  STRIPE_PRICE_ALLEVAMENTO: optionalNonEmpty,
  /** ADR-131: la commissione del mercato sulle adozioni degli allevamenti (Connect), in percento */
  UGO_MARKET_FEE_PCT: z.coerce.number().min(0).max(50).default(10),
  /** ADR-125/126/130 — PayPal. Facoltative come Stripe */
  PAYPAL_CLIENT_ID: optionalNonEmpty,
  PAYPAL_CLIENT_SECRET: optionalNonEmpty,
  PAYPAL_WEBHOOK_ID: optionalNonEmpty,
  /** `live` o `sandbox`: decide l'indirizzo dell'API, se PAYPAL_API_BASE non lo dice */
  PAYPAL_ENV: z.enum(["live", "sandbox"]).default("sandbox"),
  PAYPAL_API_BASE: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  PAYPAL_PLAN_PRO: optionalNonEmpty,
  PAYPAL_PLAN_ALLEVAMENTO: optionalNonEmpty,
  /** il titolare del trattamento, come appare in informativa e termini */
  UGO_LEGAL_NAME: optionalNonEmpty,
  /** dove si scrive per esercitare i diritti (informativa) */
  UGO_CONTACT_EMAIL: optionalNonEmpty,
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
  // ADR-121: su internet una configurazione a metà è una porta aperta a metà
  if (env.UGO_PUBLIC === "on") {
    const missing = (
      [
        ["UGO_INTERNAL_TOKEN", env.UGO_INTERNAL_TOKEN],
        ["PUBLIC_URL", env.PUBLIC_URL],
        ["RESEND_API_KEY", env.RESEND_API_KEY],
        ["EMAIL_FROM", env.EMAIL_FROM],
      ] as const
    )
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`UGO_PUBLIC=on requires: ${missing.join(", ")}`);
    }
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
