import type { Provider } from "./types.js";

/**
 * Una chiave si prova prima di salvarla (ADR-122): una chiamata gratuita di
 * sola lettura al provider. `invalid` = il provider l'ha rifiutata;
 * `unreachable` = non si è potuto chiedere, e la chiave si salva come
 * `unverified` invece di essere rifiutata per colpa della rete.
 */

export type KeyVerdict = "ok" | "invalid" | "unreachable";

export interface ProviderBaseUrls {
  anthropic?: string;
  openrouter?: string;
  openai?: string;
  elevenlabs?: string;
}

const DEFAULTS: Required<ProviderBaseUrls> = {
  anthropic: "https://api.anthropic.com",
  openrouter: "https://openrouter.ai",
  openai: "https://api.openai.com",
  elevenlabs: "https://api.elevenlabs.io",
};

function probe(provider: Provider, key: string): { path: string; headers: Record<string, string> } {
  switch (provider) {
    case "anthropic":
      return { path: "/v1/models?limit=1", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "openrouter":
      return { path: "/api/v1/key", headers: { authorization: `Bearer ${key}` } };
    case "openai":
      return { path: "/v1/models", headers: { authorization: `Bearer ${key}` } };
    case "elevenlabs":
      return { path: "/v1/user", headers: { "xi-api-key": key } };
  }
}

export async function verifyKey(
  provider: Provider,
  key: string,
  baseUrls: ProviderBaseUrls = {},
): Promise<KeyVerdict> {
  const { path, headers } = probe(provider, key);
  try {
    const response = await fetch(new URL(path, baseUrls[provider] ?? DEFAULTS[provider]), {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return "ok";
    if (response.status === 401 || response.status === 403) return "invalid";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}
