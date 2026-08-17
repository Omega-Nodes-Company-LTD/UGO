import { z } from "zod";
import { EVENT_SOURCES, MESSAGE_CHANNELS } from "./constants.js";

/** REST contracts of soul-api (PROGETTO §5.7) — Zod at every boundary. */

export const chatRequestSchema = z.object({
  channel: z.enum(MESSAGE_CHANNELS),
  text: z.string().min(1).max(2000),
  beingId: z.uuid().optional(),
  /**
   * Gruppo 4 — input immagini: una foto insieme alla frase, JPEG in base64.
   * La guarda il modello vision LOCALE e al provider arriva solo la
   * DESCRIZIONE: i pixel non escono mai di casa e non si scrivono da nessuna
   * parte. Il tetto tiene un JPEG a 640px con margine.
   */
  imageBase64: z.string().max(200_000).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
  moodLabel: z.string(),
  memoriesUsed: z.array(z.uuid()),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const eventRequestSchema = z.object({
  source: z.enum(EVENT_SOURCES),
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type EventRequest = z.infer<typeof eventRequestSchema>;

export const memorySearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  k: z.coerce.number().int().min(1).max(50).default(6),
});
export type MemorySearchQuery = z.infer<typeof memorySearchQuerySchema>;
