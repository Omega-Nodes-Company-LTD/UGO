import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { expect, test, type Page } from "@playwright/test";
import { createDbClient, events } from "@ugo/db";
import { eq } from "drizzle-orm";

// Portable mode (Fase 4): real recorder over the fake mic, real presigned
// upload to real MinIO, privacy mode that REALLY kills the microphone.

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`global setup did not export ${name}`);
  return value;
};

const openPortable = async (page: Page): Promise<void> => {
  const soul = encodeURIComponent(env("UGO_E2E_SOUL_WS"));
  await page.goto(`/?mode=portable&soul=${soul}&contact=https://example.test/ugo`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
  await expect(page.getByTestId("app")).toHaveAttribute("data-mode", "portable");
};

test("REC is unmistakable while recording and the blob lands in inbox/", async ({ page }) => {
  await openPortable(page);
  await expect(page.getByTestId("rec-banner")).toBeHidden();

  await page.evaluate(() => window.__ugoPortable.startRec());
  await expect(page.getByTestId("rec-banner")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-recording", "true");

  await page.waitForTimeout(1500); // let the fake mic produce real chunks
  await page.evaluate(() => window.__ugoPortable.stopRec());
  await expect(page.getByTestId("rec-banner")).toBeHidden();
  expect(await page.evaluate(() => window.__ugoPortable.pending())).toBe(0); // uploaded

  const s3 = new S3Client({
    endpoint: env("UGO_E2E_S3_ENDPOINT"),
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env("UGO_E2E_S3_ACCESS_KEY"),
      secretAccessKey: env("UGO_E2E_S3_SECRET_KEY"),
    },
  });
  const listing = await s3.send(new ListObjectsV2Command({ Bucket: "ugo-audio", Prefix: "inbox/" }));
  const keys = (listing.Contents ?? []).map((object) => object.Key ?? "");
  expect(keys.some((key) => key.endsWith("_giro.webm"))).toBe(true);
});

test("privacy mode really stops microphone and recording (verificato, §4.2)", async ({ page }) => {
  await openPortable(page);
  await page.evaluate(() => window.__ugoPortable.startRec());
  await expect(page.getByTestId("rec-banner")).toBeVisible();

  await page.getByTestId("btn-privacy").click();
  await expect(page.getByTestId("privacy-overlay")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-privacy", "on");
  await expect(page.getByTestId("rec-banner")).toBeHidden();

  const recorderState = await page.evaluate(() => window.__ugoPortable.recorderState());
  const trackStates = await page.evaluate(() => window.__ugoPortable.trackStates());
  expect(recorderState).toBe("inactive");
  expect(trackStates.length).toBeGreaterThan(0);
  expect(trackStates.every((state) => state === "ended")).toBe(true);

  // recording refuses to start while privacy is on
  await page.evaluate(() => window.__ugoPortable.startRec());
  expect(await page.evaluate(() => window.__ugoPortable.recorderState())).toBe("inactive");
});

test("business card: QR overlay shows and lead_contact is recorded", async ({ page }) => {
  await openPortable(page);
  await page.getByTestId("btn-card").click();
  await expect(page.getByTestId("qr-overlay")).toBeVisible();
  const hasQrPixels = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas");
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray();
    return Array.from(data).some((value, i) => i % 4 !== 3 && value < 128); // dark modules exist
  });
  expect(hasQrPixels).toBe(true);

  const db = createDbClient(env("UGO_E2E_DATABASE_URL"));
  try {
    await expect
      .poll(async () => {
        const rows = await db.select().from(events).where(eq(events.type, "lead_contact"));
        return rows.length;
      })
      .toBeGreaterThan(0);
  } finally {
    await db.$client.end();
  }
});
