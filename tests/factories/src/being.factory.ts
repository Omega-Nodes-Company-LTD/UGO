import { faker } from "@faker-js/faker/locale/it";
import { embeddingFromSeed } from "./embedding.js";

export interface BeingFactoryInput {
  /**
   * ADR-019: a being belongs to a house, never to the server.
   *
   * This was optional while the `DEFAULT` on `beings.account_id` was still
   * there as a backwards-compatibility net, with a comment saying that the day
   * it dropped, leaving it out would stop compiling. That day is ADR-048 tempo
   * 2, and it did.
   */
  accountId: string;
  displayName: string;
  species: string;
  kind: "resident" | "visitor" | "unknown";
  isMinor: boolean;
  noVision: boolean;
  noAudio: boolean;
  aliases: string[];
  notes: string | null;
  embedding: number[];
}

/**
 * Fake beings only (TESTING_PLAYBOOK §5, SECURITY_COMPLIANCE §10): never real
 * PII. Defaults to a human resident; override `species` for the rest of the
 * pack — `BeingFactory.create({ species: "dog", displayName: "Argo" })`.
 */
export const BeingFactory = {
  create(
    overrides: Partial<BeingFactoryInput> & Pick<BeingFactoryInput, "accountId">,
  ): BeingFactoryInput {
    return {
      displayName: faker.person.fullName(),
      species: "human",
      kind: "resident",
      isMinor: false,
      noVision: false,
      noAudio: false,
      aliases: [faker.person.firstName()],
      notes: faker.lorem.sentence(),
      embedding: embeddingFromSeed(faker.number.int({ min: 1, max: 2 ** 31 - 1 })),
      ...overrides,
    };
  },
};
