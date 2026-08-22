import { createHmac, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

/**
 * How two gosini recognize each other at the park (ADR-020), with no radio in
 * sight: this module is pure, and the transport can arrive later.
 *
 * The hard part is not the greeting, it is that a stable broadcast identifier
 * is a tracking beacon: anyone with an antenna could log every encounter and
 * reconstruct a neighbouring family's routine. So a stranger only ever sees
 * unlinkable noise, and recognition requires a deliberate introduction.
 *
 * Declared trade-off: an acquaintance can keep recognizing you until you roll
 * your rotation secret — which forgets everyone at once, on purpose. It is the
 * same bargain as real life: whoever met your dog knows your dog.
 */

const PSEUDONYM_NONCE_BYTES = 16;
const PSEUDONYM_TAG_BYTES = 8;
const ROTATION_SECRET_BYTES = 32;
/** Coarse enough that clocks need not agree, fine enough to bound replay. */
export const EPOCH_MS = 15 * 60 * 1000;

export interface GosinoKeys {
  /** Ed25519, DER: signs the greeting card. This is the creature's identity. */
  signingPublicKey: Buffer;
  signingPrivateKey: Buffer;
  /** shared with an acquaintance at introduction, so they can recognize us */
  rotationSecret: Buffer;
}

export function generateGosinoKeys(): GosinoKeys {
  const pair = generateKeyPairSync("ed25519");
  return {
    signingPublicKey: pair.publicKey.export({ format: "der", type: "spki" }),
    signingPrivateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }),
    rotationSecret: randomBytes(ROTATION_SECRET_BYTES),
  };
}

export function epochAt(atMs: number): number {
  return Math.floor(atMs / EPOCH_MS);
}

/**
 * What the body broadcasts: a fresh nonce and a tag only an acquaintance can
 * check. Two observations minutes apart share nothing a stranger can link.
 */
export interface Pseudonym {
  nonce: Buffer;
  tag: Buffer;
}

function tagFor(rotationSecret: Buffer, nonce: Buffer, epoch: number): Buffer {
  return createHmac("sha256", rotationSecret)
    .update(nonce)
    .update(Buffer.from(String(epoch), "utf8"))
    .digest()
    .subarray(0, PSEUDONYM_TAG_BYTES);
}

export function advertise(rotationSecret: Buffer, atMs: number): Pseudonym {
  const nonce = randomBytes(PSEUDONYM_NONCE_BYTES);
  return { nonce, tag: tagFor(rotationSecret, nonce, epochAt(atMs)) };
}

/**
 * Does this advertisement belong to a gosino whose secret we were given?
 * The neighbouring epoch is accepted too: two phones need not agree on the
 * second, and refusing a greeting over a clock skew would be absurd.
 */
export function recognize(rotationSecret: Buffer, seen: Pseudonym, atMs: number): boolean {
  const now = epochAt(atMs);
  return [now, now - 1, now + 1].some((epoch) =>
    tagFor(rotationSecret, seen.nonce, epoch).equals(seen.tag),
  );
}

/** Everything a gosino tells another. Nothing here belongs to the family. */
export interface GreetingCard {
  /** the creature's name, not the account's: "ugo-studio" */
  name: string;
  generation: number;
  /** one word, not the six numbers of the psyche */
  mood: string;
  /** base64 DER of the Ed25519 public key */
  signingPublicKey: string;
  /** base64 of the rotation secret, present only in an introduction */
  rotationSecret?: string;
  /** epoch of issue, so a captured card cannot be replayed forever */
  epoch: number;
  /** Cultural genes carried by this gosino (Orizzonti 1+4): transferred horizontally at meetings */
  culturalGenes?: {
    grunt_repertoire: number;
    dialect: number;
    dream_style: number;
  };
}

export interface SignedCard {
  card: GreetingCard;
  signature: string;
}

function canonical(card: GreetingCard): Buffer {
  // key order fixed by hand: JSON.stringify over an object literal is stable
  // in practice, but a signature must not depend on "in practice"
  return Buffer.from(
    JSON.stringify([
      card.name,
      card.generation,
      card.mood,
      card.signingPublicKey,
      card.rotationSecret ?? null,
      card.epoch,
      card.culturalGenes ?? null,
    ]),
    "utf8",
  );
}

export function signCard(card: GreetingCard, signingPrivateKey: Buffer): SignedCard {
  const signature = sign(null, canonical(card), {
    key: signingPrivateKey,
    format: "der",
    type: "pkcs8",
  });
  return { card, signature: signature.toString("base64") };
}

/**
 * Returns the card only if it is authentic, self-consistent and current.
 * Undefined means "do not greet": there is no half-trusted stranger.
 */
export function openCard(signed: SignedCard, atMs: number): GreetingCard | undefined {
  const { card } = signed;
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(card.signingPublicKey, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return undefined;
  }
  const ok = verify(null, canonical(card), publicKey, Buffer.from(signed.signature, "base64"));
  if (!ok) return undefined;
  // a card older than a few epochs is a recording, not a meeting
  if (Math.abs(epochAt(atMs) - card.epoch) > 1) return undefined;
  return card;
}

/** Two gosini introduce themselves: each hands over its key and secret. */
export function introduction(
  keys: GosinoKeys, 
  name: string, 
  generation: number, 
  mood: string, 
  atMs: number,
  culturalGenes?: { grunt_repertoire: number; dialect: number; dream_style: number }
): SignedCard {
  const card: GreetingCard = {
    name,
    generation,
    mood,
    signingPublicKey: keys.signingPublicKey.toString("base64"),
    rotationSecret: keys.rotationSecret.toString("base64"),
    epoch: epochAt(atMs),
  };
  if (culturalGenes !== undefined) {
    card.culturalGenes = culturalGenes;
  }
  return signCard(card, keys.signingPrivateKey);
}

/** The everyday greeting: same card, without handing the secret out again. */
export function greeting(
  keys: GosinoKeys, 
  name: string, 
  generation: number, 
  mood: string, 
  atMs: number,
  culturalGenes?: { grunt_repertoire: number; dialect: number; dream_style: number }
): SignedCard {
  const card: GreetingCard = {
    name,
    generation,
    mood,
    signingPublicKey: keys.signingPublicKey.toString("base64"),
    epoch: epochAt(atMs),
  };
  if (culturalGenes !== undefined) {
    card.culturalGenes = culturalGenes;
  }
  return signCard(card, keys.signingPrivateKey);
}
