import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messageChannel } from "./enums.js";
import { beings } from "./beings.js";
import { gosinoId } from "./self.js";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: gosinoId(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    channel: messageChannel("channel").notNull(),
    role: text("role").notNull(),
    // set null: GDPR erasure anonymizes, it does not destroy the biography
    beingId: uuid("being_id").references(() => beings.id, { onDelete: "set null" }),
    // Contract (PROGETTO §7): from Fase 1 this column holds AES-256-GCM
    // ciphertext (UGO_DATA_KEY), never plaintext. Full-text SQL search is
    // deliberately impossible; retrieval goes through embeddings.
    text: text("text").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  },
  (table) => [
    index("messages_ts_idx").on(table.ts),
    index("messages_channel_idx").on(table.channel),
    // `loadHistory` gira a OGNI turno di chat filtrando per esemplare dentro
    // una finestra di ore: senza questo era una scansione sequenziale che
    // cresceva con la biografia della casa, cioè una risposta che rallenta
    // per il solo fatto di aver parlato tanto.
    index("messages_gosino_ts_idx").on(table.gosinoId, table.ts.desc()),
  ],
);
