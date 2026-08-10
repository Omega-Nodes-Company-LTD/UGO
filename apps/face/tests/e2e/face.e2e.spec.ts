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

test("a tap wakes attention: alert state, mood refresh and Glyph pattern", async ({ page }) => {
  await openFace(page);
  await page.getByTestId("face-canvas").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "alert");
  await expect(page.getByTestId("mood-label")).not.toHaveText("");
  // §4.1: the state is also readable across the room, on the Glyph LEDs
  await expect(page.getByTestId("app")).toHaveAttribute("data-glyph", "alert");
  expect(await page.evaluate(() => window.__ugoGlyph.current())).toBe("alert");
  // no Glyph SDK in a browser: it must degrade silently, not throw
  expect(await page.evaluate(() => window.__ugoGlyph.available())).toBe(false);
});

test("heard text runs the full chat loop and the reply is shown", async ({ page }) => {
  await openFace(page);
  await page.evaluate(() => {
    window.__ugoFace.send({ type: "heard_text", text: "ciao UGO, mi senti?" });
  });
  await expect(page.getByTestId("speak-text")).toContainText("Grunf", { timeout: 30_000 });
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
});

test("messages sent while offline survive a kiosk reload and flush on reconnect", async ({
  page,
}) => {
  const dead = encodeURIComponent("ws://127.0.0.1:1/v1/face");
  await page.goto(`/?soul=${dead}`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "false");

  await page.evaluate(async () => {
    window.__ugoFace.send({ type: "tap" });
    window.__ugoFace.send({ type: "shake" });
    await window.__ugoFace.queuedFresh();
  });
  expect(await page.evaluate(() => window.__ugoFace.queued())).toBe(2);

  // Android kills the tab, the app updates, someone pulls to refresh:
  // an in-memory queue would lose exactly the data that cannot be remade
  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "false");
  await expect.poll(() => page.evaluate(() => window.__ugoFace.queuedFresh())).toBe(2);

  // reconnect to a live soul: the backlog drains and the queue empties
  await page.goto(`/?soul=${encodeURIComponent(soulWs())}`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
  await expect.poll(() => page.evaluate(() => window.__ugoFace.queuedFresh())).toBe(0);
});
