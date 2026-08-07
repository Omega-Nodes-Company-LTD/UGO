import { faker } from "@faker-js/faker/locale/it";
import { MEMORY_KINDS, type MemoryKind } from "@ugo/shared";
import { embeddingFromSeed } from "./embedding.js";

export interface MemoryFactoryInput {
  kind: MemoryKind;
  text: string;
  embedding: number[];
  importance: number;
  sourceRefs: Record<string, unknown>;
}

export const MemoryFactory = {
  create(overrides: Partial<MemoryFactoryInput> = {}): MemoryFactoryInput {
    return {
      kind: faker.helpers.arrayElement(MEMORY_KINDS),
      text: faker.lorem.sentences({ min: 1, max: 2 }),
      embedding: embeddingFromSeed(faker.number.int({ min: 1, max: 2 ** 31 - 1 })),
      importance: faker.number.float({ min: 0, max: 1, fractionDigits: 3 }),
      sourceRefs: { eventIds: [faker.string.uuid()] },
      ...overrides,
    };
  },
};
