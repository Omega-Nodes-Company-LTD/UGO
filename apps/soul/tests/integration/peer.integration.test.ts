import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  bonds,
  createDbClient,
  events,
  gosini,
  perceptionEvents,
  recognitionProfiles,
  runMigrations,
  traitSets,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { advertise, generateDataKey, openCard } from "@ugo/shared";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PeerService } from "../../src/services/peerService.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-020 at the park: family Rossi's exemplar and family Bianchi's, meeting
 * for real in a real database. The questions are the ones an owner would ask.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;

const rossiKey = generateDataKey();
const bianchiKey = generateDataKey();
let rossi: TestHouse;
let bianchi: TestHouse;
let peerRossi: PeerService;
let peerBianchi: PeerService;

/** what PeerService asks for: the house it acts on behalf of, and which exemplar */
const scope = (house: TestHouse): { accountId: string; gosinoId: string } => ({
  accountId: house.id,
  gosinoId: house.gosinoId,
});

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  rossi = await createHouse(db, "rossi");
  bianchi = await createHouse(db, "bianchi");
  peerRossi = new PeerService(db, rossiKey);
  peerBianchi = new PeerService(db, bianchiKey);
});

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("the creature's identity", () => {
  it("is minted once and kept encrypted at rest", async () => {
    const first = await peerRossi.keysFor(rossi.gosinoId);
    const again = await peerRossi.keysFor(rossi.gosinoId);
    expect(again.signingPublicKey.equals(first.signingPublicKey)).toBe(true);
    expect(again.rotationSecret.equals(first.rotationSecret)).toBe(true);

    const [row] = await db
      .select({ priv: gosini.signingPrivateKey, secret: gosini.rotationSecret })
      .from(gosini)
      .where(eq(gosini.id, rossi.gosinoId));
    // what sits in the column must not be the secret itself
    expect(row?.priv?.equals(first.signingPrivateKey)).toBe(false);
    expect(row?.secret?.equals(first.rotationSecret)).toBe(false);
  });
});

describe("two strangers in a park", () => {
  it("does not greet a gosino it was never introduced to", async () => {
    await peerRossi.setEnabled(rossi.gosinoId, true);
    const theirs = await peerBianchi.advertisement(bianchi.gosinoId);
    expect(
      await peerRossi.sighting({ ...scope(rossi), seen: theirs }),
    ).toBeUndefined();
  });

  it("does not even look while encounters are switched off", async () => {
    await peerRossi.setEnabled(rossi.gosinoId, false);
    const theirs = await peerBianchi.advertisement(bianchi.gosinoId);
    expect(await peerRossi.sighting({ ...scope(rossi), seen: theirs })).toBeUndefined();
    await peerRossi.setEnabled(rossi.gosinoId, true);
  });
});

describe("after the owners introduce them", () => {
  it("takes the other in as a visitor of the pack, not as one of the family", async () => {
    const card = await peerBianchi.introductionCard(bianchi.gosinoId, "curioso");
    const met = await peerRossi.accept({ ...scope(rossi), card });
    if (met === undefined) throw new Error("the introduction should be accepted");

    expect(met.known).toBe(false);
    expect(met.eventType).toBe("peer_met");

    const [visitor] = await db
      .select({ species: beings.species, kind: beings.kind, accountId: beings.accountId })
      .from(beings)
      .where(eq(beings.id, met.beingId));
    expect(visitor?.species).toBe("gosino");
    expect(visitor?.kind).toBe("visitor");
    // it lives in OUR house: it is our perception of them, not their data
    expect(visitor?.accountId).toBe(rossi.id);
  });

  it("recognizes them the next time, and the bond grows", async () => {
    const before = await db
      .select({ familiarity: bonds.familiarity, count: bonds.interactionCount })
      .from(bonds)
      .where(eq(bonds.gosinoId, rossi.gosinoId));

    const seen = await peerBianchi.advertisement(bianchi.gosinoId);
    const greeted = await peerRossi.sighting({ ...scope(rossi), seen });
    if (greeted === undefined) throw new Error("an acquaintance should be recognized");

    expect(greeted.known).toBe(true);
    expect(greeted.eventType).toBe("peer_greeted");
    expect(greeted.name).toBe("ugo-bianchi");

    const after = await db
      .select({ familiarity: bonds.familiarity, count: bonds.interactionCount })
      .from(bonds)
      .where(eq(bonds.gosinoId, rossi.gosinoId));
    expect(after[0]?.familiarity ?? 0).toBeGreaterThan(before[0]?.familiarity ?? 0);
    expect(after[0]?.count ?? 0).toBe((before[0]?.count ?? 0) + 1);
  });

  it("writes the encounter down as perception, with no content attached", async () => {
    const events = await db
      .select({ modality: perceptionEvents.modality, gosinoId: perceptionEvents.gosinoId })
      .from(perceptionEvents)
      .where(eq(perceptionEvents.gosinoId, rossi.gosinoId));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.modality === "peer")).toBe(true);
  });

  it("keeps the secret it was given as ciphertext, like any other biometric", async () => {
    const [profile] = await db
      .select({ payload: recognitionProfiles.payload, model: recognitionProfiles.model })
      .from(recognitionProfiles)
      .innerJoin(beings, eq(beings.id, recognitionProfiles.beingId))
      .where(and(eq(beings.accountId, rossi.id), eq(beings.species, "gosino")));
    const theirs = await peerBianchi.keysFor(bianchi.gosinoId);
    expect(profile?.model).toBe("peer-rotation-v1");
    expect(profile?.payload.equals(theirs.rotationSecret)).toBe(false);
  });
});

