import {
  budgetLedger,
  feedings,
  accounts,
  PRIME_GOSINO_ID,
  PRIME_ACCOUNT_ID,
  type DbClient,
} from "@ugo/db";
import { DEFAULT_LOCALE } from "@ugo/prompts";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  chatCompletionBody,
  DEFAULT_PROVIDERS,
  OPENROUTER_URL,
  type ChatChannel,
  type ChatTurn,
} from "./chatRequest.js";
import type { TokenUsage } from "./pricing.js";

/**
 * THE budget-guard chokepoint (CLAUDE.md rule 3): every paid chat call in the
 * whole system goes through this class, records itself on budget_ledger and
 * respects UGO_DAILY_BUDGET_USD. Instantiating a provider client anywhere
 * else in the repository is forbidden.
 *
 * ADR-125: the provider is OpenRouter, and only OpenRouter. The shape of the
 * request — and with it the prompt-cache order of §5.5 — lives in
 * `chatRequest.ts`, a pure function with its own unit tests.
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

export type LlmHistoryTurn = ChatTurn;

export interface LlmChatRequest {
  channel: ChatChannel;
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

/**
 * Ciò che una conversazione chiede a un modello: una risposta. ADR-094 mette
 * due implementazioni dietro questa porta — il provider col budget guard, e
 * la voce di casa che gli parla davanti — e chi conversa non deve sapere
 * quale delle due ha risposto.
 */
export interface ChatLlm {
  chat(request: LlmChatRequest, at?: Date): Promise<LlmChatResult>;
}

export interface LlmClientOptions {
  db: DbClient;
  /** ours today; the house's own when it brings one (BYOK, ADR-125 §8) */
  apiKey: string;
  model: string;
  /** closed, ordered provider list (ADR-125 §3); defaults to DEFAULT_PROVIDERS */
  providers?: readonly string[];
  /** fallback ceiling; a house that sets its own in `accounts` overrides it */
  dailyBudgetUsd: number;
  /** whose piggy bank this is (ADR-019); defaults to the first house */
  accountId?: string;
  /** which exemplar spent it — a house may hold more than one */
  gosinoId?: string;
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
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cost: z.number(),
  prompt_tokens_details: z
    .object({ cached_tokens: z.number().optional(), cache_write_tokens: z.number().optional() })
    .optional(),
});

const completionResponseSchema = z.object({
  // null quando il modello non ha scritto niente: è una risposta vuota, non un guasto
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
});

function localDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export class LlmClient {
  private readonly providers: readonly string[];
  private readonly timezone: string;
  private readonly locale: string;
  private readonly accountId: string;
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
    this.providers = options.providers ?? DEFAULT_PROVIDERS;
    this.timezone = options.timezone ?? "Europe/Rome";
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.accountId = options.accountId ?? PRIME_ACCOUNT_ID;
    this.gosinoId = options.gosinoId ?? PRIME_GOSINO_ID;
  }

  /**
   * Sum of THIS house's ledger today — always computed server-side, never
   * estimated. Scoped by account (ADR-019): before that, one family's
   * conversation drained the other's day.
   */
  public async spentTodayUsd(at: Date = new Date()): Promise<number> {
    const today = localDate(this.timezone, at);
    const rows = await this.options.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(and(eq(budgetLedger.accountId, this.accountId), eq(budgetLedger.date, today)));
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
      .select({ on: accounts.metabolism })
      .from(accounts)
      .where(eq(accounts.id, this.accountId));
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
      .select({ limit: accounts.dailyBudgetUsd })
      .from(accounts)
      .where(eq(accounts.id, this.accountId));
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
        { spentUsd: spent, budgetUsd, accountId: this.accountId },
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
        { piggyBankUsd: piggyBank, accountId: this.accountId, gosinoId: this.gosinoId },
        "empty piggy bank: the exemplar is hungry",
      );
      return { text: HUNGRY_REPLY, degraded: true };
    }

    const body = chatCompletionBody(this.options.model, this.providers, {
      channel: request.channel,
      locale: this.locale,
      ...(request.dynamicSystem !== undefined && { dynamicSystem: request.dynamicSystem }),
      ...(request.history !== undefined && { history: request.history }),
      userText: request.userText,
    });

    const response = await fetch(new URL("/api/v1/chat/completions", OPENROUTER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
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
    // OpenRouter conta i token in cache DENTRO prompt_tokens: qui si separano,
    // perché il ledger li ha in colonne distinte e il conto non va fatto due volte
    const cacheRead = counted.success ? (counted.data.prompt_tokens_details?.cached_tokens ?? 0) : 0;
    const cacheWrite = counted.success
      ? (counted.data.prompt_tokens_details?.cache_write_tokens ?? 0)
      : 0;
    const usage: TokenUsage = {
      inputTokens: counted.success ? counted.data.prompt_tokens - cacheRead - cacheWrite : 0,
      outputTokens: counted.success ? counted.data.completion_tokens : 0,
      cacheCreationInputTokens: cacheWrite,
      cacheReadInputTokens: cacheRead,
    };
    // il costo lo dichiara chi incassa (ADR-125 §5): un listino copiato qui invecchia
    const costUsd = counted.success ? counted.data.cost : 0;

    await this.options.db.insert(budgetLedger).values({
      accountId: this.accountId,
      gosinoId: this.gosinoId,
      date: localDate(this.timezone, at),
      provider: "openrouter",
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
        { accountId: this.accountId, model: this.options.model },
        "provider usage unreadable: ledger row written with zero tokens",
      );
    }

    const parsed = completionResponseSchema.parse(payload);
    const text = parsed.choices[0]?.message.content?.trim() ?? "";

    return { text, degraded: false, usage, costUsd };
  }
}
