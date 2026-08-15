import { z } from "zod";
import { TICKET_STATUSES } from "./constants.js";

/**
 * The reception's REST contract (ADR-051/052) — the junction between
 * `apps/reception` and soul's `/v1/reception/*`. Both sides import THIS file:
 * the two of them can stay green separately while the seam breaks (the
 * ADR-045 lesson), so integration tests exercise these schemas end to end.
 */

export const receptionChatRequestSchema = z.object({
  gosinoId: z.uuid(),
  text: z.string().min(1).max(2000),
});
export type ReceptionChatRequest = z.infer<typeof receptionChatRequestSchema>;

export const receptionChatResponseSchema = z.object({
  reply: z.string(),
  /** true when a quota or budget wall answered instead of the provider */
  degraded: z.boolean(),
  /** true when the reply came from the answer cache (ADR-055): zero cost */
  cached: z.boolean(),
});
export type ReceptionChatResponse = z.infer<typeof receptionChatResponseSchema>;

export const receptionTicketCreateSchema = z.object({
  gosinoId: z.uuid(),
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(4000),
});
export type ReceptionTicketCreate = z.infer<typeof receptionTicketCreateSchema>;

export const receptionTicketReplySchema = z.object({
  text: z.string().min(1).max(4000),
});
export type ReceptionTicketReply = z.infer<typeof receptionTicketReplySchema>;

export const receptionTicketSchema = z.object({
  id: z.uuid(),
  gosinoId: z.uuid(),
  status: z.enum(TICKET_STATUSES),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReceptionTicket = z.infer<typeof receptionTicketSchema>;

export const receptionGosinoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** 'cucina', 'officina' — where the exemplar lives, flavour for the picker */
  locationLabel: z.string().nullable(),
});
export type ReceptionGosino = z.infer<typeof receptionGosinoSchema>;

export const receptionMeSchema = z.object({
  customer: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  gosini: z.array(receptionGosinoSchema),
});
export type ReceptionMe = z.infer<typeof receptionMeSchema>;
