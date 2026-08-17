import { describe, expect, it } from "vitest";
import {
  actHash,
  entryHash,
  genesisPrevHash,
  signEntry,
  verifyChain,
  verifyEntrySignature,
  type Act,
  type ChainEntry,
} from "./chain.js";
import { generateGosinoKeys } from "./peer.js";

/** ADR-073: il registro si verifica senza il permesso di chi lo tiene. */

const registrar = generateGosinoKeys();

const act = (over: Partial<Act> = {}): Act => ({
  kind: "birth",
  gosinoId: "11111111-1111-4111-8111-111111111111",
  genomeHash: "a".repeat(64),
  at: "2026-08-17T19:00:00.000Z",
  generation: 1,
  ...over,
});

/** Costruisce una catena vera, come farebbe il registrar. */
function chainOf(acts: readonly Act[], key = registrar.signingPrivateKey): ChainEntry[] {
  const entries: ChainEntry[] = [];
  let prevHash = genesisPrevHash();
  acts.forEach((one, index) => {
    const seq = index + 1;
    const hashOfAct = actHash(one);
    const hash = entryHash(seq, prevHash, hashOfAct);
    entries.push({
      seq,
      prevHash,
      actHash: hashOfAct,
      hash,
      act: one,
      registrarSignature: signEntry(hash, key),
    });
    prevHash = hash;
  });
  return entries;
}

describe("l'impronta di un atto", () => {
  it("non dipende dall'ordine delle chiavi: jsonb non promette un ordine", () => {
    const one: Act = {
      kind: "birth",
      gosinoId: "x",
      genomeHash: "y",
      at: "2026-08-17T19:00:00.000Z",
      generation: 2,
    };
    // stesse coppie, scritte al contrario
    const same: Act = {
      generation: 2,
      at: "2026-08-17T19:00:00.000Z",
      genomeHash: "y",
      gosinoId: "x",
      kind: "birth",
    };
    expect(actHash(one)).toBe(actHash(same));
  });

  it("cambia se cambia un dettaglio qualunque", () => {
    expect(actHash(act())).not.toBe(actHash(act({ generation: 2 })));
    expect(actHash(act())).not.toBe(actHash(act({ kind: "death" })));
  });
});

describe("la catena", () => {
  it("una catena onesta non ha problemi", () => {
    const chain = chainOf([act(), act({ kind: "transfer" }), act({ kind: "death" })]);
    expect(verifyChain(chain, registrar.signingPublicKey)).toEqual([]);
  });

  it("riscrivere un atto già in catena si vede", () => {
    const chain = chainOf([act(), act({ generation: 2 })]);
    // qualcuno «migliora» la generazione del secondo atto
    const tampered = chain.map((entry, index) =>
      index === 1 ? { ...entry, act: { ...entry.act, generation: 9 } } : entry,
    );
    const problems = verifyChain(tampered, registrar.signingPublicKey);
    expect(problems.some((p) => p.reason === "atto-alterato")).toBe(true);
  });

  it("togliere una voce di mezzo rompe l'anello", () => {
    const chain = chainOf([act(), act({ kind: "transfer" }), act({ kind: "death" })]);
    const without = [chain[0], chain[2]].filter((e): e is ChainEntry => e !== undefined);
    const problems = verifyChain(without, registrar.signingPublicKey);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("un registrar che non è quello dichiarato non passa", () => {
    const impostor = generateGosinoKeys();
    const chain = chainOf([act()], impostor.signingPrivateKey);
    const problems = verifyChain(chain, registrar.signingPublicKey);
    expect(problems.some((p) => p.reason === "firma-del-registrar-non-valida")).toBe(true);
  });

  it("senza la chiave si verificano comunque i legami: la storia non si riscrive", () => {
    const chain = chainOf([act(), act({ kind: "death" })]);
    expect(verifyChain(chain)).toEqual([]);
    const tampered = chain.map((entry, index) =>
      index === 0 ? { ...entry, act: { ...entry.act, gosinoId: "altro" } } : entry,
    );
    expect(verifyChain(tampered).length).toBeGreaterThan(0);
  });

  it("un pezzo di catena preso da metà si verifica lo stesso", () => {
    const chain = chainOf([act(), act({ kind: "transfer" }), act({ kind: "death" })]);
    expect(verifyChain(chain.slice(1), registrar.signingPublicKey)).toEqual([]);
  });

  it("una catena vuota non è un problema: è un registro appena nato", () => {
    expect(verifyChain([])).toEqual([]);
  });
});

describe("la firma del registrar", () => {
  it("dice chi ha messo la voce in catena, e solo lui", () => {
    const [entry] = chainOf([act()]);
    if (entry === undefined) throw new Error("no entry");
    expect(verifyEntrySignature(entry, registrar.signingPublicKey)).toBe(true);
    expect(verifyEntrySignature(entry, generateGosinoKeys().signingPublicKey)).toBe(false);
  });

  it("una chiave illeggibile non è mezza fidata", () => {
    const [entry] = chainOf([act()]);
    if (entry === undefined) throw new Error("no entry");
    expect(verifyEntrySignature(entry, Buffer.from("non una chiave"))).toBe(false);
  });
});
