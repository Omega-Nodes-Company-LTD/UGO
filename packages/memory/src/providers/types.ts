import type { TokenUsage } from "../pricing.js";

/**
 * La forma comune di una chiamata a un modello di testo (ADR-122).
 *
 * Gli adapter traducono questa forma in quella del provider e indietro. Non
 * sanno niente di tetti, crediti o ledger: quella è la parte del cancello
 * (`gate.ts`), ed è il motivo per cui un adapter da solo non si istanzia
 * fuori da questo package (CLAUDE.md regola 3).
 */

export type TextProvider = "anthropic" | "openrouter";
export type Provider = TextProvider | "openai" | "elevenlabs";

export const PROVIDERS: readonly Provider[] = ["anthropic", "openrouter", "openai", "elevenlabs"];

/** Un blocco di sistema. `cache` = regola 2: solo i blocchi statici, solo in testa. */
export interface SystemBlock {
  text: string;
  cache: boolean;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export interface CompletionMessage {
  role: "user" | "assistant";
  content: string | ContentPart[];
}

export interface CompletionRequest {
  system: SystemBlock[];
  messages: CompletionMessage[];
  /** il tetto di ciò che si vuole SENTIRE: l'adapter lo allarga se il modello pensa */
  maxTokens: number;
  temperature?: number;
}

export interface Completion {
  text: string;
  /** undefined = la risposta è arrivata (ed è pagata) ma il conteggio non si legge */
  usage: TokenUsage | undefined;
  /** quanto è costata secondo il provider, quando lo dice */
  providerCostUsd?: number;
}

export interface CompletionAdapter {
  readonly provider: TextProvider;
  readonly model: string;
  /**
   * Lancia SOLO prima che la chiamata sia pagata (rete, stato non-2xx).
   * Dopo una risposta 2xx restituisce sempre, anche se la forma è strana:
   * la spesa va segnata comunque.
   */
  complete(request: CompletionRequest): Promise<Completion>;
}

/** 401/403: la chiave non vale. Il chiamante la segna `invalid` e non riprova. */
export class ProviderAuthError extends Error {
  public constructor(public readonly provider: Provider) {
    super(`provider ${provider} rejected the key`);
    this.name = "ProviderAuthError";
  }
}

/** Qualunque altro rifiuto prima del pagamento: solo lo stato, mai il corpo. */
export class ProviderError extends Error {
  public constructor(
    public readonly provider: Provider,
    public readonly status: number,
  ) {
    super(`provider ${provider} error (status ${String(status)})`);
    this.name = "ProviderError";
  }
}

export function failFor(provider: Provider, status: number): Error {
  return status === 401 || status === 403
    ? new ProviderAuthError(provider)
    : new ProviderError(provider, status);
}
