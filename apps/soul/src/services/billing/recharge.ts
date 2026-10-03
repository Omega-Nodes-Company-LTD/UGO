import { accountLogins, creditLedger, creditSettings, withAccount, type DbClient } from "@ugo/db";
import { creditBalanceMicros } from "@ugo/memory";
import { decryptText, microsToCents, nextRechargeDecision } from "@ugo/shared";
import { and, eq, gte, like, sql, sum } from "drizzle-orm";
import { accountKey } from "../ai/keyring.js";
import type { Mail, Mailer } from "../auth/mailer.js";
import { readMethod } from "./ledger.js";
import type { PayPalClient } from "./paypal.js";
import type { StripeClient } from "./stripe.js";

/**
 * La ricarica automatica (ADR-130 §5).
 *
 * Parte DOPO l'addebito che porta il saldo sotto soglia, fuori dalla coda
 * della chiamata (il gancio `onCreditDebited` del cancello). Tre freni:
 *
 * 1. un lock consultivo per account: due addebiti vicini non fanno due
 *    ricariche;
 * 2. `pending_since`: finché il webhook non accredita, non se ne parte
 *    un'altra (mezz'ora, poi si riprova — un webhook perso non blocca per sempre);
 * 3. il tetto del mese.
 *
 * Il credito NON si accredita qui: lo fa il webhook. Al primo rifiuto (una
 * banca che chiede la 3-D Secure, una carta scaduta) la ricarica automatica
 * si spegne e arriva una mail per ricaricare a mano.
 */

const PENDING_MS = 30 * 60_000;

export interface RechargeDeps {
  db: DbClient;
  masterKey: Buffer;
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
  mailer?: Mailer | undefined;
  /** dove si ricarica a mano: il link della mail */
  siteUrl?: string | undefined;
  log?: { warn: (data: Record<string, unknown>, message: string) => void };
}

interface Plan {
  provider: "stripe" | "paypal";
  pointer: string;
  amountMicros: number;
  key: string;
}

/** Decide e prenota la ricarica, sotto lock. undefined = niente da fare. */
async function decide(deps: RechargeDeps, accountId: string, now: Date): Promise<Plan | undefined> {
  return withAccount(deps.db, accountId, async (tx) => {
    const [locked] = await tx.execute<{ ok: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${`ugo-recharge:${accountId}`})) as ok`,
    );
    if (locked?.ok !== true) return undefined;
    const [settings] = await tx.select().from(creditSettings).where(eq(creditSettings.accountId, accountId));
    if (settings?.provider == null) return undefined;
    if (settings.pendingSince !== null && now.getTime() - settings.pendingSince.getTime() < PENDING_MS) return undefined;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [month] = await tx
      .select({ total: sum(creditLedger.amountMicros) })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.accountId, accountId),
          eq(creditLedger.kind, "topup"),
          like(creditLedger.ref, "auto:%"),
          gte(creditLedger.createdAt, monthStart),
        ),
      );
    const pointer = await readMethod(tx, deps.masterKey, accountId, settings.paymentMethodEnc);
    const decision = nextRechargeDecision(
      await creditBalanceMicros(tx, accountId),
      {
        autoRecharge: settings.autoRecharge,
        thresholdMicros: settings.thresholdMicros,
        amountMicros: settings.amountMicros,
        monthlyCapMicros: settings.monthlyCapMicros,
        hasSavedMethod: pointer !== undefined,
      },
      Number(month?.total ?? 0),
    );
    if (!decision.recharge || pointer === undefined) return undefined;
    await tx.update(creditSettings).set({ pendingSince: now }).where(eq(creditSettings.accountId, accountId));
    return { provider: settings.provider === "paypal" ? "paypal" : "stripe", pointer, amountMicros: decision.amountMicros, key: `recharge-${accountId}-${now.toISOString()}` };
  });
}

async function charge(deps: RechargeDeps, accountId: string, plan: Plan): Promise<{ ok: boolean; reason?: string }> {
  const amountCents = microsToCents(plan.amountMicros);
  if (plan.provider === "stripe") {
    if (deps.stripe === undefined) return { ok: false, reason: "stripe-off" };
    const [customer, paymentMethod] = plan.pointer.split(":");
    if (customer === undefined || paymentMethod === undefined) return { ok: false, reason: "method" };
    return deps.stripe.chargeOffSession({ accountId, customer, paymentMethod, amountCents, idempotencyKey: plan.key });
  }
  if (deps.paypal === undefined) return { ok: false, reason: "paypal-off" };
  return deps.paypal.chargeVaulted({ accountId, vaultId: plan.pointer, amountCents, requestId: plan.key });
}

export async function maybeRecharge(deps: RechargeDeps, accountId: string, now: Date = new Date()): Promise<"none" | "started" | "failed"> {
  const plan = await decide(deps, accountId, now);
  if (plan === undefined) return "none";
  const outcome = await charge(deps, accountId, plan);
  if (outcome.ok) return "started";
  await rechargeRefused(deps, accountId, outcome.reason ?? "declined");
  return "failed";
}

/**
 * Rifiutata: subito (off-session sincrono) o dopo (webhook di fallimento).
 * Si spegne e si avvisa — riprovare in automatico una carta che dice di no
 * è il modo più rapido per farsela bloccare.
 */
export async function rechargeRefused(deps: RechargeDeps, accountId: string, reason: string): Promise<void> {
  await withAccount(deps.db, accountId, (tx) =>
    tx
      .update(creditSettings)
      .set({
        autoRecharge: false,
        pendingSince: null,
        failures: sql`${creditSettings.failures} + 1`,
        disabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(creditSettings.accountId, accountId)),
  );
  deps.log?.warn({ accountId, reason }, "automatic recharge refused: switched off");
  await tellOwner(deps, accountId);
}

/** La mail «ricarica a mano»: all'indirizzo di chi entra in casa, se ce n'è uno. */
async function tellOwner(deps: RechargeDeps, accountId: string): Promise<void> {
  if (deps.mailer === undefined) return;
  const to = await withAccount(deps.db, accountId, async (tx) => {
    const [login] = await tx
      .select({ sealed: accountLogins.emailEnc })
      .from(accountLogins)
      .where(and(eq(accountLogins.accountId, accountId), eq(accountLogins.role, "owner")))
      .limit(1);
    if (login === undefined) return undefined;
    try {
      return decryptText(login.sealed, await accountKey(tx, accountId, deps.masterKey));
    } catch {
      return undefined;
    }
  });
  if (to === undefined) return;
  await deps.mailer.send(rechargeFailedMail(to, `${deps.siteUrl ?? ""}/casa#/credito`));
}

export function rechargeFailedMail(to: string, link: string): Mail {
  const text =
    "Ciao!\n\nLa ricarica automatica del credito di UGO non è andata a buon fine, e l'abbiamo spenta " +
    "per non riprovare a vuoto.\n\nPuoi ricaricare a mano, e riaccenderla, da qui:\n" +
    `${link}\n\n— UGO`;
  const safe = link.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
  const html =
    "<p>Ciao!</p><p>La ricarica automatica del credito di UGO non è andata a buon fine, e l'abbiamo " +
    "spenta per non riprovare a vuoto.</p>" +
    `<p>Puoi ricaricare a mano, e riaccenderla, da qui: <a href="${safe}">${safe}</a></p><p>— UGO</p>`;
  return { to, subject: "UGO: la ricarica automatica si è fermata", text, html };
}