describe("the everyday card, and what it refuses", () => {
  it("never hands the secret out again after the introduction", async () => {
    const daily = await peerRossi.greetingCard(rossi.gosinoId, "sveglio");
    const opened = openCard(daily, Date.now());
    expect(opened?.rotationSecret).toBeUndefined();
    expect(opened?.name).toBe("ugo-rossi");
  });

  it("refuses an introduction whose card was not signed by its own key", async () => {
    const card = await peerBianchi.introductionCard(bianchi.gosinoId, "curioso");
    const tampered = { ...card, card: { ...card.card, name: "ugo-di-un-impostore" } };
    expect(await peerRossi.accept({ ...scope(rossi), card: tampered })).toBeUndefined();
  });

  it("refuses a plain greeting as an introduction: no secret, no acquaintance", async () => {
    const daily = await peerBianchi.greetingCard(bianchi.gosinoId, "sveglio");
    expect(await peerRossi.accept({ ...scope(rossi), card: daily })).toBeUndefined();
  });
});

describe("forgetting", () => {
  it("stops recognizing them, and does not touch the other family", async () => {
    const [visitor] = await db
      .select({ id: beings.id })
      .from(beings)
      .where(and(eq(beings.accountId, rossi.id), eq(beings.species, "gosino")));
    if (visitor === undefined) throw new Error("there should be a visitor to forget");

    expect(await peerRossi.forget(visitor.id)).toBe(true);
    const seen = await peerBianchi.advertisement(bianchi.gosinoId);
    expect(await peerRossi.sighting({ ...scope(rossi), seen })).toBeUndefined();

    // unilateral: the neighbours' own exemplar is untouched by our forgetting
    const theirs = await peerBianchi.keysFor(bianchi.gosinoId);
    expect(theirs.rotationSecret.length).toBe(32);
  });
});

describe("the neighbours cannot read what we wrote about them", () => {
  it("refuses our stored secret to the other account's key", async () => {
    const card = await peerBianchi.introductionCard(bianchi.gosinoId, "curioso");
    const met = await peerRossi.accept({ ...scope(rossi), card });
    if (met === undefined) throw new Error("should be accepted");

    // same rows, wrong key: the sighting simply finds nothing it can open
    const impostor = new PeerService(db, bianchiKey);
    await expect(
      impostor.sighting({
        accountId: rossi.id,
        gosinoId: rossi.gosinoId,
        seen: advertise((await peerBianchi.keysFor(bianchi.gosinoId)).rotationSecret, Date.now()),
      }),
    ).rejects.toThrow();
  });
});

describe("trasferimento orizzontale dei geni culturali (Orizzonti 1+4)", () => {
  const culturalTraits = (values: number[]): Record<string, unknown> => {
    const [grunt_repertoire, dialect, dream_style] = values;
    return {
      grunt_repertoire,
      dialect,
      dream_style,
      alleles: {
        grunt_repertoire: [grunt_repertoire, grunt_repertoire],
        dialect: [dialect, dialect],
        dream_style: [dream_style, dream_style],
      },
    };
  };

  it("accettare una card che porta geni culturali scrive l'evento peer e fa convergere la cultura", async () => {
    // Bianchi ha una cultura ricca; Rossi una povera. Il trait_set esiste per
    // entrambi come in produzione (il sogno lo semina).
    await db.insert(traitSets).values([
      {
        gosinoId: bianchi.gosinoId,
        accountId: bianchi.id,
        version: 1,
        traits: culturalTraits([0.9, 0.8, 0.7]),
      },
      {
        gosinoId: rossi.gosinoId,
        accountId: rossi.id,
        version: 1,
        traits: culturalTraits([0.1, 0.1, 0.1]),
      },
    ]);

    const card = await peerBianchi.introductionCard(bianchi.gosinoId, "curioso");
    expect(card.card.culturalGenes).toBeDefined();

    // Rossi accetta: l'introduzione trasferisce la cultura in ORIZZONTALE
    const met = await peerRossi.accept({ ...scope(rossi), card });
    if (met === undefined) throw new Error("should be accepted");
    expect(met.culturalGenesReceived).toEqual({ grunt_repertoire: 0.9, dialect: 0.8, dream_style: 0.7 });

    // 1) l'evento `peer` c'è, con type cultural_gene_received e il payload giusto
    // (può essercene più d'uno storicità: i test precedenti hanno già incontrato
    // Bianchi quando non aveva una cultura propria — si legge l'ULTIMO)
    const [event] = await db
      .select({ source: events.source, type: events.type, payload: events.payload })
      .from(events)
      .where(and(eq(events.gosinoId, rossi.gosinoId), eq(events.type, "cultural_gene_received")))
      .orderBy(desc(events.ts))
      .limit(1);
    expect(event?.source).toBe("peer");
    expect(event?.payload).toEqual({ grunt_repertoire: 0.9, dialect: 0.8, dream_style: 0.7 });

    // 2) il genoma di Rossi è cresciuto di una versione, con la nota di drift
    const [latest] = await db
      .select({ version: traitSets.version, mutationNote: traitSets.mutationNote })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, rossi.gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    expect(latest?.version).toBe(2);
    expect(latest?.mutationNote).toContain("cultural_drift_from_peer");

    // 3) la convergenza: gli ALLELI di Rossi si sono avviati verso quelli di
    // Bianchi — è lì che la cultura abita (`blendCulturalGenes` media gli
    // alleli del gene, e il campo top-level resta quello che era)
    const [rolledBack] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, rossi.gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    const traits = rolledBack?.traits as Record<string, unknown>;
    const alleles = (traits.alleles as Record<string, [number, number]> | undefined) ?? {};
    expect(alleles.grunt_repertoire[0]).toBeCloseTo((0.1 + 0.9) / 2, 5);
    expect(alleles.grunt_repertoire[1]).toBeCloseTo((0.1 + 0.9) / 2, 5);
  });
});
