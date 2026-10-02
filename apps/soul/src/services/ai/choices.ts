import { modelChoices, type DbClient } from "@ugo/db";
import type { KeySource, Provider } from "@ugo/memory";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Un modello per ruolo (ADR-122). I ruoli di testo accettano solo provider di
 * testo; quelli di voce arriveranno con ADR-123.
 */

export const AI_ROLES = ["chat", "think", "vision", "judge", "tts", "stt"] as const;
export type AiRole = (typeof AI_ROLES)[number];
export const TEXT_ROLES = ["chat", "think", "vision", "judge"] as const;

export const ROLE_PROVIDERS: Record<AiRole, readonly Provider[]> = {
  chat: ["anthropic", "openrouter"],
  think: ["anthropic", "openrouter"],
  vision: ["anthropic", "openrouter"],
  judge: ["anthropic", "openrouter"],
  tts: ["openai", "elevenlabs", "openrouter"],
  stt: ["openai", "elevenlabs", "openrouter"],
};

export interface RoleChoice {
  role: AiRole;
  source: KeySource;
  provider: Provider;
  model: string;
  voice: string | null;
  priceInPerMTok: number | null;
  priceOutPerMTok: number | null;
}

export const choiceInputSchema = z.object({
  source: z.enum(["byok", "ugo"]).default("byok"),
  provider: z.enum(["anthropic", "openrouter", "openai", "elevenlabs"]),
  model: z.string().trim().min(1).max(200),
  voice: z.string().trim().min(1).max(200).optional(),
});
export type ChoiceInput = z.infer<typeof choiceInputSchema>;

const asNumber = (value: string | null): number | null => (value === null ? null : Number(value));

export async function listChoices(db: DbClient, accountId: string): Promise<RoleChoice[]> {
  const rows = await db.select().from(modelChoices).where(eq(modelChoices.accountId, accountId));
  return rows.map((r) => ({
    role: r.role as AiRole,
    source: r.source as KeySource,
    provider: r.provider as Provider,
    model: r.model,
    voice: r.voice,
    priceInPerMTok: asNumber(r.priceInPerMTok),
    priceOutPerMTok: asNumber(r.priceOutPerMTok),
  }));
}

export async function saveChoice(
  db: DbClient,
  accountId: string,
  role: AiRole,
  input: ChoiceInput,
  price: { inputPerMTok?: number | undefined; outputPerMTok?: number | undefined },
): Promise<void> {
  const values = {
    source: input.source,
    provider: input.provider,
    model: input.model,
    voice: input.voice ?? null,
    priceInPerMTok: price.inputPerMTok === undefined ? null : price.inputPerMTok.toFixed(6),
    priceOutPerMTok: price.outputPerMTok === undefined ? null : price.outputPerMTok.toFixed(6),
    updatedAt: new Date(),
  };
  await db
    .insert(modelChoices)
    .values({ accountId, role, ...values })
    .onConflictDoUpdate({ target: [modelChoices.accountId, modelChoices.role], set: values });
}

export async function removeChoice(db: DbClient, accountId: string, role: AiRole): Promise<boolean> {
  const gone = await db
    .delete(modelChoices)
    .where(and(eq(modelChoices.accountId, accountId), eq(modelChoices.role, role)))
    .returning({ id: modelChoices.id });
  return gone.length > 0;
}
