import { expect, test, type Page } from "@playwright/test";

// Real browser → real WS → real soul (child process) → real Postgres/Ollama,
// provider stubbed at network level. Selectors are data-testid only.

const soulWs = (): string => {
  const url = process.env.UGO_E2E_SOUL_WS;
  if (url === undefined) throw new Error("global setup did not export UGO_E2E_SOUL_WS");
  return url;
};

const openFace = async (page: Page): Promise<void> => {
  await page.goto(`/?soul=${encodeURIComponent(soulWs())}`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
};

test("the face connects and shows UGO's mood", async ({ page }) => {
  await openFace(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("mood-label")).not.toHaveText("");
  await expect(page.getByTestId("conn-status")).toHaveText("connesso");
});

test("a tap wakes attention: alert state and mood refresh from soul", async ({ page }) => {
  await openFace(page);
  await page.getByTestId("face-canvas").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "alert");
  await expect(page.getByTestId("mood-label")).not.toHaveText("");
});

test("heard text runs the full chat loop and the reply is shown", async ({ page }) => {
  await openFace(page);
  await page.evaluate(() => {
    window.__ugoFace.send({ type: "heard_text", text: "ciao UGO, mi senti?" });
  });
  await expect(page.getByTestId("speak-text")).toContainText("Grunf", { timeout: 30_000 });
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
});

test("messages sent while offline are queued, not lost", async ({ page }) => {
  await page.goto(`/?soul=${encodeURIComponent("ws://127.0.0.1:1/v1/face")}`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "false");
  const queued = await page.evaluate(() => {
    window.__ugoFace.send({ type: "tap" });
    window.__ugoFace.send({ type: "shake" });
    return window.__ugoFace.queued();
  });
  expect(queued).toBe(2);
});
