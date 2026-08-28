import {
  beings,
  bonds,
  events,
  gosini,
  perceptionEvents,
  recognitionProfiles,
  traitSets,
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
import { and, desc, eq, sql } from "drizzle-orm";
import { GENE_CATALOG } from "@ugo/psyche";

/**
 * Meeting another gosino (ADR-020).
 *
 * Nothing here calls the LLM, by design: two exemplars stopped at the same
 * traffic light must not write each other a novel at the owner's expense.
 * The greeting is local, and what it leaves behind is what the pack model
 * already knows how to hold — a visitor, a bond, an event.
 * Plus: horizontal cultural gene transfer (Orizzonti 1+4).
 */

/** How a peer's rotation secret is stored, so a future format is detectable. */
const PEER_MODEL = "peer-rotation-v1";
const PEER_SPECIES = "gosino";

/** Cultural gene keys — transferred horizontally at meetings (Orizzonti 1+4) */
const CULTURAL_GENE_KEYS = ["grunt_repertoire", "dialect", "dream_style"] as const;
type CulturalGeneKey = (typeof CULTURAL_GENE_KEYS)[number];

export interface PeerEncounter {
  /** the being row standing for the other creature, in OUR house */
  beingId: string;
  name: string;
  /** false the first time we ever meet them */
  known: boolean;
  eventType: "peer_met" | "peer_greeted";
  /** Cultural genes received from the other gosino (horizontal transfer) */
  culturalGenesReceived?: Record<CulturalGeneKey, number> | undefined;
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
    // Include our cultural genes in the introduction (horizontal transfer)
    const culturalGenes = await this.getCulturalGenes(gosinoId);
    return introduction(keys, row.name, row.generation, mood, at.getTime(), culturalGenes);
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
    // Include our cultural genes in the greeting (horizontal transfer)
    const culturalGenes = await this.getCulturalGenes(gosinoId);
    return greeting(keys, row.name, row.generation, mood, at.getTime(), culturalGenes);
  }

  /** Read the expressed cultural genes for this gosino from latest trait_sets. */
  private async getCulturalGenes(gosinoId: string): Promise<{ grunt_repertoire: number; dialect: number; dream_style: number }> {
    const [current] = await this.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    
    if (!current) {
      // No trait_sets yet — return defaults
      return {
        grunt_repertoire: GENE_CATALOG.grunt_repertoire.default,
        dialect: GENE_CATALOG.dialect.default,
        dream_style: GENE_CATALOG.dream_style.default,
      };
    }

    const traits = current.traits as Record<string, unknown>;
    return {
      grunt_repertoire: (traits.grunt_repertoire as number | undefined) ?? GENE_CATALOG.grunt_repertoire.default,
      dialect: (traits.dialect as number | undefined) ?? GENE_CATALOG.dialect.default,
      dream_style: (traits.dream_style as number | undefined) ?? GENE_CATALOG.dream_style.default,
    };
  }

  /**
   * Blend received cultural genes into our own genome (horizontal transfer).
   * Cultural genes are blend-type: we average our alleles with the received values.
   * This creates memetic drift — culture evolves through contact.
   */
  private async blendCulturalGenes(
    gosinoId: string,
    received: { grunt_repertoire: number; dialect: number; dream_style: number },
  ): Promise<void> {
    // Read current trait_sets (latest version)
    const [current] = await this.db
      .select({ id: traitSets.id, traits: traitSets.traits, version: traitSets.version })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    
    if (!current) return; // No genome yet

    const traits = current.traits as Record<string, unknown>;
    const alleles = (traits.alleles as Record<string, [number, number]> | undefined) ?? {};
    const newAlleles = { ...alleles };

    // Blend each cultural gene: average our expressed value with received
    for (const key of CULTURAL_GENE_KEYS) {
      const value = traits[key];
      const currentExpressed = typeof value === "number" ? value : GENE_CATALOG[key].default;
      const blended = (currentExpressed + received[key]) / 2;
      // For blend genes, both alleles become the blended value (cultural convergence)
      newAlleles[key] = [blended, blended];
    }

    // Get accountId (must exist for a valid gosino)
    const [account] = await this.db
      .select({ accountId: gosini.accountId })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    if (!account) return; // Should not happen for a valid gosino

    // Write new trait_sets version
    await this.db.insert(traitSets).values({
      gosinoId,
      accountId: account.accountId,
      version: current.version + 1,
      traits: { ...traits, alleles: newAlleles },
      parentTraitSetId: current.id,
      mutationNote: `cultural_drift_from_peer:${JSON.stringify(received)}`,
    });
  }

  /**
   * An introduction accepted by the owner: the other creature becomes a
   * visitor of this pack, and we keep the secret that lets us know it again.
   * Also performs horizontal cultural gene transfer (Orizzonti 1+4).
   */
  public async accept(
    input: { accountId: string; gosinoId: string; card: SignedCard },
    at: Date = new Date(),
  ): Promise<PeerEncounter | undefined> {
    const card = openCard(input.card, at.getTime());
    if (card?.rotationSecret === undefined) return undefined;

    // Extract cultural genes from the other gosino's card (horizontal transfer)
    const culturalGenesReceived = card.culturalGenes
      ? { ...card.culturalGenes }
      : undefined;

    // If we received cultural genes, blend them into our own genome
    // AND write event for the dream to process later (memetic drift)
    if (culturalGenesReceived) {
      await this.blendCulturalGenes(input.gosinoId, culturalGenesReceived);
      // Write event for cultural_drift dream step
      await this.db.insert(events).values({
        gosinoId: input.gosinoId,
        source: "peer",
        type: "cultural_gene_received",
        payload: culturalGenesReceived,
        ts: at,
      });
    }

    const [being] = await this.db
      .insert(beings)
      .values({
        accountId: input.accountId,
        displayName: card.name,
        species: PEER_SPECIES,
        kind: "visitor",
      })
      .returning({ id: beings.id });
    if (being === undefined) throw new Error("visitor was not created");

    await this.db.insert(recognitionProfiles).values({
      accountId: input.accountId,
      beingId: being.id,
      modality: "tag",
      model: PEER_MODEL,
      dimensions: 0,
      payload: encryptBytes(Buffer.from(card.rotationSecret, "base64"), this.dataKey),
      sampleCount: 1,
    });
    await this.db.insert(bonds).values({
      accountId: input.accountId,
      gosinoId: input.gosinoId,
      beingId: being.id,
      familiarity: 0.1,
    });
    await this.record(input.gosinoId, being.id, at);
    return { beingId: being.id, name: card.name, known: false, eventType: "peer_met", culturalGenesReceived };
  }

  /**
   * Someone announced themselves nearby. We try the secrets we were given —
   * a handful, by design — and greet only if one of them matches.
   */
  public async sighting(
    input: { accountId: string; gosinoId: string; seen: Pseudonym },
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
          eq(beings.accountId, input.accountId),
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
