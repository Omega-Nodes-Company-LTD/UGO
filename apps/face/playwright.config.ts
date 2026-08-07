import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    // data-testid selectors only (TESTING_PLAYBOOK §4): set the attribute name
    testIdAttribute: "data-testid",
    // pre-provisioned browser wins over the version-pinned download when set
    ...(process.env.UGO_CHROMIUM_PATH !== undefined && {
      launchOptions: { executablePath: process.env.UGO_CHROMIUM_PATH },
    }),
  },
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
