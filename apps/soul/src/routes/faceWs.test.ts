import { describe, expect, it } from "vitest";
import { forFrame, roomForSocket, SENSED_BY_THE_ROOM, tagFor } from "./faceWs.js";

/**
 * Who a frame reaches (ADR-036).
 *
 * Pure routing, so a unit test is the right instrument (TESTING_PLAYBOOK §1) —
 * and the decision it encodes is a budget rule, not a stylistic one: the senses
 * belong to the room, speech belongs to one. Fanning `heard_text` out would
 * multiply every sentence by the number of creatures present, against
 * CLAUDE.md rule 3.
 */

const senders = [
  { id: "ugo", member: { id: "ugo" }, traits: { talkativeness: 0.5, boldness: 0.5 } },
  { id: "nino", member: { id: "nino" }, traits: { talkativeness: 0.5, boldness: 0.5 } },
];

describe("forFrame", () => {
  it("gives the senses to everyone: the ROOM heard the bang", () => {
    for (const type of SENSED_BY_THE_ROOM) {
      expect(forFrame(JSON.stringify({ type }), senders), type).toHaveLength(2);
    }
  });

  it("gives speech to one, because every sentence would otherwise cost N calls", () => {
    const heard = forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), senders, 0.1);
    expect(heard).toHaveLength(1);
  });

  /**
   * ADR-040: this is the bug the owner saw. "One answers" was `slice(0, 1)`
   * over a roster ordered by `bornAt`, so the eldest answered every sentence
   * and the younger one was never heard from at all.
   */
  it("does not always give it to the same one", () => {
    const spoke = new Set<string>();
    for (const roll of [0.05, 0.3, 0.6, 0.95]) {
      const heard = forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), senders, roll);
      spoke.add(heard[0]?.member.id ?? "");
    }
    expect([...spoke].sort()).toEqual(["nino", "ugo"]);
  });

  it("does not choke on a frame that is not JSON", () => {
    // one gateway still gets it, so the error comes back through the normal
    // path instead of the socket silently swallowing it
    expect(forFrame("{ not json", senders)).toHaveLength(1);
  });

  it("treats an unknown frame type as one creature's business, not the room's", () => {
    expect(forFrame(JSON.stringify({ type: "something_new" }), senders)).toHaveLength(1);
  });

  it("leaves the lone creature's frames untagged, as every older face expects", () => {
    // `who: ""` would be noise standing for "the only one", and it broke three
    // integration tests that compare the greeting frame exactly — rightly, so:
    // a house with one creature must speak the wire format it always spoke.
    expect(tagFor("")).toBeUndefined();
    expect(tagFor("nino")).toBe("nino");
  });

  it("is harmless in a room with a single creature", () => {
    const alone = [{ id: "ugo", member: { id: "ugo" } }];
    expect(forFrame(JSON.stringify({ type: "noise", db: 70 }), alone)).toHaveLength(1);
    expect(forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), alone)).toHaveLength(1);
  });
});

/**
 * ADR-056: di quale stanza è lo schermo, e quindi di quale arredamento.
 *
 * La regola vale la pena di essere provata perché ha un caso che si dimentica:
 * il chiosco indirizzato `?gosino=` — la configurazione in uso oggi — non
 * chiede nessuna stanza, e senza l'eredità non vedrebbe mai un cuscino.
 */
describe("roomForSocket", () => {
  it("takes the room the screen asked for", () => {
    expect(roomForSocket({ stanza: "cucina" }, [{ where: "studio" }])).toBe("cucina");
  });

  it("inherits the room the creature lives in when nobody asked", () => {
    expect(roomForSocket(undefined, [{ where: "studio" }])).toBe("studio");
    expect(roomForSocket({}, [{ where: "studio" }])).toBe("studio");
  });

  it("has no room when there is neither, instead of picking one", () => {
    expect(roomForSocket(undefined, [{}])).toBeUndefined();
    expect(roomForSocket({ stanza: "" }, [])).toBeUndefined();
    // vuoto è come assente: un chiosco con `?stanza=` senza valore non deve
    // ereditare un mondo di arredi da una stringa vuota
    expect(roomForSocket({ stanza: "" }, [{ where: "" }])).toBeUndefined();
  });
});

/**
 * ADR-056: `used_prop` è l'unico frame che sale dicendo **chi** è stato.
 *
 * Senza questa regola verrebbe sorteggiato come si sorteggia chi risponde a una
 * frase, e in una stanza di due il sollievo dalla noia finirebbe metà delle
 * volte alla creatura che era rimasta ferma — cioè la psiche registrerebbe
 * un'esperienza che quella creatura non ha avuto.
 */
describe("forFrame e il frame che dice chi è stato", () => {
  const senders = [
    { id: "a", traits: { talkativeness: 0.5 } },
    { id: "b", traits: { talkativeness: 0.5 } },
  ];

  it("delivers a named frame to that one and to nobody else", () => {
    const targets = forFrame(JSON.stringify({ type: "used_prop", kind: "cushion", who: "b" }), senders);
    expect(targets.map((t) => t.id)).toEqual(["b"]);
  });

  it("falls back to one when the name means nothing here", () => {
    const targets = forFrame(
      JSON.stringify({ type: "used_prop", kind: "cushion", who: "chi-non-c-e" }),
      senders,
      0.1,
    );
    expect(targets).toHaveLength(1);
  });

  it("leaves the senses to the whole room, name or no name", () => {
    const targets = forFrame(JSON.stringify({ type: "noise", db: 90 }), senders);
    expect(targets).toHaveLength(2);
  });
});
