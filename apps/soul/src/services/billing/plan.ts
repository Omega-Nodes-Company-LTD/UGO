import { accounts, adoptions, gosini, rooms, subscriptions, type DbClient } from "@ugo/db";
import {
  effectivePlan,
  PLANS,
  withinQuota,
  type Entitlements,
  type PlanId,
  type Quota,
  type Toggle,
} from "@ugo/shared";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyReply } from "fastify";

/**
 * Cosa può fare una casa (ADR-125). Ogni lettura gira sulla connessione della
 * casa (`withAccount`/`inAccount`): l'abbonamento sta dietro RLS.
 *
 * `fallback` è il piano di chi non ha né abbonamento né concessione: `free`
 * davanti a internet, `allevamento` in casa (`UGO_PUBLIC=off`) — un'installazione
 * del proprietario non vende niente a se stessa, e il giorno in cui arrivano i
 * piani non deve spegnersi niente di quello che c'era.
 */

export interface PlanView {
  plan: PlanId;
  capacita: Entitlements;
  /** da dove viene: l'abbonamento, la concessione dell'operatore, o il ripiego */
  fonte: "abbonamento" | "concessione" | "base";
}

export class PlanGate {
  public constructor(private readonly fallback: PlanId) {}

  public async of(db: DbClient, accountId: string): Promise<PlanView> {
    const [sub] = await db
      .select({ plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.accountId, accountId));
    const [house] = await db
      .select({ grant: accounts.planGrant })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const fromSub = effectivePlan({ subscription: sub });
    const grant = house?.grant ?? this.fallback;
    const plan = effectivePlan({ subscription: sub, grant });
    const fonte = sub !== undefined && plan === fromSub && fromSub !== "free"
      ? "abbonamento"
      : house?.grant != null ? "concessione" : "base";
    return { plan, capacita: PLANS[plan], fonte };
  }

  public async allows(db: DbClient, accountId: string, capability: Toggle): Promise<boolean> {
    return (await this.of(db, accountId)).capacita[capability];
  }

  /**
   * C'è posto per un'altra? Conta quelle che ci sono; `incoming` sono quelle
   * già promesse e non ancora arrivate (i cuccioli prenotati).
   */
  public async hasRoom(db: DbClient, accountId: string, quota: Quota, incoming = 0): Promise<boolean> {
    const { plan } = await this.of(db, accountId);
    return withinQuota(plan, quota, (await countOf(db, accountId, quota)) + incoming);
  }
}

async function countOf(db: DbClient, accountId: string, quota: Quota): Promise<number> {
  if (quota === "rooms") {
    const [row] = await db.select({ n: count() }).from(rooms).where(eq(rooms.accountId, accountId));
    return row?.n ?? 0;
  }
  // un gosino a riposo resta della casa ma non occupa posto (ADR-104)
  const [living] = await db
    .select({ n: count() })
    .from(gosini)
    .where(and(eq(gosini.accountId, accountId), isNull(gosini.retiredAt)));
  return living?.n ?? 0;
}

/** I cuccioli già scelti e non ancora arrivati: occupano un posto anche loro. */
export async function incomingCubs(db: DbClient, buyerAccountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(adoptions)
    .where(and(eq(adoptions.buyerAccountId, buyerAccountId), inArray(adoptions.status, ["prenotata", "pagata"])));
  return row?.n ?? 0;
}

const WHY: Record<Toggle | Quota, string> = {
  gosini: "il tuo piano non ha posto per un altro gosino",
  rooms: "il tuo piano non ha posto per un'altra stanza",
  voice: "la voce sintetica è del piano Pro",
  dream: "il sogno notturno è del piano Pro",
  album: "l'album è del piano Pro",
  meetings: "le riunioni sono del piano Pro",
  plaza: "la piazza è del piano Pro",
  breedingSales: "cucciolate e vendita sono del piano Allevamento",
};

/** 402: non è un errore né un divieto, è un piano che non arriva fin lì. */
export async function needsPlan(reply: FastifyReply, what: Toggle | Quota): Promise<FastifyReply> {
  return reply.code(402).type("application/problem+json").send({
    type: "about:blank",
    title: "Plan required",
    status: 402,
    detail: `${WHY[what]}: lo cambi da Abbonamento`,
    capacita: what,
  });
}
