import {
  beings,
  bonds,
  gosini,
  perceptionEvents,
  recognitionProfiles,
  type DbClient,
} from "@ugo/db";
import {
  advertise,
  decryptBytes,
  encryptBytes,
  generateGosinoKeys,
  greeting,
  introduction,
  openCard,
  recognize,
  type GosinoKeys,
  type Pseudonym,
  type SignedCard,
} from "@ugo/shared";
import { and, eq, sql } from "drizzle-orm";

/**
 * Meeting another gosino (ADR-020).
 *
 * Nothing here calls the LLM, by design: two exemplars stopped at the same
 * traffic light must not write each other a novel at the owner's expense.
 * The greeting is local, and what it leaves behind is what the pack model
 * already knows how to hold — a visitor, a bond, an event.
 */

/** How a peer's rotation secret is stored, so a future format is detectable. */
const PEER_MODEL = "peer-rotation-v1";
const PEER_SPECIES = "gosino";

export interface PeerEncounter {
  /** the being row standing for the other creature, in OUR house */
  beingId: string;
  name: string;
  /** false the first time we ever meet them */
  known: boolean;
  eventType: "peer_met" | "peer_greeted";
}

export class PeerService {
  public constructor(
    private readonly db: DbClient,
    /** the house's data key: every secret below is ciphertext at rest */
    private readonly dataKey: Buffer,
  ) {}

  /** Mints the exemplar's identity on first use and returns it decrypted. */
  public async keysFor(gosinoId: string): Promise<GosinoKeys> {
    const [row] = await this.db
      .select({
        pub: gosini.signingPublicKey,
        priv: gosini.signingPrivateKey,
        secret: gosini.rotationSecret,
      })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    if (row === undefined) throw new Error("no such exemplar");

    if (row.pub !== null && row.priv !== null && row.secret !== null) {
      return {
        signingPublicKey: row.pub,
        signingPrivateKey: decryptBytes(row.priv, this.dataKey),
        rotationSecret: decryptBytes(row.secret, this.dataKey),
      };
    }

    const keys = generateGosinoKeys();
    await this.db
      .update(gosini)
      .set({
        signingPublicKey: keys.signingPublicKey,
        signingPrivateKey: encryptBytes(keys.signingPrivateKey, this.dataKey),
        rotationSecret: encryptBytes(keys.rotationSecret, this.dataKey),
      })
      .where(eq(gosini.id, gosinoId));
    return keys;
  }

  public async setEnabled(gosinoId: string, enabled: boolean): Promise<void> {
    await this.db.update(gosini).set({ peerEncounters: enabled }).where(eq(gosini.id, gosinoId));
  }

  public async enabled(gosinoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ on: gosini.peerEncounters })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    return row?.on ?? false;
  }

  /** What this exemplar broadcasts right now. Unlinkable to a stranger. */
  public async advertisement(gosinoId: string, at: Date = new Date()): Promise<Pseudonym> {
    const keys = await this.keysFor(gosinoId);
    return advertise(keys.rotationSecret, at.getTime());
  }

  /** The card handed over face to face, the only one carrying the secret. */
  public async introductionCard(
    gosinoId: string,
    mood: string,
    at: Date = new Date(),
  ): Promise<SignedCard> {
    const [row] = await this.db
      .select({ name: gosini.name, generation: gosini.generation })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    if (row === undefined) throw new Error("no such exemplar");
    const keys = await this.keysFor(gosinoId);
    return introduction(keys, row.name, row.generation, mood, at.getTime());
  }

  public async greetingCard(
    gosinoId: string,
    mood: string,
    at: Date = new Date(),
  ): Promise<SignedCard> {
    const [row] = await this.db
      .select({ name: gosini.name, generation: gosini.generation })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    if (row === undefined) throw new Error("no such exemplar");
    const keys = await this.keysFor(gosinoId);
    return greeting(keys, row.name, row.generation, mood, at.getTime());
  }

  /**
   * An introduction accepted by the owner: the other creature becomes a
   * visitor of this pack, and we keep the secret that lets us know it again.
   */
  public async accept(
    input: { householdId: string; gosinoId: string; card: SignedCard },
    at: Date = new Date(),
  ): Promise<PeerEncounter | undefined> {
    const card = openCard(input.card, at.getTime());
    if (card?.rotationSecret === undefined) return undefined;

    const [being] = await this.db
      .insert(beings)
      .values({
        householdId: input.householdId,
        displayName: card.name,
        species: PEER_SPECIES,
        kind: "visitor",
      })
      .returning({ id: beings.id });
    if (being === undefined) throw new Error("visitor was not created");

    await this.db.insert(recognitionProfiles).values({
      householdId: input.householdId,
      beingId: being.id,
      modality: "tag",
      model: PEER_MODEL,
      dimensions: 0,
      payload: encryptBytes(Buffer.from(card.rotationSecret, "base64"), this.dataKey),
      sampleCount: 1,
    });
    await this.db.insert(bonds).values({
      householdId: input.householdId,
      gosinoId: input.gosinoId,
      beingId: being.id,
      familiarity: 0.1,
    });
    await this.record(input.gosinoId, being.id, at);
    return { beingId: being.id, name: card.name, known: false, eventType: "peer_met" };
  }

  /**
   * Someone announced themselves nearby. We try the secrets we were given —
   * a handful, by design — and greet only if one of them matches.
   */
  public async sighting(
    input: { householdId: string; gosinoId: string; seen: Pseudonym },
    at: Date = new Date(),
  ): Promise<PeerEncounter | undefined> {
    if (!(await this.enabled(input.gosinoId))) return undefined;

    const known = await this.db
      .select({
        beingId: beings.id,
        name: beings.displayName,
        payload: recognitionProfiles.payload,
      })
      .from(recognitionProfiles)
      .innerJoin(beings, eq(beings.id, recognitionProfiles.beingId))
      .where(
        and(
          eq(beings.householdId, input.householdId),
          eq(beings.species, PEER_SPECIES),
          eq(recognitionProfiles.modality, "tag"),
          eq(recognitionProfiles.model, PEER_MODEL),
        ),
      );

    for (const peer of known) {
      const secret = decryptBytes(peer.payload, this.dataKey);
      if (!recognize(secret, input.seen, at.getTime())) continue;

      await this.db
        .update(bonds)
        .set({
          familiarity: sql`least(1, ${bonds.familiarity} + 0.05)`,
          interactionCount: sql`${bonds.interactionCount} + 1`,
          lastSeenAt: at,
          updatedAt: at,
        })
        .where(and(eq(bonds.gosinoId, input.gosinoId), eq(bonds.beingId, peer.beingId)));
      await this.record(input.gosinoId, peer.beingId, at);
      return { beingId: peer.beingId, name: peer.name, known: true, eventType: "peer_greeted" };
    }
    return undefined;
  }

  /** Forgetting a peer is dropping its secret: we simply stop knowing them. */
  public async forget(beingId: string): Promise<boolean> {
    const gone = await this.db
      .delete(recognitionProfiles)
      .where(and(eq(recognitionProfiles.beingId, beingId), eq(recognitionProfiles.modality, "tag")))
      .returning({ id: recognitionProfiles.id });
    return gone.length > 0;
  }

  private async record(gosinoId: string, beingId: string, at: Date): Promise<void> {
    await this.db.insert(perceptionEvents).values({
      gosinoId,
      beingId,
      modality: "peer",
      confidence: 1,
      occurredAt: at,
    });
  }
}
