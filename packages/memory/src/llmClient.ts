import { PRIME_GOSINO_ID, PRIME_ACCOUNT_ID, type DbClient } from "@ugo/db";
import { DEFAULT_LOCALE, identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";
import { throughGate, type CreditTerms, type GateRefusal, type KeySource } from "./gate.js";
import { computeCost, type PriceSnapshot, type TokenUsage } from "./pricing.js";
import { AnthropicAdapter } from "./providers/anthropic.js";
import { ProviderAuthError, type CompletionAdapter } from "./providers/types.js";
import { dailyBudgetUsd, piggyBankUsd, spentTodayUsd } from "./wallet.js";

/**
 * La conversazione, attraverso il cancello misurato (CLAUDE.md regola 3,
 * ADR-122). Il provider non è più fisso: è l'adapter che la casa ha scelto.
 *
 * Disciplina della cache (PROGETTO §5.5): i due blocchi [CACHED] — identità e
 * regole — sono SEMPRE i primi e marcati; il contenuto dinamico viene solo
 * dopo. Mai interpolare dati variabili nei blocchi cached.
 */

export const DEGRADED_REPLY =
  "Grunf... per oggi ho finito le parole, il salvadanaio dice basta. Torno domani.";

/**
 * La fame (ADR-072). Parole diverse dal tetto di casa apposta: quello è il
 * limite della famiglia, questa è la SUA pancia vuota.
 */
export const HUNGRY_REPLY =
  "Grunf... ho fame. Il mio salvadanaio è vuoto: dammi qualcosa e torno a parlare.";

/** ADR-122: la casa non ha ancora scelto con che testa farmi pensare. */
export const KEYLESS_REPLY =
  "Grunf... non ho ancora una testa per pensare: dammi una chiave in Impostazioni → AI e torno a parlare.";

/** ADR-122: la chiave c'era, ma il provider l'ha rifiutata. */
export const INVALID_KEY_REPLY =
  "Grunf... la chiave che mi avete dato non apre più niente: controllatela in Impostazioni → AI.";

/** ADR-130: le chiavi UGO a consumo e il credito finito. */
export const CREDIT_REPLY =
  "Grunf... ho finito le parole: il credito è a zero. Ricaricatelo e torno a chiacchierare.";

const REFUSAL_REPLY: Record<GateRefusal, string> = {
  budget: DEGRADED_REPLY,
  hungry: HUNGRY_REPLY,
  credit: CREDIT_REPLY,
};

// `ticket` (ADR-052): technical answers with repo context need more room
const MAX_TOKENS_BY_CHANNEL = { home: 200, meeting: 300, api: 200, ticket: 400 } as const;

export interface LlmHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmChatRequest {
  channel: keyof typeof MAX_TOKENS_BY_CHANNEL;
  /** blocks 3+4 of §5.5 (psyche + retrieved memories) — NOT cached */
  dynamicSystem?: string;
  /** block 5 — last N turns of the channel */
  history?: readonly LlmHistoryTurn[];
  /** block 6 — the user message */
  userText: string;
}

export interface LlmChatResult {
  text: string;
  degraded: boolean;
  usage?: TokenUsage;
  costUsd?: number;
}

/** Ciò che una conversazione chiede a un modello: una risposta. */
export interface ChatLlm {
  chat(request: LlmChatRequest, at?: Date): Promise<LlmChatResult>;
}

export interface LlmClientOptions {
  db: DbClient;
  /** l'adapter scelto dalla casa; senza, Anthropic con `apiKey`/`model` */
  adapter?: CompletionAdapter;
  apiKey?: string;
  model?: string;
  /** override for network-level test stubs */
  baseUrl?: string;
  /** fallback ceiling; a house that sets its own in `accounts` overrides it */
  dailyBudgetUsd: number;
  accountId?: string;
  gosinoId?: string;
  /** il fuso della CASA (ADR-050): decide il giorno della riga sul ledger */
  timezone?: string;
  /** la lingua della casa (ADR-050): sceglie i due blocchi cached */
  locale?: string;
  /** ADR-130: di chi è la chiave */
  keySource?: KeySource;
  credit?: CreditTerms;
  /** il prezzo fotografato alla scelta del modello (ADR-122) */
  priceSnapshot?: PriceSnapshot;
  /** il provider ha rifiutato la chiave: chi ha costruito il client la segna */
  onAuthFailure?: () => void;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export class LlmClient implements ChatLlm {
  private readonly adapter: CompletionAdapter;
  private readonly timezone: string;
  private readonly locale: string;
  private readonly accountId: string;
  private readonly gosinoId: string;

  public constructor(private readonly options: LlmClientOptions) {
    this.adapter =
      options.adapter ??
      new AnthropicAdapter({
        apiKey: options.apiKey ?? "",
        model: options.model ?? "claude-haiku-4-5",
        ...(options.baseUrl !== undefined && { baseUrl: options.baseUrl }),
      });
    this.timezone = options.timezone ?? "Europe/Rome";
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.accountId = options.accountId ?? PRIME_ACCOUNT_ID;
    this.gosinoId = options.gosinoId ?? PRIME_GOSINO_ID;
  }

  public spentTodayUsd(at: Date = new Date()): Promise<number> {
    return spentTodayUsd(this.options.db, this.accountId, this.timezone, at);
  }

  public piggyBankUsd(): Promise<number | undefined> {
    return piggyBankUsd(this.options.db, this.accountId, this.gosinoId);
  }

  public dailyBudgetUsd(): Promise<number> {
    return dailyBudgetUsd(this.options.db, this.accountId, this.options.dailyBudgetUsd);
  }

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    // ADR-052: at the reception the second cached block is the reception's
    // rules. Still a static per-locale file: two channels, two caches.
    const secondBlock =
      request.channel === "ticket" ? receptionPrompt(this.locale) : rulesPrompt(this.locale);
    const dynamic = request.dynamicSystem ?? "";
    const completion = {
      system: [
        { text: identityPrompt(this.locale), cache: true },
        { text: secondBlock, cache: true },
        ...(dynamic === "" ? [] : [{ text: dynamic, cache: false }]),
      ],
      messages: [...(request.history ?? []), { role: "user" as const, content: request.userText }],
      maxTokens: MAX_TOKENS_BY_CHANNEL[request.channel],
    };

    try {
      const outcome = await throughGate(
        {
          db: this.options.db,
          accountId: this.accountId,
          gosinoId: this.gosinoId,
          timezone: this.timezone,
          dailyBudgetUsd: this.options.dailyBudgetUsd,
          keySource: this.options.keySource ?? "byok",
          ...(this.options.credit !== undefined && { credit: this.options.credit }),
          ...(this.options.logger !== undefined && { logger: this.options.logger }),
        },
        async () => {
          const answer = await this.adapter.complete(completion);
          const usage = answer.usage ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          };
          return {
            value: answer.text,
            provider: this.adapter.provider,
            model: this.adapter.model,
            usage: answer.usage,
            cost: computeCost(this.adapter.model, usage, {
              ...(answer.providerCostUsd !== undefined && { providerUsd: answer.providerCostUsd }),
              ...(this.options.priceSnapshot !== undefined && {
                snapshot: this.options.priceSnapshot,
              }),
            }),
          };
        },
        at,
      );
      if (!outcome.ok) return { text: REFUSAL_REPLY[outcome.refusal], degraded: true };
      return {
        text: outcome.value,
        degraded: false,
        ...(outcome.usage !== undefined && { usage: outcome.usage }),
        costUsd: outcome.costUsd,
      };
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        this.options.onAuthFailure?.();
        return { text: INVALID_KEY_REPLY, degraded: true };
      }
      throw error;
    }
  }
}
