import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
