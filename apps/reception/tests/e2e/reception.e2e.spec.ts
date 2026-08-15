import { expect, test, type Page } from "@playwright/test";

/**
 * La suite dal lato del cliente (ADR-051/052): la porta, il branco, Parla in
 * fallback tastiera (headless non ha la Web Speech API — ed è esattamente il
 * degrado dichiarato di ADR-053), i ticket, i lavori, l'uscita.
 */

const customerToken = (): string => {
  const value = process.env.UGO_E2E_CUSTOMER_TOKEN;
  if (value === undefined) throw new Error("global-setup did not seed the customer token");
  return value;
};

async function enter(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("gate-token").fill(customerToken());
  await page.getByTestId("gate-go").click();
  await expect(page).toHaveURL(/\/branco/);
}

test("the wrong token stays at the door, the right one meets the pack", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("gate-token").fill("non-un-token");
  await page.getByTestId("gate-go").click();
  await expect(page.getByTestId("gate-msg")).toContainText("non apre la reception");

  await enter(page);
  const pack = page.getByTestId("pick-gosino");
  await expect(pack).toHaveCount(1);
  await expect(pack.first()).toContainText("Ugo");
});

test("a chat round-trip from the keyboard, and the transcript shows it", async ({ page }) => {
  await enter(page);
  await page.getByTestId("pick-gosino").first().click();
  await expect(page).toHaveURL(/\/parla/);
  // la tastiera funziona sempre, con o senza Web Speech API (ADR-053): il
  // fallback dichiarato compare solo dove l'API manca, e qui non si assume
  await expect(page.getByTestId("composer")).toBeVisible();

  await page.getByTestId("composer").fill("Dove sta la funzione di avvio?");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("thread")).toContainText("Dove sta la funzione di avvio?");
  await expect(page.getByTestId("thread")).toContainText("main.ts", { timeout: 20_000 });

  // ADR-058: la mela vive sotto l'ultima risposta, e il conto scende davvero
  await expect(page.getByTestId("reward-note")).toContainText("davvero ottima");
  await page.getByTestId("reward").click();
  await expect(page.getByTestId("thread")).toContainText("Gliel'hai data");
});

test("«apri un ticket» collects the request and it lands in the tickets tab", async ({ page }) => {
  await enter(page);
  await page.getByTestId("pick-gosino").first().click();
  await page
    .getByTestId("composer")
    .fill("Apri un ticket: vorrei il bottone di export in CSV");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("thread")).toContainText("ho aperto il ticket", {
    timeout: 20_000,
  });

  await page.goto("/ticket");
  const card = page.getByTestId("ticket-card").first();
  await expect(card).toContainText("export in CSV");
  await expect(card).toContainText("aperto");

  // il dettaglio, e la risposta che si accoda
  await card.click();
  await expect(page.getByTestId("ticket-body")).toContainText("export in CSV");
  await page.getByTestId("ticket-reply").fill("Meglio se esporta anche in Excel");
  await page.getByTestId("ticket-reply-go").click();
  await expect(page.getByTestId("thread")).toContainText("anche in Excel");
});

test("the works page shows the repository and its state", async ({ page }) => {
  await enter(page);
  await page.goto("/lavori");
  const card = page.getByTestId("work-card").first();
  await expect(card).toContainText("studio/progetto");
  await expect(card).toContainText("abc1234");
});

test("leaving forgets the token on this device", async ({ page }) => {
  await enter(page);
  await page.goto("/impostazioni");
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/branco");
  // senza token il branco rimanda alla porta
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
});
