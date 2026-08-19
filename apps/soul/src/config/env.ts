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
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
  // ADR-027: the model that gives UGO the words for a question of his own.
  // Local on purpose — an initiative must never be able to spend the API
  // budget. Falls back to the dream's model, already pulled on the server.
  // the dream's model is already pulled on the server, so it is the default
  // here too; point TEXT at something smaller for snappier questions
  OLLAMA_BATCH_MODEL: z.string().min(1).default("qwen3:30b-a3b"),
  OLLAMA_TEXT_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  /**
   * ADR-094: la voce di casa parla per prima, e il provider è il soccorso.
   * Acceso per default su direttiva del proprietario — «local-first» senza
   * l'asterisco. `off` esiste per il giorno in cui serve confrontare le due
   * voci, non come scelta consigliata.
   */
  UGO_CHAT_LOCAL_FIRST: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["on", "off"]).default("on")),
  /** il modello di casa per la CHAT; vuoto = quello del testo, poi del sogno */
  OLLAMA_CHAT_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  // ADR-095: il secondo anello della catena, fra casa e Anthropic. Solo con
  // la chiave; senza, la catena lo salta e non se ne accorge nessuno.
  OPENROUTER_API_KEY: optionalNonEmpty,
  OPENROUTER_CHAT_MODEL: optionalNonEmpty,
  /** override per gli stub di rete nei test; vuoto = https://openrouter.ai */
  OPENROUTER_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
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
  ANTHROPIC_API_KEY: z.string().min(1),
  /** override for network-level test stubs; defaults to the official API */
  ANTHROPIC_BASE_URL: z.url().optional(),
  UGO_CHAT_MODEL: z.string().min(1).default("claude-haiku-4-5"),
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
  /** ADR-059: la ruminazione sui modelli locali — zero token del provider */
  UGO_RUMINATION: z.enum(["on", "off"]).default("on"),
  /** minuti fra un pensiero e l'altro, per gosino (tentativi, non successi) */
  UGO_RUMINATION_GAP_MIN: z.coerce.number().int().positive().default(45),
  // gruppo 12: dove sta la casa, per il meteo vero e il cielo di stanotte.
  // Facoltative: senza, /v1/weather risponde «non disponibile» e il cielo del
  // recinto resta quello di sempre. Coordinate, non un indirizzo: open-meteo
  // non vuole chiavi e non riceve altro.
  // gruppo 12: il modello vision locale (moondream, llava…). Assente = UGO
  // non dà occhiate: la visione si accende, non si subisce
  OLLAMA_VISION_MODEL: optionalNonEmpty,
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
  // gruppo 13: la voce interim (TTS emotivo OpenAI, finché non c'è la GPU per
  // XTTS locale). Assente = voce di sistema, come sempre. Attenzione
  // dichiarata in /documentation: ciò che UGO dice può contenere pezzi della
  // vostra vita, e sintetizzarlo fuori casa è una scelta, non un default
  OPENAI_API_KEY: optionalNonEmpty,
  OPENAI_BASE_URL: z.url().optional(),
  UGO_TTS_MODEL: z.string().min(1).default("gpt-4o-mini-tts"),
  UGO_TTS_VOICE: z.string().min(1).default("alloy"),
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
}).superRefine((env, ctx) => {
  // meta' configurazione non e' una configurazione: fail fast al boot (regola 4)
  if (env.OPENROUTER_API_KEY !== undefined && env.OPENROUTER_CHAT_MODEL === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "OPENROUTER_API_KEY impostata senza OPENROUTER_CHAT_MODEL: serve anche il modello",
      path: ["OPENROUTER_CHAT_MODEL"],
    });
  }
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;

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
