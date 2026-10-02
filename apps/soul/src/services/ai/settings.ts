import type { DbClient } from "@ugo/db";
import {
  fitsRole,
  type CatalogModel,
  type ModelCatalog,
  type Provider,
  type TextRole,
} from "@ugo/memory";
import { z } from "zod";
import type { AuditEntry, AuditLogger } from "../auditLog.js";
import { saveChoice, TEXT_ROLES, type AiRole, type choiceInputSchema } from "./choices.js";
import { listKeys, secrets } from "./keyring.js";
import type { PlatformKeys } from "./resolver.js";

/**
 * Le decisioni dietro Impostazioni → AI (ADR-122), separate dalle rotte: la
 * lista da cui si sceglie, e la scelta che si accetta solo se il modello è in
 * quella lista e la casa ha una chiave che lo apre.
 */

export interface SettingsDeps {
  catalog: ModelCatalog;
  masterKey: Buffer;
  platform: PlatformKeys;
  audit?: AuditLogger | undefined;
}

export const catalogQuerySchema = z.object({
  provider: z.enum(["anthropic", "openrouter"]),
  ruolo: z.enum(TEXT_ROLES).default("chat"),
  fonte: z.enum(["byok", "ugo"]).default("byok"),
});

type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export async function modelsFor(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  query: CatalogQuery,
): Promise<CatalogModel[] | "nokey" | "unreachable"> {
  try {
    if (query.provider === "openrouter") return await deps.catalog.openRouter();
    const key = await keyForCatalog(db, accountId, deps, query.fonte);
    if (key === undefined) return "nokey";
    return await deps.catalog.anthropic(key, query.fonte === "ugo" ? "platform" : accountId);
  } catch {
    return "unreachable";
  }
}

async function keyForCatalog(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  source: "byok" | "ugo",
): Promise<string | undefined> {
  if (source === "ugo") return deps.platform.anthropic;
  return (await secrets(db, accountId, deps.masterKey)).get("anthropic");
}

export async function choose(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  role: AiRole,
  input: z.infer<typeof choiceInputSchema>,
  actor: AuditEntry["actor"],
): Promise<{ accountId: string } | string> {
  const provider: Provider = input.provider;
  if (input.source === "ugo" && deps.platform[provider] === undefined) {
    return `le chiavi UGO non coprono ${provider}`;
  }
  if (input.source === "byok") {
    const keys = await listKeys(db, accountId);
    if (!keys.some((k) => k.provider === provider && k.status !== "invalid")) {
      return `manca una chiave ${provider} valida`;
    }
  }
  let price: { inputPerMTok?: number | undefined; outputPerMTok?: number | undefined } = {};
  if ((TEXT_ROLES as readonly string[]).includes(role)) {
    if (provider !== "anthropic" && provider !== "openrouter") return "provider non di testo";
    const listed = await modelsFor(db, accountId, deps, {
      provider,
      ruolo: role as TextRole,
      fonte: input.source,
    });
    if (typeof listed === "string") return "non riesco a leggere la lista dei modelli";
    const model = listed.find((m) => m.id === input.model);
    if (model === undefined) return "il modello non è nella lista del provider";
    if (!fitsRole(model, role as TextRole)) return "il modello non vede le immagini";
    price = { inputPerMTok: model.inputPerMTok, outputPerMTok: model.outputPerMTok };
  }
  await saveChoice(db, accountId, role, input, price);
  await deps.audit?.record(
    {
      verb: "model_choice_set",
      outcome: "ok",
      accountId,
      actor,
      resourceType: "model_choice",
      resourceId: `${role}:${provider}`,
    },
    db,
  );
  return { accountId };
}
