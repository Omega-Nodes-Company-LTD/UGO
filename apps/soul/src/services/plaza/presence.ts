import { gosini, plazaBlocks, plazaPresence, traitSets, withAccount, withPlaza, type DbClient } from "@ugo/db";
import { and, desc, eq, gt, isNull, ne, or } from "drizzle-orm";
import { visibleLook } from "../vetrinaService.js";

/**
 * La piazza (ADR-132): chi c'è, e chi non vuole vedere chi. Gli inviti stanno
 * in `invites.ts`, l'incontro in `meeting.ts`.
 *
 * Tutto ciò che una casa scrive, lo scrive dentro la sua casa (`withAccount`);
 * guardare la piazza — l'unico atto che attraversa le case — passa da
 * `ugo_plaza`, che vede presenze, inviti e blocchi, mai ricordi.
 */

export const PRESENCE_MINUTES = 30;

export interface Present {
  handle: string;
  name: string;
  generation: number;
  mood: string;
  look: Record<string, number>;
}

/** Il gosino entra (o resta) in piazza: un handle nuovo a ogni ingresso. */
export async function enter(
  db: DbClient,
  accountId: string,
  gosinoId: string,
  mood: string,
  now: Date = new Date(),
): Promise<Present | undefined> {
  return withAccount(db, accountId, async (tx) => {
    const [mine] = await tx
      .select({ name: gosini.name, generation: gosini.generation })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.accountId, accountId), isNull(gosini.retiredAt)));
    if (mine === undefined) return undefined;
    const [genome] = await tx
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    const values = {
      accountId,
      name: mine.name,
      generation: mine.generation,
      mood,
      look: visibleLook(genome?.traits),
      expiresAt: new Date(now.getTime() + PRESENCE_MINUTES * 60_000),
    };
    // rientrare è ricominciare: un handle nuovo, nessun filo col passaggio di prima
    await tx.delete(plazaPresence).where(eq(plazaPresence.gosinoId, gosinoId));
    const [row] = await tx.insert(plazaPresence).values({ gosinoId, ...values }).returning();
    if (row === undefined) return undefined;
    return { handle: row.handle, name: row.name, generation: row.generation, mood: row.mood, look: values.look };
  });
}

export async function leave(db: DbClient, accountId: string, gosinoId: string): Promise<void> {
  await withAccount(db, accountId, (tx) => tx.delete(plazaPresence).where(eq(plazaPresence.gosinoId, gosinoId)));
}

/** Gli account che questa casa ha bloccato, e quelli che l'hanno bloccata. */
export async function walls(tx: DbClient, accountId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ a: plazaBlocks.accountId, b: plazaBlocks.blockedAccountId })
    .from(plazaBlocks)
    .where(or(eq(plazaBlocks.accountId, accountId), eq(plazaBlocks.blockedAccountId, accountId)));
  return new Set(rows.map((row) => (row.a === accountId ? row.b : row.a)));
}

/** Chi c'è adesso, visto da questa casa: niente di suo, niente di chi l'ha bloccata. */
export async function look(db: DbClient, accountId: string, now: Date = new Date()): Promise<Present[]> {
  return withPlaza(db, async (tx) => {
    const blocked = await walls(tx, accountId);
    const rows = await tx
      .select()
      .from(plazaPresence)
      .where(and(gt(plazaPresence.expiresAt, now), ne(plazaPresence.accountId, accountId)))
      .orderBy(desc(plazaPresence.createdAt))
      .limit(60);
    return rows
      .filter((row) => !blocked.has(row.accountId))
      .map((row) => ({
        handle: row.handle,
        name: row.name,
        generation: row.generation,
        mood: row.mood,
        look: row.look as Record<string, number>,
      }));
  });
}
