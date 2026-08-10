import { faker } from "@faker-js/faker/locale/it";
import { embeddingFromSeed } from "./embedding.js";

export interface BeingFactoryInput {
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
  create(overrides: Partial<BeingFactoryInput> = {}): BeingFactoryInput {
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
