import {
  AnthropicAdapter,
  OpenRouterAdapter,
  type CompletionAdapter,
  type ProviderBaseUrls,
} from "@ugo/memory";
import type { RoleChoice } from "./choices.js";

/**
 * Dalla scelta della casa all'adapter del provider (ADR-122). Gli URL base
 * sono di PROCESSO (env, stub nei test), mai della casa: un URL scelto da un
 * utente sarebbe una porta per far chiamare a soul qualunque indirizzo (SSRF).
 */
export function textAdapter(
  choice: RoleChoice,
  apiKey: string,
  baseUrls: ProviderBaseUrls,
  referer?: string,
): CompletionAdapter | undefined {
  if (choice.provider === "anthropic") {
    return new AnthropicAdapter({
      apiKey,
      model: choice.model,
      ...(baseUrls.anthropic !== undefined && { baseUrl: baseUrls.anthropic }),
    });
  }
  if (choice.provider === "openrouter") {
    return new OpenRouterAdapter({
      apiKey,
      model: choice.model,
      ...(baseUrls.openrouter !== undefined && { baseUrl: baseUrls.openrouter }),
      ...(referer !== undefined && { referer }),
    });
  }
  return undefined;
}
