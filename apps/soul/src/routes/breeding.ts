import { accounts, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";

/**
 * Chi può far esistere un gosino (ADR-081).
 *
 * Due autorizzazioni, e sono due cose diverse: **coniare** un capostipite —
 * far esistere una creatura che non è nata da nessuno — e **allevare**, cioè
 * far nascere cucciolate da genitori che ci sono. Una famiglia non fa né
 * l'una né l'altra: adotta un nato, e lo sceglie fra quelli che esistono.
 *
 * Il guardiano sta qui e non dentro le rotte perché le porte di nascita sono
 * tre (la mano, la cucciolata, la dote) e una regola scritta tre volte è una
 * regola che prima o poi vale due volte.
 */

export type BreedingPermission = "conia" | "alleva";

const REFUSALS: Readonly<Record<BreedingPermission, string>> = {
  conia:
    "un gosino non si crea: si adotta fra quelli nati. Coniare capostipiti è dell'allevamento fondatore",
  alleva: "questa casa non è un allevamento autorizzato: le cucciolate le fa chi ne ha titolo",
};

export async function allowedTo(
  db: DbClient,
  accountId: string,
  permission: BreedingPermission,
): Promise<boolean> {
  const [house] = await db
    .select({ foundry: accounts.isFoundry, breed: accounts.canBreed })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (house === undefined) return false;
  // chi conia alleva per forza: un allevamento fondatore che non potesse fare
  // cucciolate potrebbe creare creature e non farne nascere nessuna
  return permission === "conia" ? house.foundry : house.breed || house.foundry;
}

/**
 * Rifiuta con **403 e il motivo scritto in italiano**, non con un 404 che
 * fingerebbe che la rotta non esista: chi la chiama ha diritto di sapere che
 * la porta c'è e non è sua.
 */
export async function guardBreeding(
  db: DbClient,
  accountId: string,
  permission: BreedingPermission,
  reply: FastifyReply,
): Promise<boolean> {
  if (await allowedTo(db, accountId, permission)) return true;
  await reply.status(403).send({ error: "non autorizzato", detail: REFUSALS[permission] });
  return false;
}
