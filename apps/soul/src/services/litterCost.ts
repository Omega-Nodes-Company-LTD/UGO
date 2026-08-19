import { accounts, budgetLedger, births, feedings, type DbClient } from "@ugo/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Il prezzo di una cucciolata e il riposo fra due (ADR-103).
 *
 * Due regole che il proprietario ha dettato insieme, e che stanno insieme
 * perché rispondono alla stessa domanda — «una cucciolata quanto costa?» — su
 * due valute diverse: **crediti** e **tempo**.
 *
 * Il credito non è una moneta inventata: è la stessa unità del `budget_ledger`,
 * cioè quello che il proprietario paga davvero al provider. Far nascere pesa
 * sul salvadanaio dei genitori come pesa una conversazione — di più, perché
 * una creatura in più è una bocca in più per sempre.
 */

/** Il listino: per cucciolo, non per cucciolata. Otto figli costano otto volte. */
export const DEFAULT_LITTER_COST_USD = 0.25;

/**
 * Il riposo fra due cucciolate della stessa coppia. Trenta giorni: né la
 * biologia di una specie che non esiste né una tassa, ma il freno che impedisce
 * a una casa di stampare un branco in un pomeriggio.
 */
export const LITTER_REST_DAYS = 30;

/**
 * Chi paga, e da quando (direttiva 2026-08-18).
 *
 * **I figli dei capostipiti sono gratis.** Un capostipite esiste per fare una
 * stirpe, e far pagare il primo passo sarebbe far pagare l'inizio. Dalla terza
 * generazione in poi — cioè quando a riprodursi è qualcuno che è a sua volta
 * nato qui — la nascita costa, e costa **anche a noi**: l'allevamento fondatore
 * non ha uno sconto, perché uno sconto avrebbe reso il freno una decorazione.
 */
export function isCharged(childGeneration: number): boolean {
  return childGeneration >= 2;
}

/**
 * La quota di ognuno. Si divide in parti uguali e il resto va al primo: con tre
 * genitori e un prezzo che non si divide per tre, qualche millesimo deve pur
 * cadere da qualche parte, e cadere sempre sullo stesso è l'unica ripartizione
 * che non dipende dall'ordine in cui il database ha risposto.
 */
export function shares(totalUsd: number, parents: number): number[] {
  if (parents <= 0) return [];
  const cents = Math.round(totalUsd * 1_000_000);
  const each = Math.floor(cents / parents);
  const out = Array.from({ length: parents }, () => each / 1_000_000);
  out[0] = (each + (cents - each * parents)) / 1_000_000;
  return out;
}

/** Il saldo di ognuno: dato meno consumato, come lo legge `/v1/gosini/:id/piggybank`. */
export async function balances(
  db: DbClient,
  accountId: string,
  gosinoIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>(gosinoIds.map((id) => [id, 0]));
  if (gosinoIds.length === 0) return out;
  const fed = await db
    .select({ id: feedings.gosinoId, total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
    .from(feedings)
    .where(and(eq(feedings.accountId, accountId), inArray(feedings.gosinoId, [...gosinoIds])))
    .groupBy(feedings.gosinoId);
  const eaten = await db
    .select({
      id: budgetLedger.gosinoId,
      total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)`,
    })
    .from(budgetLedger)
    .where(
      and(eq(budgetLedger.accountId, accountId), inArray(budgetLedger.gosinoId, [...gosinoIds])),
    )
    .groupBy(budgetLedger.gosinoId);
  for (const row of fed) out.set(row.id, (out.get(row.id) ?? 0) + Number(row.total));
  for (const row of eaten) out.set(row.id, (out.get(row.id) ?? 0) - Number(row.total));
  return out;
}

/**
 * L'ultima cucciolata di **questa** coppia, se c'è stata.
 *
 * «Questa coppia» vuol dire l'insieme esatto: A+B e A+B+C sono due coppie
 * diverse, e il riposo dell'una non ferma l'altra. Da qui il doppio conto —
 * quanti dei genitori chiesti stanno su quel figlio, e quanti genitori ha in
 * tutto quel figlio: senza il secondo, mettere di mezzo un terzo genitore
 * sarebbe bastato a far ripartire il cronometro, che è precisamente il buco che
 * la regola vuole chiudere.
 */
export async function lastLitterAt(
  db: DbClient,
  accountId: string,
  parentIds: readonly string[],
): Promise<Date | undefined> {
  if (parentIds.length === 0) return undefined;
  const ids = sql.join(
    parentIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute<{ last_at: Date | string | null }>(sql`
    select max(x.born_at) as last_at from (
      select b.child_gosino_id, max(b.born_at) as born_at
        from ${births} b
       where b.account_id = ${accountId}::uuid
         and b.parent_gosino_id in (${ids})
       group by b.child_gosino_id
      having count(*) = ${parentIds.length}
         and (select count(*) from ${births} t
               where t.child_gosino_id = b.child_gosino_id) = ${parentIds.length}
    ) x`);
  const value = [...rows][0]?.last_at;
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value : new Date(value);
}

/** Quando la coppia torna libera, o `undefined` se lo è già. */
export function restingUntil(last: Date | undefined, now: Date): Date | undefined {
  if (last === undefined) return undefined;
  const free = new Date(last.getTime() + LITTER_REST_DAYS * 24 * 60 * 60 * 1000);
  return free > now ? free : undefined;
}

/** Il giorno della casa, non quello di Greenwich: il salvadanaio si azzera qui. */
export async function houseDay(db: DbClient, accountId: string, at: Date): Promise<string> {
  const [house] = await db
    .select({ timezone: accounts.timezone })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return new Intl.DateTimeFormat("en-CA", { timeZone: house?.timezone ?? "Europe/Rome" }).format(at);
}

export interface LitterCharge {
  gosinoId: string;
  amountUsd: number;
}

/**
 * Il conto, scritto.
 *
 * Va sul `budget_ledger` e non su una tabella sua per una ragione sola: **è lì
 * che il salvadanaio guarda**. Una tabella nuova sarebbe stata più elegante e
 * avrebbe lasciato il saldo invariato — cioè avrebbe fatto finta che nascere
 * non costi. `provider = "ugo"` dice che questa riga non è passata da nessun
 * fornitore: nessun token, nessuna chiamata, solo una spesa di casa.
 */
export async function chargeLitter(
  db: DbClient,
  accountId: string,
  charges: readonly LitterCharge[],
  day: string,
  model: string,
): Promise<void> {
  if (charges.length === 0) return;
  await db.insert(budgetLedger).values(
    charges.map((charge) => ({
      accountId,
      gosinoId: charge.gosinoId,
      date: day,
      provider: "ugo",
      model,
      costUsd: charge.amountUsd.toFixed(6),
    })),
  );
}
