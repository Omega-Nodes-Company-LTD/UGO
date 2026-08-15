import {
  budgetLedger,
  households,
  PRIME_GOSINO_ID,
  PRIME_HOUSEHOLD_ID,
  type DbClient,
} from "@ugo/db";
import { DEFAULT_LOCALE, identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";
import { and, eq, sql } from "drizzle-orm";
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

export interface LlmClientOptions {
  db: DbClient;
  apiKey: string;
  model: string;
  /** fallback ceiling; a house that sets its own in `households` overrides it */
  dailyBudgetUsd: number;
  /** whose piggy bank this is (ADR-019); defaults to the first house */
  householdId?: string;
  /** which exemplar spent it — a house may hold more than one */
  gosinoId?: string;
  /** override for network-level test stubs and future proxies */
  baseUrl?: string;
  /**
   * Il fuso della CASA (ADR-050), non del server.
   *
   * Decide il confine del giorno del `budget_ledger`, ed e' il punto in cui una
   * svista non produce un errore ma un addebito nel giorno sbagliato — la
   * famiglia di difetti peggiore (ADR-035 §3), quella che risponde qualcosa di
   * plausibile senza sollevare. Due famiglie in fusi diversi resettavano il
   * salvadanaio all'ora del server.
   */
  timezone?: string;
  /** La lingua della casa (ADR-050): sceglie i due blocchi cached, N per N. */
  locale?: string;
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
  private readonly locale: string;
  private readonly householdId: string;
  private readonly gosinoId: string;

  public constructor(private readonly options: LlmClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.timezone = options.timezone ?? "Europe/Rome";
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.householdId = options.householdId ?? PRIME_HOUSEHOLD_ID;
    this.gosinoId = options.gosinoId ?? PRIME_GOSINO_ID;
  }

  /**
   * Sum of THIS house's ledger today — always computed server-side, never
   * estimated. Scoped by household (ADR-019): before that, one family's
   * conversation drained the other's day.
   */
  public async spentTodayUsd(at: Date = new Date()): Promise<number> {
    const today = localDate(this.timezone, at);
    const rows = await this.options.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(and(eq(budgetLedger.householdId, this.householdId), eq(budgetLedger.date, today)));
    return Number(rows[0]?.total ?? 0);
  }

  /** The house's own ceiling when it has one, the process default otherwise. */
  public async dailyBudgetUsd(): Promise<number> {
    const [row] = await this.options.db
      .select({ limit: households.dailyBudgetUsd })
      .from(households)
      .where(eq(households.id, this.householdId));
    const own = row?.limit;
    return own === null || own === undefined ? this.options.dailyBudgetUsd : Number(own);
  }

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    const [spent, budgetUsd] = await Promise.all([this.spentTodayUsd(at), this.dailyBudgetUsd()]);
    if (spent >= budgetUsd) {
      this.options.logger?.warn(
        { spentUsd: spent, budgetUsd, householdId: this.householdId },
        "daily LLM budget exceeded: declared degradation",
      );
      return { text: DEGRADED_REPLY, degraded: true };
    }

    // ADR-052: at the reception the second cached block is the reception's
    // rules, not the house's. Still a static per-locale file — the cache
    // discipline of rule 2 holds: two channels, two caches, zero interpolation.
    const secondBlock =
      request.channel === "ticket" ? receptionPrompt(this.locale) : rulesPrompt(this.locale);
    const body = {
      model: this.options.model,
      max_tokens: MAX_TOKENS_BY_CHANNEL[request.channel],
      system: [
        {
          type: "text",
          text: identityPrompt(this.locale),
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: secondBlock, cache_control: { type: "ephemeral" } },
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
      householdId: this.householdId,
      gosinoId: this.gosinoId,
      date: localDate(this.timezone, at),
      provider: "anthropic",
      model: this.options.model,
      tokensIn: usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
      tokensCacheWrite: usage.cacheCreationInputTokens,
      tokensCacheRead: usage.cacheReadInputTokens,
      tokensOut: usage.outputTokens,
      costUsd: costUsd.toFixed(6),
    });

    return { text, degraded: false, usage, costUsd };
  }
}
