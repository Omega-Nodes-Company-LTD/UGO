import {
  budgetLedger,
  feedings,
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

/**
 * La fame (ADR-072). Parole diverse dal tetto di casa apposta: sono due cose
 * diverse — quello è il limite della famiglia, questa è la SUA pancia vuota —
 * e dirle uguali sarebbe una bugia. Non è un guasto: gli si dà da mangiare.
 */
export const HUNGRY_REPLY =
  "Grunf... ho fame. Il mio salvadanaio è vuoto: dammi qualcosa e torno a parlare.";

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

/**
 * Il conteggio, da solo: si legge PRIMA e indipendentemente dal resto, perché
 * la spesa va segnata anche quando la forma del resto è cambiata sotto i piedi.
 */
const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

const messagesResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: usageSchema,
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
  /**
   * La coda del salvadanaio (regola 3).
   *
   * Il controllo del tetto e la scrittura sul registro stavano ai due capi di
   * una chiamata di rete: N richieste concorrenti leggevano tutte lo stesso
   * `spent`, passavano tutte, e il tetto smetteva di essere un tetto senza
   * dirlo. Qui la sequenza «guarda quanto s'è speso → chiama → segna» diventa
   * indivisibile, una richiesta per volta per ogni casa.
   *
   * Costa la concorrenza fra due turni della stessa famiglia, ed è un prezzo
   * che si paga volentieri: `UGO_DAILY_BUDGET_USD` è un vincolo dichiarato, e
   * un vincolo che si può scavalcare correndo non è un vincolo. Resta di
   * processo, come l'istanza: due soul sullo stesso database si
   * ri-sovrapporrebbero, e allora il posto giusto sarebbe il database.
   */
  private queue: Promise<unknown> = Promise.resolve();

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

  /**
   * Il saldo del salvadanaio DI QUESTO esemplare (ADR-072): quanto gli è stato
   * dato meno quanto ha consumato, da sempre. Un saldo e non una razione: il
   * lavoro di ieri paga le parole di oggi.
   *
   * `undefined` quando la casa non ha il metabolismo acceso — e allora vale
   * solo il tetto di famiglia, esattamente come prima di questo ADR.
   */
  public async piggyBankUsd(): Promise<number | undefined> {
    const [house] = await this.options.db
      .select({ on: households.metabolism })
      .from(households)
      .where(eq(households.id, this.householdId));
    if (house?.on !== true) return undefined;

    const [fed] = await this.options.db
      .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
      .from(feedings)
      .where(eq(feedings.gosinoId, this.gosinoId));
    const [eaten] = await this.options.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(eq(budgetLedger.gosinoId, this.gosinoId));
    return Number(fed?.total ?? 0) - Number(eaten?.total ?? 0);
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

  /**
   * Accoda: la prossima chiamata comincia quando la precedente ha finito di
   * segnare la spesa, comprese le chiamate finite male.
   */
  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    const mine = this.queue.then(
      () => this.chatSerialized(request, at),
      () => this.chatSerialized(request, at),
    );
    // la coda non deve mai restare "rifiutata", o inghiottirebbe le successive
    this.queue = mine.catch(() => undefined);
    return mine;
  }

  private async chatSerialized(request: LlmChatRequest, at: Date): Promise<LlmChatResult> {
    const [spent, budgetUsd] = await Promise.all([this.spentTodayUsd(at), this.dailyBudgetUsd()]);
    if (spent >= budgetUsd) {
      this.options.logger?.warn(
        { spentUsd: spent, budgetUsd, householdId: this.householdId },
        "daily LLM budget exceeded: declared degradation",
      );
      return { text: DEGRADED_REPLY, degraded: true };
    }

    /**
     * ADR-072: il muro di famiglia è passato, resta la sua pancia. Il controllo
     * sta DENTRO la stessa coda del tetto, o due turni concorrenti mangerebbero
     * lo stesso pasto — la lezione già pagata sul TOCTOU del budget guard.
     */
    const piggyBank = await this.piggyBankUsd();
    if (piggyBank !== undefined && piggyBank <= 0) {
      this.options.logger?.warn(
        { piggyBankUsd: piggyBank, householdId: this.householdId, gosinoId: this.gosinoId },
        "empty piggy bank: the exemplar is hungry",
      );
      return { text: HUNGRY_REPLY, degraded: true };
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

    // Da qui in giù la chiamata è GIÀ STATA PAGATA, e il registro va scritto
    // qualunque cosa succeda alla forma della risposta. Prima si faceva
    // `schema.parse(...)` e si segnava dopo: bastava che il provider
    // aggiungesse un blocco inatteso perché ogni turno costasse senza lasciare
    // una riga, e `UGO_DAILY_BUDGET_USD` smettesse di limitare in silenzio —
    // esattamente il guasto che il salvadanaio esiste per impedire.
    const payload: unknown = await response.json();
    const counted = usageSchema.safeParse((payload as { usage?: unknown } | null)?.usage);
    const usage: TokenUsage = {
      inputTokens: counted.success ? counted.data.input_tokens : 0,
      outputTokens: counted.success ? counted.data.output_tokens : 0,
      cacheCreationInputTokens: counted.success ? (counted.data.cache_creation_input_tokens ?? 0) : 0,
      cacheReadInputTokens: counted.success ? (counted.data.cache_read_input_tokens ?? 0) : 0,
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
    if (!counted.success) {
      // segnata a zero e dichiarata: una riga a costo zero è una bugia più
      // piccola di nessuna riga, e questo log è il solo modo di accorgersene
      this.options.logger?.warn(
        { householdId: this.householdId, model: this.options.model },
        "provider usage unreadable: ledger row written with zero tokens",
      );
    }

    const parsed = messagesResponseSchema.parse(payload);
    const text = parsed.content.find((block) => block.type === "text")?.text ?? "";

    return { text, degraded: false, usage, costUsd };
  }
}
