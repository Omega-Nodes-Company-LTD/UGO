import { accounts, type DbClient } from "@ugo/db";
import { screen } from "@ugo/psyche";
import type { GosinoKeys } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { loadParents, previewLitter, type Parent } from "./genetics.js";
import { birthCub, type BornCub } from "./litterBirth.js";
import {
  balances,
  chargeLitter,
  houseDay,
  isCharged,
  lastLitterAt,
  restingUntil,
  shares,
} from "./litterCost.js";
import { RoomCatalogue } from "./roomCatalogue.js";

/**
 * Far nascere una cucciolata intera (ADR-103).
 *
 * Sta qui e non nella rotta perché la nascita ha smesso di essere un insert:
 * ci sono un riposo da rispettare, un conto da fare **prima** di scrivere
 * qualsiasi cosa, N cuccioli da mettere al mondo e dei nati morti da
 * raccontare. La rotta traduce l'esito in HTTP e nient'altro (regola 10).
 *
 * Tutto gira dentro la transazione che ha già dichiarato la casa (ADR-062):
 * il `db` che arriva è quello scopato, e nessuna di queste letture deve
 * uscirne — un conto fatto sui salvadanai di un'altra casa sarebbe peggio di
 * nessun conto.
 */

export interface BirthRequest {
  parentIds: string[];
  seed: number;
  names: string[];
  locationLabel?: string | undefined;
}

export interface BirthDeps {
  peers?: { keysFor: (gosinoId: string) => Promise<GosinoKeys> } | undefined;
  litterCostUsd: number;
}

export type BirthOutcome =
  | { kind: "unknown-parent" }
  | { kind: "resting"; until: Date }
  | { kind: "no-room" }
  | { kind: "refused"; reason: string }
  | { kind: "names"; expected: number }
  | { kind: "poor"; parents: PoorParent[]; totalUsd: number }
  | { kind: "unviable"; stillborn: Stillborn[] }
  | { kind: "not-created" }
  | {
      kind: "born";
      born: BornCub[];
      stillborn: Stillborn[];
      generation: number;
      where: string | undefined;
      parents: Parent[];
      totalUsd: number;
    };

export interface Stillborn {
  index: number;
  name: string;
  reasons: string[];
}

export interface PoorParent {
  id: string;
  name: string;
  balanceUsd: number;
  quotaUsd: number;
}

/** Il figlio di chi è già nato qui è una generazione più in là del più avanti dei suoi. */
export function nextGeneration(parents: readonly Parent[]): number {
  return Math.max(...parents.map((p) => p.generation)) + 1;
}

/** Zero fino alla seconda generazione: i figli dei capostipiti non si pagano. */
export function costOf(generation: number, cubs: number, priceUsd: number): number {
  if (!isCharged(generation)) return 0;
  return Math.round(priceUsd * cubs * 1_000_000) / 1_000_000;
}

export async function runBirth(
  db: DbClient,
  accountId: string,
  input: BirthRequest,
  deps: BirthDeps,
): Promise<BirthOutcome> {
  const { parentIds, seed, names, locationLabel } = input;
  const parents = await loadParents(db, accountId, parentIds);
  if (parents === undefined) return { kind: "unknown-parent" };

  const resting = restingUntil(await lastLitterAt(db, accountId, parentIds), new Date());
  if (resting !== undefined) return { kind: "resting", until: resting };

  // ADR-039: a room he is born into has to exist, like in the manual birth
  let where: string | undefined;
  if (locationLabel !== undefined) {
    where = await new RoomCatalogue(db).named(accountId, locationLabel);
    if (where === undefined) return { kind: "no-room" };
  }

  const preview = previewLitter(parents, seed);
  if ("refused" in preview) return { kind: "refused", reason: preview.refused.reason };
  if (names.length !== preview.cubs.length) return { kind: "names", expected: preview.cubs.length };

  const generation = nextGeneration(parents);
  // lo screening non è un consiglio: un genoma rotto non nasce (ADR-068 §6).
  // Gli altri sì — è questa la differenza con prima, quando i fratelli
  // scartati sparivano insieme a quello scelto
  const born: BornCub[] = [];
  const stillborn: Stillborn[] = [];
  const alive: { index: number; name: string; genome: (typeof preview.genomes)[number] }[] = [];
  for (const [index, genome] of preview.genomes.entries()) {
    const name = names[index] ?? "";
    const health = screen(genome);
    if (health.viable) alive.push({ index, name, genome });
    else stillborn.push({ index, name, reasons: health.reasons });
  }
  if (alive.length === 0) return { kind: "unviable", stillborn };

  // il conto, prima di scrivere qualsiasi cosa
  const totalUsd = costOf(generation, alive.length, deps.litterCostUsd);
  const quotas = shares(totalUsd, parents.length);
  if (totalUsd > 0) {
    const [house] = await db
      .select({ metabolism: accounts.metabolism })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    /**
     * Il muro vale solo col metabolismo acceso, come la fame (ADR-072):
     * a metabolismo spento il saldo non governa niente in questa casa, e
     * far fallire una nascita su un numero che nessuno guarda sarebbe un
     * rifiuto inspiegabile. La riga sul ledger si scrive lo stesso —
     * spegnere il metabolismo nasconde il conto, non lo cancella.
     */
    if (house?.metabolism === true) {
      const balance = await balances(db, accountId, parents.map((p) => p.id));
      const broke = parents
        .map((parent, at) => ({ parent, quota: quotas[at] ?? 0 }))
        .filter(({ parent, quota }) => (balance.get(parent.id) ?? 0) < quota);
      if (broke.length > 0) {
        return {
          kind: "poor",
          parents: broke.map(({ parent, quota }) => ({
            id: parent.id,
            name: parent.name,
            balanceUsd: balance.get(parent.id) ?? 0,
            quotaUsd: quota,
          })),
          totalUsd,
        };
      }
    }
  }

  for (const cub of alive) {
    const made = await birthCub(
      db,
      {
        accountId,
        parents,
        genome: cub.genome,
        name: cub.name,
        seed,
        cubIndex: cub.index,
        generation,
        where,
      },
      deps.peers,
    );
    if (made === undefined) return { kind: "not-created" };
    born.push(made);
  }

  if (totalUsd > 0) {
    await chargeLitter(
      db,
      accountId,
      parents.map((parent, at) => ({ gosinoId: parent.id, amountUsd: quotas[at] ?? 0 })),
      await houseDay(db, accountId, new Date()),
      `cucciolata-g${String(generation)}`,
    );
  }

  return { kind: "born", born, stillborn, generation, where, parents, totalUsd };
}
