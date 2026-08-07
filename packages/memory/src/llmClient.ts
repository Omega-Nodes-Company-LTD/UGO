import { budgetLedger, type DbClient } from "@ugo/db";
import { identityPrompt, rulesPrompt } from "@ugo/prompts";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { computeCostUsd, type TokenUsage } from "./pricing.js";

/**
 * THE budget-guard chokepoint (CLAUDE.md rule 3): every LLM provider call in
 * the whole system goes through this class, records itself on budget_ledger
 * and respects UGO_DAILY_BUDGET_USD. Instantiating a provider client anywhere
 * else in the repository is forbidden.
 *
 * Prompt-cache discipline (PROGETTO §5.5): the two [CACHED] blocks (identity,
 * rules) are ALWAYS first and marked cache_control; dynamic content only ever
 * comes after them. Never interpolate variable data into the cached blocks.
 */

export const DEGRADED_REPLY =
  "Grunf... per oggi ho finito le parole, il salvadanaio dice basta. Torno domani.";

const MAX_TOKENS_BY_CHANNEL = { home: 200, meeting: 300, api: 200 } as const;

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

export interface LlmClientOptions {
  db: DbClient;
  apiKey: string;
  model: string;
  dailyBudgetUsd: number;
  /** override for network-level test stubs and future proxies */
  baseUrl?: string;
  /** ledger day boundary timezone (default Europe/Rome) */
  timezone?: string;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

const messagesResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
  }),
});

function localDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export class LlmClient {
  private readonly baseUrl: string;
  private readonly timezone: string;

  public constructor(private readonly options: LlmClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.timezone = options.timezone ?? "Europe/Rome";
  }

  /** Sum of today's ledger — always computed server-side, never estimated. */
  public async spentTodayUsd(at: Date = new Date()): Promise<number> {
    const today = localDate(this.timezone, at);
    const rows = await this.options.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(eq(budgetLedger.date, today));
    return Number(rows[0]?.total ?? 0);
  }

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    const spent = await this.spentTodayUsd(at);
    if (spent >= this.options.dailyBudgetUsd) {
      this.options.logger?.warn(
        { spentUsd: spent, budgetUsd: this.options.dailyBudgetUsd },
        "daily LLM budget exceeded: declared degradation",
      );
      return { text: DEGRADED_REPLY, degraded: true };
    }

    const body = {
      model: this.options.model,
      max_tokens: MAX_TOKENS_BY_CHANNEL[request.channel],
      system: [
        { type: "text", text: identityPrompt(), cache_control: { type: "ephemeral" } },
        { type: "text", text: rulesPrompt(), cache_control: { type: "ephemeral" } },
        ...(request.dynamicSystem !== undefined && request.dynamicSystem !== ""
          ? [{ type: "text", text: request.dynamicSystem }]
          : []),
      ],
      messages: [
        ...(request.history ?? []),
        { role: "user" as const, content: request.userText },
      ],
    };

    const response = await fetch(new URL("/v1/messages", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.options.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      // status only: never log/propagate bodies that could echo prompt content
      throw new Error(`LLM provider error (status ${String(response.status)})`);
    }

    const parsed = messagesResponseSchema.parse(await response.json());
    const text = parsed.content.find((block) => block.type === "text")?.text ?? "";
    const usage: TokenUsage = {
      inputTokens: parsed.usage.input_tokens,
      outputTokens: parsed.usage.output_tokens,
      cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: parsed.usage.cache_read_input_tokens ?? 0,
    };
    const costUsd = computeCostUsd(this.options.model, usage);

    await this.options.db.insert(budgetLedger).values({
      date: localDate(this.timezone, at),
      provider: "anthropic",
      model: this.options.model,
      tokensIn: usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
      tokensOut: usage.outputTokens,
      costUsd: costUsd.toFixed(6),
    });

    return { text, degraded: false, usage, costUsd };
  }
}
