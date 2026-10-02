import type { DbClient } from "@ugo/db";
import {
  fitsRole,
  VOICE_MODELS,
  voicesFor,
  type CatalogModel,
  type ModelCatalog,
  type Provider,
  type ProviderBaseUrls,
  type TextRole,
  type VoiceOption,
} from "@ugo/memory";
import { z } from "zod";
import type { AuditEntry, AuditLogger } from "../auditLog.js";
import { AI_ROLES, ROLE_PROVIDERS, saveChoice, TEXT_ROLES, type AiRole, type choiceInputSchema } from "./choices.js";
import { listKeys, secrets } from "./keyring.js";
import type { PlatformKeys } from "./resolver.js";

/**
 * Le decisioni dietro Impostazioni → AI (ADR-122, ADR-123), separate dalle
 * rotte: la lista da cui si sceglie, e la scelta che si accetta solo se il
 * modello è in quella lista e la casa ha una chiave che lo apre.
 */

export interface SettingsDeps {
  catalog: ModelCatalog;
  masterKey: Buffer;
  platform: PlatformKeys;
  baseUrls: ProviderBaseUrls;
  audit?: AuditLogger | undefined;
}

export const catalogQuerySchema = z.object({
  provider: z.enum(["anthropic", "openrouter", "openai", "elevenlabs"]),
  ruolo: z.enum(AI_ROLES).default("chat"),
  fonte: z.enum(["byok", "ugo"]).default("byok"),
});

type CatalogQuery = z.infer<typeof catalogQuerySchema>;

const isTextRole = (role: AiRole): role is TextRole => (TEXT_ROLES as readonly string[]).includes(role);

/** Il ruolo vuole una capacità: la visione le immagini, la voce l'audio. */
function fits(model: CatalogModel, role: AiRole): boolean {
  if (role === "tts") return model.audioOut === true;
  if (role === "stt") return model.audioIn === true;
  return fitsRole(model, role);
}

/** La chiave con cui leggere un elenco: della casa, o di piattaforma. */
async function keyFor(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  provider: Provider,
  source: "byok" | "ugo",
): Promise<string | undefined> {
  if (source === "ugo") return deps.platform[provider];
  return (await secrets(db, accountId, deps.masterKey)).get(provider);
}

export async function modelsFor(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  query: CatalogQuery,
): Promise<CatalogModel[] | "nokey" | "unreachable"> {
  if (!ROLE_PROVIDERS[query.ruolo].includes(query.provider)) return [];
  try {
    if (query.provider === "openrouter") {
      return (await deps.catalog.openRouter()).filter((m) => fits(m, query.ruolo));
    }
    if (query.ruolo === "tts" || query.ruolo === "stt") {
      return VOICE_MODELS[query.ruolo]
        .filter((m) => m.provider === query.provider)
        .map((m) => ({ provider: m.provider, id: m.id, label: m.label, vision: false }));
    }
    const key = await keyFor(db, accountId, deps, "anthropic", query.fonte);
    if (key === undefined) return "nokey";
    const listed = await deps.catalog.anthropic(key, query.fonte === "ugo" ? "platform" : accountId);
    return listed.filter((m) => fits(m, query.ruolo));
  } catch {
    return "unreachable";
  }
}

/** Le voci di un provider: ElevenLabs le legge dall'account di chi ha la chiave. */
export async function voicesOf(
  db: DbClient,
  accountId: string,
  deps: SettingsDeps,
  provider: Provider,
  source: "byok" | "ugo",
): Promise<VoiceOption[] | "unreachable"> {
  if (provider === "anthropic") return [];
  try {
    const key = await keyFor(db, accountId, deps, provider, source);
    return await voicesFor(provider, key, deps.baseUrls[provider]);
  } catch {
    return "unreachable";
  }
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
  const listed = await modelsFor(db, accountId, deps, { provider, ruolo: role, fonte: input.source });
  if (typeof listed === "string") return "non riesco a leggere la lista dei modelli";
  const model = listed.find((m) => m.id === input.model);
  if (model === undefined) return "il modello non è nella lista del provider";
  if (isTextRole(role) && !fitsRole(model, role)) return "il modello non vede le immagini";
  if (role === "tts") {
    const voices = await voicesOf(db, accountId, deps, provider, input.source);
    if (voices === "unreachable") return "non riesco a leggere le voci";
    if (input.voice === undefined || !voices.some((v) => v.id === input.voice)) {
      return "scegli una delle voci del provider";
    }
  }
  await saveChoice(db, accountId, role, input, {
    inputPerMTok: model.inputPerMTok,
    outputPerMTok: model.outputPerMTok,
  });
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
