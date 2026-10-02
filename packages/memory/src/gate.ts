import { budgetLedger, creditLedger, type DbClient } from "@ugo/db";
import type { Cost, TokenUsage } from "./pricing.js";
import {
  creditBalanceMicros,
  creditDebitMicros,
  dailyBudgetUsd,
  localDate,
  piggyBankUsd,
  spentTodayUsd,
  type CreditTerms,
} from "./wallet.js";

export type { CreditTerms } from "./wallet.js";

/**
 * IL cancello misurato (CLAUDE.md regola 3, ADR-122, ADR-130).
 *
 * Ogni chiamata pagata a un provider — testo, visione, voce — passa di qui, e
 * qui succedono, in quest'ordine e dentro la stessa coda dell'account:
 *
 * 1. il tetto giornaliero della casa (la protezione del SUO portafoglio);
 * 2. il salvadanaio dell'esemplare, se la casa ha il metabolismo (ADR-072);
 * 3. il credito, se la chiave è di UGO (ADR-130);
 * 4. la chiamata;
 * 5. la riga di `budget_ledger`, sempre, anche se la risposta è illeggibile;
 * 6. l'addebito sul credito, se la chiave è di UGO.
 *
 * **La coda è per account, ed è di processo.** Prima stava dentro ogni
 * `LlmClient`: un client per la chat e uno per il pensiero della stessa casa
 * leggevano lo stesso `spent` e passavano entrambi. Qui la chiave è l'account,
 * qualunque client sia. Due processi soul sullo stesso database tornerebbero a
 * sovrapporsi (ADR-121: una replica).
 */

export type KeySource = "byok" | "ugo";

export interface GateContext {
  /** la connessione DELLA casa (ADR-098): sotto `ugo_app` vede solo lei */
  db: DbClient;
  accountId: string;
  gosinoId: string;
  /** il fuso della casa (ADR-050): decide il giorno della riga */
  timezone: string;
  /** il tetto di processo, quando la casa non ne ha uno suo */
  dailyBudgetUsd: number;
  keySource: KeySource;
  /** obbligatorio con `keySource: "ugo"`: senza, nessuna chiave UGO si spende */
  credit?: CreditTerms;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export type GateRefusal = "budget" | "hungry" | "credit";

export interface PaidCall<T> {
  value: T;
  provider: string;
  model: string;
  /** undefined = pagata ma non conteggiabile: riga a zero, dichiarata */
  usage: TokenUsage | undefined;
  cost: Cost;
}

export type GateOutcome<T> =
  | { ok: true; value: T; usage: TokenUsage | undefined; costUsd: number }
  | { ok: false; refusal: GateRefusal };

const queues = new Map<string, Promise<unknown>>();

/** Una chiamata per volta per account: «guarda → chiama → segna» è indivisibile. */
function serialized<T>(accountId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(accountId) ?? Promise.resolve();
  const mine = previous.then(work, work);
  const tail = mine.catch(() => undefined);
  queues.set(accountId, tail);
  // la mappa non cresce per sempre: l'ultima della fila si toglie da sola
  void tail.then(() => {
    if (queues.get(accountId) === tail) queues.delete(accountId);
  });
  return mine;
}

async function refusalFor(ctx: GateContext, at: Date): Promise<GateRefusal | undefined> {
  const [spent, budget] = await Promise.all([
    spentTodayUsd(ctx.db, ctx.accountId, ctx.timezone, at),
    dailyBudgetUsd(ctx.db, ctx.accountId, ctx.dailyBudgetUsd),
  ]);
  if (spent >= budget) {
    ctx.logger?.warn(
      { spentUsd: spent, budgetUsd: budget, accountId: ctx.accountId },
      "daily budget exceeded: declared degradation",
    );
    return "budget";
  }
  const piggy = await piggyBankUsd(ctx.db, ctx.accountId, ctx.gosinoId);
  if (piggy !== undefined && piggy <= 0) {
    ctx.logger?.warn(
      { accountId: ctx.accountId, gosinoId: ctx.gosinoId },
      "empty piggy bank: the exemplar is hungry",
    );
    return "hungry";
  }
  if (ctx.keySource === "ugo") {
    if (ctx.credit === undefined) return "credit";
    const balance = await creditBalanceMicros(ctx.db, ctx.accountId);
    if (balance <= 0) {
      ctx.logger?.warn({ accountId: ctx.accountId }, "UGO credit exhausted");
      return "credit";
    }
  }
  return undefined;
}

async function record<T>(ctx: GateContext, paid: PaidCall<T>, at: Date): Promise<void> {
  const usage = paid.usage;
  const [row] = await ctx.db
    .insert(budgetLedger)
    .values({
      accountId: ctx.accountId,
      gosinoId: ctx.gosinoId,
      date: localDate(ctx.timezone, at),
      provider: paid.provider,
      model: paid.model,
      tokensIn:
        usage === undefined
          ? 0
          : usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
      tokensCacheWrite: usage?.cacheCreationInputTokens ?? 0,
      tokensCacheRead: usage?.cacheReadInputTokens ?? 0,
      tokensOut: usage?.outputTokens ?? 0,
      costUsd: paid.cost.usd.toFixed(6),
      costSource: paid.cost.source,
      keySource: ctx.keySource,
    })
    .returning({ id: budgetLedger.id });
  if (usage === undefined) {
    // segnata e dichiarata: una riga a zero è una bugia più piccola di nessuna
    ctx.logger?.warn(
      { accountId: ctx.accountId, provider: paid.provider, model: paid.model },
      "provider usage unreadable: ledger row written with zero tokens",
    );
  }
  if (ctx.keySource === "ugo" && ctx.credit !== undefined && row !== undefined) {
    const micros = creditDebitMicros(paid.cost.usd, ctx.credit);
    if (micros > 0) {
      await ctx.db.insert(creditLedger).values({
        accountId: ctx.accountId,
        kind: "usage",
        amountMicros: -micros,
        ref: `ledger:${row.id}`,
      });
    }
  }
}

/**
 * Passa dal cancello. `call` è la chiamata pagata: se lancia, nessuna riga
 * (non è stata pagata — gli adapter lanciano solo prima del 2xx).
 */
export function throughGate<T>(
  ctx: GateContext,
  call: () => Promise<PaidCall<T>>,
  at: Date = new Date(),
): Promise<GateOutcome<T>> {
  return serialized(ctx.accountId, async (): Promise<GateOutcome<T>> => {
    const refusal = await refusalFor(ctx, at);
    if (refusal !== undefined) return { ok: false, refusal };
    const paid = await call();
    await record(ctx, paid, at);
    return { ok: true, value: paid.value, usage: paid.usage, costUsd: paid.cost.usd };
  });
}
