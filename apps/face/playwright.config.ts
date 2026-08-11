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
    launchOptions: {
      ...(process.env.UGO_CHROMIUM_PATH !== undefined && {
        executablePath: process.env.UGO_CHROMIUM_PATH,
      }),
      args: [
        // fake mic so the portable recorder runs for real in headless e2e
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        // software WebGL: without these the 3D body (ADR-026) silently falls
        // back to the 2D canvas here, and the e2e would stop covering it
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    // without these the server's own output is swallowed, and a startup
    // failure is indistinguishable from a slow boot: the run just times out
    // after two minutes saying nothing about why
    stdout: "pipe",
    stderr: "pipe",
  },
});
