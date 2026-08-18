import { describe, expect, it } from "vitest";
import { generateGosinoKeys } from "./peer.js";
import {
  genomeHash,
  signBirth,
  verdictFor,
  verifyBirth,
  type BirthCertificate,
} from "./pedigree.js";

/** ADR-070: funzioni pure sopra node:crypto, come `peer.ts`. */

const certificate = (over: Partial<BirthCertificate> = {}): BirthCertificate => ({
  childId: "11111111-1111-4111-8111-111111111111",
  genomeHash: genomeHash({ calm: 0.5, alleles: { calm: [0.4, 0.6] } }),
  parentIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"],
  bornAt: "2026-08-17T18:00:00.000Z",
  generation: 1,
  ...over,
});

describe("l'impronta del genoma", () => {
  it("non dipende dall'ordine delle chiavi: jsonb non promette un ordine", () => {
    expect(genomeHash({ a: 1, b: 2 })).toBe(genomeHash({ b: 2, a: 1 }));
  });

  it("sopravvive al ritorno dal database di un float", () => {
    expect(genomeHash({ x: 0.3 })).toBe(genomeHash({ x: 0.30000000000000004 }));
  });

  it("cambia se cambia un allele: è il punto di tutto", () => {
    expect(genomeHash({ x: 0.3 })).not.toBe(genomeHash({ x: 0.31 }));
  });
});

describe("la firma dell'atto di nascita", () => {
  it("il genitore firma e la sua chiave pubblica lo conferma", () => {
    const parent = generateGosinoKeys();
    const doc = certificate();
    const signature = signBirth(doc, parent.signingPrivateKey);
    expect(verifyBirth(doc, signature, parent.signingPublicKey)).toBe(true);
  });

  it("l'ordine dei genitori non conta: si firma l'insieme, non l'elenco", () => {
    const parent = generateGosinoKeys();
    const ids = certificate().parentIds;
    const signature = signBirth(certificate(), parent.signingPrivateKey);
    const reversed = certificate({ parentIds: [...ids].reverse() });
    expect(verifyBirth(reversed, signature, parent.signingPublicKey)).toBe(true);
  });

  it("un genoma manomesso rompe la firma", () => {
    const parent = generateGosinoKeys();
    const signature = signBirth(certificate(), parent.signingPrivateKey);
    const tampered = certificate({ genomeHash: genomeHash({ calm: 0.99 }) });
    expect(verifyBirth(tampered, signature, parent.signingPublicKey)).toBe(false);
  });

  it("un estraneo non può attestare la tua discendenza", () => {
    const stranger = generateGosinoKeys();
    const parent = generateGosinoKeys();
    const signature = signBirth(certificate(), stranger.signingPrivateKey);
    expect(verifyBirth(certificate(), signature, parent.signingPublicKey)).toBe(false);
  });

  it("una chiave illeggibile non è una chiave a metà fidata", () => {
    const parent = generateGosinoKeys();
    const signature = signBirth(certificate(), parent.signingPrivateKey);
    expect(verifyBirth(certificate(), signature, Buffer.from("non una chiave"))).toBe(false);
  });
});

describe("i tre verdetti", () => {
  const parent = generateGosinoKeys();

  it("valid quando la firma regge", () => {
    const signature = signBirth(certificate(), parent.signingPrivateKey);
    expect(verdictFor(certificate(), signature, parent.signingPublicKey)).toBe("valid");
  });

  it("unsigned — non invalid — per un antenato onesto senza firma", () => {
    expect(verdictFor(certificate(), null, null)).toBe("unsigned");
    expect(verdictFor(certificate(), undefined, parent.signingPublicKey)).toBe("unsigned");
  });

  it("invalid solo quando qualcuno ha toccato il database", () => {
    const signature = signBirth(certificate({ generation: 9 }), parent.signingPrivateKey);
    expect(verdictFor(certificate(), signature, parent.signingPublicKey)).toBe("invalid");
  });
});
