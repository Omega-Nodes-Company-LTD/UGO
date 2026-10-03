import { throughGate, type CreditTerms, type KeySource } from "../gate.js";
import type { Cost } from "../pricing.js";
import { ProviderAuthError } from "../providers/types.js";
import type { DbClient } from "@ugo/db";
import { speechCostUsd, transcribeCostUsd } from "./pricing.js";
import type { Speech, SpeechAdapter, TranscribeAdapter } from "./types.js";
import { wavSeconds } from "./wav.js";

/**
 * La voce dal cancello (CLAUDE.md regola 3, ADR-123): stessa coda per
 * account, stesso tetto, stesso credito, stessa riga di ledger del testo.
 * Non lancia mai: `undefined`/`down` e il muso torna alla voce del browser,
 * che sa già fare.
 */

export interface VoiceGateOptions {
  db: DbClient;
  accountId: string;
  gosinoId: string;
  timezone: string;
  dailyBudgetUsd: number;
  keySource: KeySource;
  credit?: CreditTerms;
  /** ADR-130: dopo un addebito sul credito (la ricarica automatica) */
  onCreditDebited?: (accountId: string) => void;
  onAuthFailure?: () => void;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export type HeardOutcome = { kind: "text"; text: string } | { kind: "unusable" } | { kind: "down" };

function context(options: VoiceGateOptions): Parameters<typeof throughGate>[0] {
  return {
    db: options.db,
    accountId: options.accountId,
    gosinoId: options.gosinoId,
    timezone: options.timezone,
    dailyBudgetUsd: options.dailyBudgetUsd,
    keySource: options.keySource,
    ...(options.credit !== undefined && { credit: options.credit }),
        ...(options.onCreditDebited !== undefined && { onCreditDebited: options.onCreditDebited }),
    ...(options.logger !== undefined && { logger: options.logger }),
  };
}

function cost(providerUsd: number | undefined, estimate: { usd: number; known: boolean }): Cost {
  if (providerUsd !== undefined) return { usd: providerUsd, source: "provider" };
  return { usd: estimate.usd, source: estimate.known ? "list" : "fallback" };
}

/** Quante unità ha consumato: caratteri per la sintesi, secondi per l'ascolto. */
const usageOf = (units: number) => ({
  inputTokens: Math.round(units),
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
});

function failed(options: VoiceGateOptions, error: unknown, provider: string): void {
  if (error instanceof ProviderAuthError) options.onAuthFailure?.();
  options.logger?.warn(
    { accountId: options.accountId, provider, kind: error instanceof Error ? error.name : "unknown" },
    "voice provider failed: the face falls back to the browser",
  );
}

export async function gatedSpeech(
  options: VoiceGateOptions,
  adapter: SpeechAdapter,
  text: string,
  voice: { voice: string; instructions?: string },
): Promise<Speech | undefined> {
  try {
    const outcome = await throughGate(context(options), async () => {
      const speech = await adapter.synth(text, voice);
      return {
        value: speech,
        provider: adapter.provider,
        model: adapter.model,
        usage: usageOf(text.length),
        cost: cost(speech.providerCostUsd, speechCostUsd(adapter.provider, adapter.model, text.length)),
      };
    });
    return outcome.ok && outcome.value.audio.length > 44 ? outcome.value : undefined;
  } catch (error) {
    failed(options, error, adapter.provider);
    return undefined;
  }
}

export async function gatedTranscript(
  options: VoiceGateOptions,
  adapter: TranscribeAdapter,
  wav: Buffer,
): Promise<HeardOutcome> {
  const seconds = wavSeconds(wav);
  // sotto il mezzo secondo non c'è una parola: non si paga per sentirlo dire
  if (seconds < 0.5) return { kind: "unusable" };
  try {
    const outcome = await throughGate(context(options), async () => {
      const heard = await adapter.transcribe(wav);
      return {
        value: heard,
        provider: adapter.provider,
        model: adapter.model,
        usage: usageOf(seconds),
        cost: cost(heard.providerCostUsd, transcribeCostUsd(adapter.provider, adapter.model, seconds)),
      };
    });
    if (!outcome.ok) return { kind: "down" };
    return outcome.value.text === "" ? { kind: "unusable" } : { kind: "text", text: outcome.value.text };
  } catch (error) {
    failed(options, error, adapter.provider);
    return { kind: "down" };
  }
}
