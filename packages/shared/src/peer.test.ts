import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  advertise,
  EPOCH_MS,
  epochAt,
  generateGosinoKeys,
  greeting,
  introduction,
  openCard,
  recognize,
  signCard,
} from "./peer.js";

const NOW = Date.UTC(2026, 7, 10, 16, 30);

describe("the advertisement a stranger cannot follow", () => {
  it("is different every time, so two sightings cannot be linked", () => {
    const keys = generateGosinoKeys();
    const first = advertise(keys.rotationSecret, NOW);
    const second = advertise(keys.rotationSecret, NOW);
    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(first.tag.equals(second.tag)).toBe(false);
  });

  it("is recognized only by someone who was given the secret", () => {
    const ugo = generateGosinoKeys();
    const stranger = generateGosinoKeys();
    const seen = advertise(ugo.rotationSecret, NOW);

    expect(recognize(ugo.rotationSecret, seen, NOW)).toBe(true);
    expect(recognize(stranger.rotationSecret, seen, NOW)).toBe(false);
  });

  it("forgives a clock that disagrees by a few minutes", () => {
    const keys = generateGosinoKeys();
    const seen = advertise(keys.rotationSecret, NOW);
    expect(recognize(keys.rotationSecret, seen, NOW + EPOCH_MS)).toBe(true);
    expect(recognize(keys.rotationSecret, seen, NOW - EPOCH_MS)).toBe(true);
  });

  it("stops being recognizable much later, so a recording is not a meeting", () => {
    const keys = generateGosinoKeys();
    const seen = advertise(keys.rotationSecret, NOW);
    expect(recognize(keys.rotationSecret, seen, NOW + 6 * EPOCH_MS)).toBe(false);
  });

  // revocation, as promised in ADR-020: unilateral and silent
  it("forgets a peer the moment its secret is dropped", () => {
    const friend = generateGosinoKeys();
    const known = new Map([["ugo-vicino", friend.rotationSecret]]);
    const seen = advertise(friend.rotationSecret, NOW);

    const knows = (): boolean =>
      [...known.values()].some((secret) => recognize(secret, seen, NOW));
    expect(knows()).toBe(true);
    known.delete("ugo-vicino");
    expect(knows()).toBe(false);
  });
});

describe("the greeting card", () => {
  it("round-trips when it is authentic and current", () => {
    const keys = generateGosinoKeys();
    const card = greeting(keys, "ugo-studio", 0, "sveglio", NOW);
    const opened = openCard(card, NOW);
    expect(opened?.name).toBe("ugo-studio");
    expect(opened?.mood).toBe("sveglio");
  });

  it("carries the creature and nothing of the family", () => {
    const keys = generateGosinoKeys();
    const opened = openCard(greeting(keys, "ugo-cucina", 1, "stanco", NOW), NOW);
    if (opened === undefined) throw new Error("card should open");
    // the shape IS the privacy boundary: no owner, no pack, no place
    expect(Object.keys(opened).sort()).toEqual(
      ["epoch", "generation", "mood", "name", "signingPublicKey"].sort(),
    );
  });

  it("refuses a card whose contents were edited after signing", () => {
    const keys = generateGosinoKeys();
    const signed = greeting(keys, "ugo-studio", 0, "sveglio", NOW);
    const tampered = { ...signed, card: { ...signed.card, name: "ugo-di-un-altro" } };
    expect(openCard(tampered, NOW)).toBeUndefined();
  });

  it("refuses a card signed by nobody in particular", () => {
    const mine = generateGosinoKeys();
    const impostor = generateGosinoKeys();
    // the impostor claims my key but can only sign with its own
    const forged = signCard(
      {
        name: "ugo-studio",
        generation: 0,
        mood: "sveglio",
        signingPublicKey: mine.signingPublicKey.toString("base64"),
        epoch: epochAt(NOW),
      },
      impostor.signingPrivateKey,
    );
    expect(openCard(forged, NOW)).toBeUndefined();
  });

  it("refuses a card replayed a day later", () => {
    const keys = generateGosinoKeys();
    const signed = greeting(keys, "ugo-studio", 0, "sveglio", NOW);
    expect(openCard(signed, NOW + 24 * 60 * 60 * 1000)).toBeUndefined();
  });

  it("survives a garbage key without throwing at whoever is holding it", () => {
    expect(
      openCard(
        {
          card: {
            name: "x",
            generation: 0,
            mood: "x",
            signingPublicKey: randomBytes(20).toString("base64"),
            epoch: epochAt(NOW),
          },
          signature: randomBytes(64).toString("base64"),
        },
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe("the introduction, which is the only way to become known", () => {
  it("hands over the secret once, and the everyday greeting never does", () => {
    const keys = generateGosinoKeys();
    const first = openCard(introduction(keys, "ugo-studio", 0, "curioso", NOW), NOW);
    const later = openCard(greeting(keys, "ugo-studio", 0, "curioso", NOW), NOW);

    expect(first?.rotationSecret).toBe(keys.rotationSecret.toString("base64"));
    expect(later?.rotationSecret).toBeUndefined();
  });

  it("lets the two recognize each other afterwards, and only then", () => {
    const mio = generateGosinoKeys();
    const suo = generateGosinoKeys();

    // before the introduction they are two strangers in a park
    expect(recognize(suo.rotationSecret, advertise(mio.rotationSecret, NOW), NOW)).toBe(false);

    const presented = openCard(introduction(mio, "ugo-studio", 0, "curioso", NOW), NOW);
    if (presented?.rotationSecret === undefined) throw new Error("introduction should carry it");
    const learned = Buffer.from(presented.rotationSecret, "base64");

    expect(recognize(learned, advertise(mio.rotationSecret, NOW), NOW)).toBe(true);
    expect(recognize(learned, advertise(suo.rotationSecret, NOW), NOW)).toBe(false);
  });
});
