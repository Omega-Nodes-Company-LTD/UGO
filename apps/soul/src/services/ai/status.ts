import { accounts, type DbClient } from "@ugo/db";
import { creditBalanceMicros, dailyBudgetUsd, spentTodayUsd } from "@ugo/memory";
import { eq } from "drizzle-orm";
import { AI_ROLES, listChoices, type AiRole } from "./choices.js";
import { listKeys } from "./keyring.js";
import type { PlatformKeys } from "./resolver.js";

/**
 * Cosa vede il titolare in Impostazioni → AI: ruolo per ruolo se c'è una
 * testa e con che chiave, le chiavi (mai il valore), quanto ha speso oggi e
 * quanto credito UGO gli resta. Tutto da Postgres, niente stimato.
 */

export interface RoleStatus {
  role: AiRole;
  configured: boolean;
  /** la scelta c'è ma la chiave che la apre no (tolta, rifiutata) */
  missingKey: boolean;
  source: "byok" | "ugo" | null;
  provider: string | null;
  model: string | null;
  voice: string | null;
}

export async function aiStatus(
  db: DbClient,
  accountId: string,
  deps: { platform: PlatformKeys; dailyBudgetUsd: number },
): Promise<{
  ruoli: RoleStatus[];
  chiavi: Awaited<ReturnType<typeof listKeys>>;
  chiaviUgo: Record<keyof PlatformKeys, boolean>;
  oggi: { spesoUsd: number; tettoUsd: number };
  creditoMicros: number;
}> {
  const [choices, keys, [house]] = await Promise.all([
    listChoices(db, accountId),
    listKeys(db, accountId),
    db.select({ timezone: accounts.timezone }).from(accounts).where(eq(accounts.id, accountId)),
  ]);
  const timezone = house?.timezone ?? "Europe/Rome";
  const usable = new Set(keys.filter((k) => k.status !== "invalid").map((k) => k.provider));
  const byRole = new Map(choices.map((c) => [c.role, c]));
  const ruoli = AI_ROLES.map((role): RoleStatus => {
    const choice = byRole.get(role);
    if (choice === undefined) {
      return { role, configured: false, missingKey: false, source: null, provider: null, model: null, voice: null };
    }
    const keyed =
      choice.source === "ugo" ? deps.platform[choice.provider] !== undefined : usable.has(choice.provider);
    return {
      role,
      configured: keyed,
      missingKey: !keyed,
      source: choice.source,
      provider: choice.provider,
      model: choice.model,
      voice: choice.voice,
    };
  });
  const [speso, tetto, credito] = await Promise.all([
    spentTodayUsd(db, accountId, timezone),
    dailyBudgetUsd(db, accountId, deps.dailyBudgetUsd),
    creditBalanceMicros(db, accountId),
  ]);
  return {
    ruoli,
    chiavi: keys,
    chiaviUgo: {
      anthropic: deps.platform.anthropic !== undefined,
      openrouter: deps.platform.openrouter !== undefined,
      openai: deps.platform.openai !== undefined,
      elevenlabs: deps.platform.elevenlabs !== undefined,
    },
    oggi: { spesoUsd: speso, tettoUsd: tetto },
    creditoMicros: credito,
  };
}
