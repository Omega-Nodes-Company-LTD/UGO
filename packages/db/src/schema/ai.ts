import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";

/**
 * Le chiavi della casa (ADR-122): una per provider, per account.
 *
 * `secret_enc` è cifrato con la DEK DELL'ACCOUNT (`accounts.wrapped_data_key`),
 * non con la chiave madre: chiudere l'account e distruggerne la DEK rende
 * illeggibili anche le chiavi dei provider. Mai restituito da una GET, mai
 * nell'export, mai nei log: fuori da soul si vede solo `hint`.
 */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    provider: text("provider").notNull(),
    secretEnc: text("secret_enc").notNull(),
    /** le ultime quattro cifre, per riconoscerla senza leggerla */
    hint: text("hint").notNull(),
    status: text("status").notNull().default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("provider_credentials_account_provider").on(table.accountId, table.provider),
    check(
      "provider_credentials_provider",
      sql`${table.provider} in ('anthropic', 'openrouter', 'openai', 'elevenlabs')`,
    ),
    check(
      "provider_credentials_status",
      sql`${table.status} in ('unverified', 'ok', 'invalid')`,
    ),
  ],
);

/**
 * Un modello per ruolo (ADR-122), scelto da una lista che viene dal provider.
 *
 * Il prezzo si FOTOGRAFA alla scelta: il ledger non incontra mai un modello
 * senza prezzo, e un listino che cambia domani non riscrive il conto di ieri.
 * `source` dice di chi è la chiave: della casa (`byok`) o di UGO a consumo
 * (`ugo`, ADR-130), e si sceglie ruolo per ruolo.
 */
export const modelChoices = pgTable(
  "model_choices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    role: text("role").notNull(),
    source: text("source").notNull().default("byok"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    /** solo per `tts`: la voce del provider */
    voice: text("voice"),
    /** USD per milione di token (testo) o per milione di caratteri (voce) */
    priceInPerMTok: numeric("price_in_per_mtok", { precision: 12, scale: 6 }),
    priceOutPerMTok: numeric("price_out_per_mtok", { precision: 12, scale: 6 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("model_choices_account_role").on(table.accountId, table.role),
    check(
      "model_choices_role",
      sql`${table.role} in ('chat', 'think', 'vision', 'judge', 'tts', 'stt')`,
    ),
    check("model_choices_source", sql`${table.source} in ('byok', 'ugo')`),
    check(
      "model_choices_provider",
      sql`${table.provider} in ('anthropic', 'openrouter', 'openai', 'elevenlabs')`,
    ),
    index("model_choices_account_idx").on(table.accountId),
  ],
);
