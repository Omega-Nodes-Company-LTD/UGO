import { pgEnum } from "drizzle-orm/pg-core";
import { DESIRE_STATUSES, EVENT_SOURCES, MEMORY_KINDS, MESSAGE_CHANNELS } from "@ugo/shared";

// Closed domains as real Postgres enums: invalid values are rejected by the
// database itself, not just by application code.
export const eventSource = pgEnum("event_source", EVENT_SOURCES);
export const messageChannel = pgEnum("message_channel", MESSAGE_CHANNELS);
export const memoryKind = pgEnum("memory_kind", MEMORY_KINDS);
export const desireStatus = pgEnum("desire_status", DESIRE_STATUSES);
