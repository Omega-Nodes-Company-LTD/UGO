import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    // data-testid selectors only (TESTING_PLAYBOOK §4)
    testIdAttribute: "data-testid",
    launchOptions: {
      ...(process.env.UGO_CHROMIUM_PATH !== undefined && {
        executablePath: process.env.UGO_CHROMIUM_PATH,
      }),
    },
  },
  webServer: {
    // build già fatto da turbo (test:e2e dependsOn build); il server parte col
    // segreto e l'URL di soul che il global-setup ha appena messo in env
    command: "npx next start -p 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    // valori fissi, condivisi col global-setup: il webServer non vede le
    // mutazioni di process.env fatte lì
    env: {
      SOUL_URL: "http://127.0.0.1:3988",
      UGO_RECEPTION_TOKEN: "e2e-reception-secret",
    },
  },
});
