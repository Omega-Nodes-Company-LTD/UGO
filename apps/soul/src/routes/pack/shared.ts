import type { DbClient } from "@ugo/db";
import { BEING_KINDS, CORRECTION_SIGNALS, RELATION_TYPES, type SpeciesMap } from "@ugo/shared";
import { z } from "zod";
import type { PreHandler } from "../guard.js";

/** Contracts and deps shared by the pack routes (ADR-014/016). */

export interface PackRouteDeps {
  db: DbClient;
  speciesMap: SpeciesMap;
  guard: PreHandler;
  gosinoId?: string;
}

export const createBeingSchema = z.object({
  displayName: z.string().min(1).max(120),
  // not an enum on purpose (ADR-014): a species we do not know yet must be
  // accepted, and degrade to the cautious `unknown` profile
  species: z.string().min(1).max(40).default("human"),
  kind: z.enum(BEING_KINDS).default("resident"),
  arrivalAt: z.iso.date().optional(),
  isMinor: z.boolean().default(false),
  noVision: z.boolean().default(false),
  noAudio: z.boolean().default(false),
  aliases: z.array(z.string().min(1).max(80)).max(10).default([]),
  notes: z.string().max(500).optional(),
});

export const patchBeingSchema = createBeingSchema.partial();

export const enrollSchema = z.object({
  /** object key of a clip already uploaded through /v1/audio/presign */
  objectKey: z.string().min(1).max(300),
});

export const relationSchema = z.object({
  beingA: z.uuid(),
  beingB: z.uuid(),
  type: z.enum(RELATION_TYPES),
  strength: z.number().min(0).max(1).default(1),
});

export const correctionSchema = z.object({
  beingId: z.uuid().optional(),
  aboutBeing: z.uuid().optional(),
  signal: z.enum(CORRECTION_SIGNALS),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export function problem(title: string, status: number, detail?: string): Record<string, unknown> {
  return { type: "about:blank", title, status, ...(detail !== undefined && { detail }) };
}

export function uuidParam(params: unknown): string | undefined {
  const parsed = z.uuid().safeParse((params as { id?: string }).id);
  return parsed.success ? parsed.data : undefined;
}
