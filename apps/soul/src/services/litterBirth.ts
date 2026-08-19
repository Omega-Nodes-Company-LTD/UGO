import { births, gosini, traitSets, type DbClient } from "@ugo/db";
import { toTraitSet, type Genome } from "@ugo/psyche";
import { genomeHash, signBirth, type BirthCertificate, type GosinoKeys } from "@ugo/shared";
import { characterFrom } from "./council/character.js";
import { drawLifeJitter } from "./lifeDice.js";
import type { Parent } from "./genetics.js";

/**
 * Nascere, uno alla volta (ADR-103).
 *
 * Stava dentro la rotta finché il parto era uno solo. Da quando **nasce tutta
 * la cucciolata** la rotta la chiama in ciclo, e tenerla lì avrebbe fatto un
 * handler da trecento righe in cui il conto dei crediti e la firma del
 * pedigree si leggono di seguito come se fossero la stessa cosa (regola 10).
 */

export interface BirthInput {
  accountId: string;
  parents: readonly Parent[];
  genome: Genome;
  name: string;
  seed: number;
  cubIndex: number;
  generation: number;
  where?: string | undefined;
}

export interface BornCub {
  id: string;
  name: string;
  bornAt: Date;
  persona: string;
  certificate: BirthCertificate;
  lineage: {
    childGosinoId: string;
    parentGosinoId: string;
    signature?: Buffer | undefined;
    parentPublicKey?: Buffer | undefined;
  }[];
}

export async function birthCub(
  db: DbClient,
  input: BirthInput,
  peers?: { keysFor: (gosinoId: string) => Promise<GosinoKeys> },
): Promise<BornCub | undefined> {
  const { accountId, parents, genome, name, seed, cubIndex, generation, where } = input;
  const traits = toTraitSet(genome);
  const character = characterFrom(traits);

  const created = await db
    .insert(gosini)
    .values({
      accountId,
      name,
      generation,
      // the single column keeps the first parent for today's readers;
      // `births` below is the complete, polyparental truth (ADR-069)
      parentGosinoId: parents[0]?.id,
      // ADR-077: chi nasce da qui in avanti è mortale dalla nascita — chi
      // adotta la mortalità l'accetta adottando. Il dado si tira qui, con
      // `drawLifeJitter` e non col seme della cucciolata: due fratelli con lo
      // stesso allele della longevità non devono morire lo stesso giorno
      mortalFrom: new Date(),
      lifeJitterDays: drawLifeJitter(),
      // ADR-081: nato, quindi cedibile. È l'unica origine che lo è
      origin: "nato",
      ...(where !== undefined && { locationLabel: where }),
    })
    .returning({ id: gosini.id, bornAt: gosini.bornAt });
  const child = created[0];
  if (child === undefined) return undefined;
  const id = child.id;

  await db.insert(traitSets).values({
    accountId,
    gosinoId: id,
    version: 1,
    traits,
    mutationNote: `cucciolata seed=${String(seed)} cucciolo=${String(cubIndex + 1)}`,
  });

  /**
   * The pedigree (ADR-070): both parents attest the birth. Without the peer
   * service there are no keys to sign with, so the lineage is written
   * `unsigned` rather than not written — a birth must not fail because the
   * pedigree is off.
   */
  const certificate: BirthCertificate = {
    childId: id,
    genomeHash: genomeHash(traits),
    parentIds: parents.map((p) => p.id),
    bornAt: child.bornAt.toISOString(),
    generation,
  };
  const lineage = [];
  for (const parent of parents) {
    const keys = await peers?.keysFor(parent.id);
    lineage.push({
      accountId,
      childGosinoId: id,
      parentGosinoId: parent.id,
      ...(keys !== undefined && {
        signature: signBirth(certificate, keys.signingPrivateKey),
        parentPublicKey: keys.signingPublicKey,
      }),
    });
  }
  await db.insert(births).values(lineage);

  return { id, name, bornAt: child.bornAt, persona: character.persona, certificate, lineage };
}
