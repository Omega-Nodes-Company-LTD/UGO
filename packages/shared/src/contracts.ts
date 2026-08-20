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
  /**
   * ADR-110 (corretto): chi il corpo **vede** adesso, non chi sta parlando.
   *
   * Il volto risponde a «chi c'è», la voce a «chi parla»: sono due domande
   * diverse, e `beingId` resta riservato alla seconda. Con un solo volto in
   * stanza non segue che sia lui ad aver parlato — basta qualcuno fuori
   * inquadratura — e una frase attribuita a chi non l'ha detta finisce in
   * biografia col suo nome sopra, per sempre.
   *
   * Il tetto è una stanza, non una folla.
   */
  presentBeingIds: z.array(z.uuid()).max(8).optional(),
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
