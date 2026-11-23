import { REBUILT_ON_IMPORT, type TablePolicy, type Why } from "./policy.js";

const credentials: Why = {
  category: "credentials",
  reason: "sono le chiavi d'accesso della casa ospitante: un archivio che si manda per email non le porta",
};
const business: Why = {
  category: "business-data",
  reason: "riguarda i clienti della reception: dati di altre persone, non la vita del gosino",
};
const biometrics: Why = {
  category: "biometrics",
  reason: "impronte e riconoscimenti di volti e voci non lasciano la casa (ADR-016/057): sul nuovo computer si rifà l'arruolamento",
};
const economics: Why = {
  category: "hosted-economics",
  reason: "riguarda i conti con l'installazione ospitante: sul tuo computer il tetto di spesa lo scegli tu",
};
const peer: Why = {
  category: "peer-exchange",
  reason: "serve l'altra casa per avere senso: cartoline e legami fra case restano dove sono",
};
const vector: Why = { category: "recomputable", reason: REBUILT_ON_IMPORT };

/**
 * One entry per table in the schema; `policy.test.ts` and the integration test
 * fail when the two drift apart. Keep it alphabetical.
 */
export const TABLES: Readonly<Record<string, TablePolicy>> = {
  access_tokens: { omit: credentials },
  account_ties: { omit: peer, accountColumns: ["from_account_id", "to_account_id"] },
  accounts: {
    drop: {
      wrapped_data_key: {
        category: "data-keys",
        reason: "la chiave che cifra i dati della casa ospitante: sul nuovo computer se ne genera una nuova",
      },
      is_foundry: {
        category: "authorizations",
        reason: "coniare capostipiti è dell'allevamento fondatore e non si porta via (ADR-081)",
      },
      can_breed: {
        category: "authorizations",
        reason: "allevare cucciolate è un'autorizzazione che si dà da riga di comando, non viaggia (ADR-081)",
      },
      daily_budget_usd: economics,
      metabolism: economics,
    },
  },
  act_efficacy: {},
  adoptions: { omit: economics },
  audit_log: {
    omit: {
      category: "security-log",
      reason: "è il registro di sicurezza dell'installazione ospitante, non la storia del gosino",
    },
  },
  beings: { drop: { embedding: vector } },
  births: { publicBytes: ["signature", "parent_public_key"] },
  bonds: {},
  budget_ledger: { omit: economics },
  checkins: {},
  corrections: { omit: biometrics },
  customer_access_tokens: { omit: credentials },
  customer_answer_cache: { omit: business },
  customer_chunks: { omit: business },
  customer_documents: { omit: business },
  customer_gosini: { omit: business },
  customer_mail_accounts: { omit: business },
  customer_messages: { omit: business },
  customer_repos: { omit: business },
  customer_rewards: { omit: business },
  customers: { omit: business },
  desires: {},
  diary_entries: { encrypted: ["text"] },
  events: {},
  feed_items: {
    omit: {
      category: "refetchable",
      reason: "sono notizie pubbliche: si riscaricano dai feed, che invece viaggiano",
    },
  },
  feedings: { omit: economics },
  games: { encrypted: ["secret"] },
  gosini: {
    publicBytes: ["signing_public_key"],
    drop: {
      signing_private_key: {
        category: "identity-keys",
        reason: "la chiave con cui il gosino firma: per ora non lascia la casa (decisione aperta, ADR-132)",
      },
      rotation_secret: {
        category: "identity-keys",
        reason: "il segreto di rotazione della chiave di firma: per ora non lascia la casa (decisione aperta, ADR-132)",
      },
      wrapped_soul_key: {
        category: "data-keys",
        reason: "la chiave della sua interiorità: sul nuovo computer ne nasce una nuova (ADR-075)",
      },
      device_id: {
        category: "hosted-binding",
        reason: "lega il gosino al telefono collegato all'installazione ospitante",
      },
      listed_at: economics,
      price_cents: economics,
    },
  },
  house_chunks: {
    encrypted: ["text"],
    drop: { embedding: vector },
    embed: { vector: "embedding", from: "text", required: true },
  },
  house_documents: { encrypted: ["filename"], mediaColumn: "s3_key" },
  list_items: { encrypted: ["text"] },
  login_links: { omit: credentials },
  meetings: { mediaColumn: "audio_uri" },
  memories: {
    encrypted: ["text"],
    writtenPlain: ["text"], // ADR-091: memories are stored in the clear
    drop: { embedding: vector, search_vector: vector },
    embed: { vector: "embedding", from: "text", required: false },
  },
  memory_beings: {},
  messages: { encrypted: ["text"] },
  pairing_codes: { omit: credentials },
  parcels: { omit: peer, accountColumns: ["from_account_id", "to_account_id"] },
  perception_events: { omit: biometrics },
  phone_calls: { omit: business },
  photos: { mediaColumn: "object_key" },
  placed_props: {},
  places: {},
  prop_stock: {},
  psyche_baselines: {},
  psyche_snapshots: {},
  recognition_profiles: { omit: biometrics },
  relations: {},
  rooms: {},
  rss_feeds: {},
  tickets: { omit: business },
  trait_sets: {},
  transcript_segments: {
    encrypted: ["text"],
    drop: { embedding: vector },
    embed: { vector: "embedding", from: "text", required: false },
  },
  unknown_prints: { omit: biometrics },
};
