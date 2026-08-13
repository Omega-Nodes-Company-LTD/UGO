import { faker } from "@faker-js/faker/locale/it";
import { MEMORY_KINDS, type MemoryKind } from "@ugo/shared";
import { embeddingFromSeed } from "./embedding.js";

export interface MemoryFactoryInput {
  /**
   * ADR-019: un ricordo e' della creatura, non del server. Obbligatorio da
   * ADR-048 tempo 2, in cui il `DEFAULT` su `memories.gosino_id` e' caduto:
   * ometterlo non finisce piu' silenziosamente sull'esemplare seminato.
   */
  gosinoId: string;
  kind: MemoryKind;
  text: string;
  embedding: number[];
  importance: number;
  sourceRefs: Record<string, unknown>;
}

export const MemoryFactory = {
  create(
    overrides: Partial<MemoryFactoryInput> & Pick<MemoryFactoryInput, "gosinoId">,
  ): MemoryFactoryInput {
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
