import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";

/**
 * The rooms of the house (ADR-039).
 *
 * Until now a room was not a thing: it was whatever string happened to sit in
 * `gosini.location_label`. That made a room exist only while somebody was
 * standing in it — you could not make one in advance, and the moment its last
 * resident left it vanished, taking the address `/?stanza=<nome>` with it. It
 * also meant "which rooms are there" could only ever be a free-text field with
 * a datalist of guesses, never a list to pick from.
 *
 * So the catalogue becomes real, and `location_label` stays what it always was
 * — the name of the room a creature is in. The name is the address the body
 * uses and the documentation promises, so making it a foreign key would have
 * moved the address into an id the owner never sees, for no gain here.
 * What keeps the two honest instead is that **nothing may write a label that
 * is not in this table**: births and moves validate against it, and deleting a
 * room clears its residents in the same transaction.
 */
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    /** as typed, for reading: "Cucina" */
    name: text("name").notNull(),
    /**
     * `name` trimmed and lowercased. This is the key everything already
     * matches on — `?stanza=CUCINA` has always found `cucina` — so it is
     * stored rather than recomputed, and it is what uniqueness is about:
     * two rooms differing only in case are one room with two spellings.
     */
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rooms_account_idx").on(table.accountId),
    unique("rooms_account_slug_uq").on(table.accountId, table.slug),
  ],
);

/** The one normalization, in one place: the address is the name, lowercased. */
export function slugOfRoom(name: string): string {
  return name.trim().toLowerCase();
}
