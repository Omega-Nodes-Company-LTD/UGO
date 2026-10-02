import type { DbClient } from "@ugo/db";
import { anthropicModel, type Provider } from "@ugo/memory";
import { saveChoice, type AiRole } from "./choices.js";
import { saveKey } from "./keyring.js";

/**
 * ADR-122, il traghetto: l'installazione di prima aveva le chiavi nell'env
 * del processo, valide per tutti. `ugo chiavi importa-da-env` le porta
 * nell'account indicato — cifrate con la sua DEK — e sceglie per lui i ruoli
 * di testo, così il giorno dopo l'aggiornamento UGO parla ancora.
 *
 * Le chiavi si salvano `unverified`: la riga di comando può girare dove la
 * rete verso il provider non c'è, e una chiave non provata non è una chiave
 * rifiutata. La prima chiamata vera dirà com'è.
 */

const ENV_KEYS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
};

const TEXT_ROLES: readonly AiRole[] = ["chat", "think", "vision", "judge"];

export interface ImportReport {
  keys: Provider[];
  roles: AiRole[];
}

export async function importKeysFromEnv(
  db: DbClient,
  accountId: string,
  masterKey: Buffer,
  source: Record<string, string | undefined>,
  model = "claude-haiku-4-5",
): Promise<ImportReport> {
  const keys: Provider[] = [];
  for (const [provider, name] of Object.entries(ENV_KEYS) as [Provider, string][]) {
    const secret = source[name];
    if (secret === undefined || secret.trim() === "") continue;
    await saveKey(db, accountId, masterKey, { provider, secret, status: "unverified" });
    keys.push(provider);
  }
  const roles: AiRole[] = [];
  const listed = anthropicModel(model);
  if (keys.includes("anthropic") && listed !== undefined) {
    for (const role of TEXT_ROLES) {
      await saveChoice(
        db,
        accountId,
        role,
        { source: "byok", provider: "anthropic", model },
        { inputPerMTok: listed.inputPerMTok, outputPerMTok: listed.outputPerMTok },
      );
      roles.push(role);
    }
  }
  return { keys, roles };
}
