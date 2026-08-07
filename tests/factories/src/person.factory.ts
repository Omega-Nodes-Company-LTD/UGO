import { faker } from "@faker-js/faker/locale/it";
import { embeddingFromSeed } from "./embedding.js";

export interface PersonFactoryInput {
  displayName: string;
  aliases: string[];
  notes: string | null;
  embedding: number[];
}

/** Fake people only (TESTING_PLAYBOOK §5, SECURITY_COMPLIANCE §10): never real PII. */
export const PersonFactory = {
  create(overrides: Partial<PersonFactoryInput> = {}): PersonFactoryInput {
    return {
      displayName: faker.person.fullName(),
      aliases: [faker.person.firstName()],
      notes: faker.lorem.sentence(),
      embedding: embeddingFromSeed(faker.number.int({ min: 1, max: 2 ** 31 - 1 })),
      ...overrides,
    };
  },
};
