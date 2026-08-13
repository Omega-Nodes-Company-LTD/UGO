import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  bonds,
  createDbClient,
  gosini,
  perceptionEvents,
  recognitionProfiles,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { advertise, generateDataKey, openCard } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
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
const scope = (house: TestHouse): { householdId: string; gosinoId: string } => ({
  householdId: house.id,
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
      .select({ species: beings.species, kind: beings.kind, householdId: beings.householdId })
      .from(beings)
      .where(eq(beings.id, met.beingId));
    expect(visitor?.species).toBe("gosino");
    expect(visitor?.kind).toBe("visitor");
    // it lives in OUR house: it is our perception of them, not their data
    expect(visitor?.householdId).toBe(rossi.id);
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
      .where(and(eq(beings.householdId, rossi.id), eq(beings.species, "gosino")));
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
      .where(and(eq(beings.householdId, rossi.id), eq(beings.species, "gosino")));
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
  it("refuses our stored secret to the other household's key", async () => {
    const card = await peerBianchi.introductionCard(bianchi.gosinoId, "curioso");
    const met = await peerRossi.accept({ ...scope(rossi), card });
    if (met === undefined) throw new Error("should be accepted");

    // same rows, wrong key: the sighting simply finds nothing it can open
    const impostor = new PeerService(db, bianchiKey);
    await expect(
      impostor.sighting({
        householdId: rossi.id,
        gosinoId: rossi.gosinoId,
        seen: advertise((await peerBianchi.keysFor(bianchi.gosinoId)).rotationSecret, Date.now()),
      }),
    ).rejects.toThrow();
  });
});
