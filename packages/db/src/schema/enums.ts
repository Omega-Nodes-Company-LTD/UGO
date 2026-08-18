import { pgEnum } from "drizzle-orm/pg-core";
import {
  ACCESS_ROLES,
  BEING_KINDS,
  CORRECTION_SIGNALS,
  DESIRE_STATUSES,
  DESIRE_KINDS,
  EVENT_SOURCES,
  MEMORY_KINDS,
  MESSAGE_CHANNELS,
  RECOGNITION_MODALITIES,
  RELATION_SOURCES,
  RELATION_TYPES,
  TICKET_STATUSES,
  CUSTOMER_SOURCE_TYPES,
  CUSTOMER_SOURCE_STATUSES,
  FEEDING_KINDS,
} from "@ugo/shared";

// Closed domains as real Postgres enums: invalid values are rejected by the
// database itself, not just by application code. `species` and `modality` are
// deliberately NOT here — ADR-014/016 promise that adding one needs no
// migration.
export const eventSource = pgEnum("event_source", EVENT_SOURCES);
export const messageChannel = pgEnum("message_channel", MESSAGE_CHANNELS);
export const memoryKind = pgEnum("memory_kind", MEMORY_KINDS);
export const desireStatus = pgEnum("desire_status", DESIRE_STATUSES);
export const desireKind = pgEnum("desire_kind", DESIRE_KINDS);
export const beingKind = pgEnum("being_kind", BEING_KINDS);
export const relationType = pgEnum("relation_type", RELATION_TYPES);
export const relationSource = pgEnum("relation_source", RELATION_SOURCES);
export const recognitionModality = pgEnum("recognition_modality", RECOGNITION_MODALITIES);
export const correctionSignal = pgEnum("correction_signal", CORRECTION_SIGNALS);
export const accessRole = pgEnum("access_role", ACCESS_ROLES);
export const ticketStatus = pgEnum("ticket_status", TICKET_STATUSES);
export const customerSourceType = pgEnum("customer_source_type", CUSTOMER_SOURCE_TYPES);
export const customerSourceStatus = pgEnum("customer_source_status", CUSTOMER_SOURCE_STATUSES);
export const feedingKind = pgEnum("feeding_kind", FEEDING_KINDS);
