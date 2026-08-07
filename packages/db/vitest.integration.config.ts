import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    // First run may pull the pgvector image: allow for it.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One container per suite; suites run sequentially to keep resource usage flat.
    fileParallelism: false,
  },
});
