import { plazaBlocks, plazaInvites, plazaPresence, withAccount, withPlaza, type DbClient } from "@ugo/db";
import { and, desc, eq, gt, gte, inArray, or } from "drizzle-orm";
import { walls } from "./presence.js";

/**
 * Gli inviti della piazza (ADR-132): si chiede, si accetta o si rifiuta, si
 * blocca. Ogni invito porta i due nomi di quel momento, così ognuno lo vede
 * senza leggere la casa dell'altro — e mai l'account dell'altro.
 */

export const INVITE_MINUTES = 10;
export const DAILY_INVITES = 5;

export type InviteRefusal = "not-present" | "gone" | "blocked" | "busy" | "too-many";

/**
 * Invitare: il proprio gosino deve essere in piazza, l'altro pure. Un incontro
 * alla volta per gosino, cinque inviti al giorno per casa.
 */
export async function invite(
  db: DbClient,
  input: { accountId: string; gosinoId: string; handle: string },
  now: Date = new Date(),
): Promise<{ id: string } | InviteRefusal> {
  const seen = await withPlaza(db, async (tx) => {
    const [target] = await tx
      .select()
      .from(plazaPresence)
      .where(and(eq(plazaPresence.handle, input.handle), gt(plazaPresence.expiresAt, now)));
    const [me] = await tx
      .select()
      .from(plazaPresence)
      .where(and(eq(plazaPresence.gosinoId, input.gosinoId), eq(plazaPresence.accountId, input.accountId), gt(plazaPresence.expiresAt, now)));
    if (me === undefined) return "not-present" as const;
    if (target === undefined || target.accountId === input.accountId) return "gone" as const;
    if ((await walls(tx, input.accountId)).has(target.accountId)) return "blocked" as const;
    const live = await tx
      .select({ id: plazaInvites.id })
      .from(plazaInvites)
      .where(
        and(
          inArray(plazaInvites.status, ["attesa", "accettato"]),
          gt(plazaInvites.expiresAt, now),
          or(
            inArray(plazaInvites.fromGosinoId, [input.gosinoId, target.gosinoId]),
            inArray(plazaInvites.toGosinoId, [input.gosinoId, target.gosinoId]),
          ),
        ),
      );
    if (live.length > 0) return "busy" as const;
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const today = await tx
      .select({ id: plazaInvites.id })
      .from(plazaInvites)
      .where(and(eq(plazaInvites.fromAccountId, input.accountId), gte(plazaInvites.createdAt, dayAgo)));
    if (today.length >= DAILY_INVITES) return "too-many" as const;
    return { me, target };
  });
  if (typeof seen === "string") return seen;
  return withAccount(db, input.accountId, async (tx) => {
    const [row] = await tx
      .insert(plazaInvites)
      .values({
        fromGosinoId: input.gosinoId,
        fromAccountId: input.accountId,
        toGosinoId: seen.target.gosinoId,
        toAccountId: seen.target.accountId,
        fromName: seen.me.name,
        toName: seen.target.name,
        expiresAt: new Date(now.getTime() + INVITE_MINUTES * 60_000),
      })
      .returning({ id: plazaInvites.id });
    if (row === undefined) throw new Error("invite not written");
    return { id: row.id };
  });
}

export interface InviteView {
  id: string;
  /** da che parte sta chi guarda */
  verso: "uscita" | "entrata";
  mio: string;
  altro: string;
  stato: string;
  turni: number;
  scade: Date;
}

/** Gli inviti di una casa, da tutti e due i lati: mai l'account dell'altro. */
export async function invitesOf(db: DbClient, accountId: string, now: Date = new Date()): Promise<InviteView[]> {
  return withAccount(db, accountId, async (tx) => {
    const rows = await tx
      .select()
      .from(plazaInvites)
      .where(or(eq(plazaInvites.fromAccountId, accountId), eq(plazaInvites.toAccountId, accountId)))
      .orderBy(desc(plazaInvites.createdAt))
      .limit(30);
    return rows.map((row) => {
      const outgoing = row.fromAccountId === accountId;
      const lapsed = row.status === "attesa" && row.expiresAt <= now;
      return {
        id: row.id,
        verso: outgoing ? ("uscita" as const) : ("entrata" as const),
        mio: outgoing ? row.fromName : row.toName,
        altro: outgoing ? row.toName : row.fromName,
        stato: lapsed ? "scaduto" : row.status,
        turni: row.turnsDone,
        scade: row.expiresAt,
      };
    });
  });
}

/** Rispondere a un invito: solo chi lo ha ricevuto, e solo finché è in attesa. */
export async function answer(
  db: DbClient,
  accountId: string,
  inviteId: string,
  yes: boolean,
  now: Date = new Date(),
): Promise<typeof plazaInvites.$inferSelect | undefined> {
  return withAccount(db, accountId, async (tx) => {
    const [row] = await tx
      .update(plazaInvites)
      .set({ status: yes ? "accettato" : "rifiutato", ...(!yes && { endedAt: now }) })
      .where(
        and(
          eq(plazaInvites.id, inviteId),
          eq(plazaInvites.toAccountId, accountId),
          eq(plazaInvites.status, "attesa"),
          gt(plazaInvites.expiresAt, now),
        ),
      )
      .returning();
    return row;
  });
}

/** Bloccare chi ha mandato un invito: da lì non vede più e non invita più. */
export async function blockSender(db: DbClient, accountId: string, inviteId: string): Promise<boolean> {
  return withAccount(db, accountId, async (tx) => {
    const [row] = await tx
      .select({ from: plazaInvites.fromAccountId, to: plazaInvites.toAccountId })
      .from(plazaInvites)
      .where(and(eq(plazaInvites.id, inviteId), or(eq(plazaInvites.fromAccountId, accountId), eq(plazaInvites.toAccountId, accountId))));
    if (row === undefined) return false;
    const other = row.from === accountId ? row.to : row.from;
    await tx.insert(plazaBlocks).values({ accountId, blockedAccountId: other }).onConflictDoNothing();
    await tx
      .update(plazaInvites)
      .set({ status: "rifiutato", endedAt: new Date() })
      .where(and(eq(plazaInvites.id, inviteId), eq(plazaInvites.status, "attesa")));
    return true;
  });
}
