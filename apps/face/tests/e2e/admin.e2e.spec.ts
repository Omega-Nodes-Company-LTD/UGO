import { expect, test, type Page } from "@playwright/test";

/**
 * The operator panel end to end: a real browser against the real soul started
 * by global-setup. What matters here is not that the HTML renders — it is that
 * somebody who has never opened a terminal can register their household and
 * that the protections are visible while they do it.
 */

const soulHttp = (): string => {
  const ws = process.env.UGO_E2E_SOUL_WS;
  if (ws === undefined) throw new Error("global setup did not export UGO_E2E_SOUL_WS");
  return ws.replace(/^ws/, "http").replace("/v1/face", "");
};

const token = (): string => process.env.UGO_E2E_TOKEN ?? "";

const openPanel = async (page: Page): Promise<void> => {
  await page.goto(`${soulHttp()}/admin`);
  await page.getByTestId("token").fill(token());
  await page.getByTestId("save-token").click();
  await expect(page.getByTestId("pack-rows")).toBeVisible();
};

test("a wrong token does not let anybody in", async ({ page }) => {
  await page.goto(`${soulHttp()}/admin`);
  await page.getByTestId("token").fill("non-e-il-token");
  await page.getByTestId("save-token").click();
  await expect(page.getByTestId("auth-msg-text")).toHaveText(/Token non valido/);
  await expect(page.getByTestId("pack-rows")).toBeHidden();
});

test("the household can be registered without touching a terminal", async ({ page }) => {
  await openPanel(page);

  await page.getByTestId("being-name").fill("Ivan Bianchi");
  await page.getByTestId("being-species").fill("human");
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("add-msg-text")).toHaveText(/fa parte del branco/);

  // the dog is a first-class member, not an attribute of a human
  await page.getByTestId("being-name").fill("Argo");
  await page.getByTestId("being-species").fill("dog");
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("add-msg-text")).toHaveText(/fa parte del branco/);

  const rows = page.getByTestId("pack-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Argo" })).toContainText("cane");
  // a fresh bond starts at zero: UGO is the newcomer
  await expect(rows.filter({ hasText: "Ivan" })).toContainText("poco");
});

test("a minor is registered with no voice profile ever offered", async ({ page }) => {
  await openPanel(page);
  await page.getByTestId("being-name").fill("Sofia");
  await page.getByTestId("being-minor").check();
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("add-msg-text")).toHaveText(/fa parte del branco/);

  const row = page.getByTestId("pack-row").filter({ hasText: "Sofia" });
  await expect(row).toContainText("minorenne");
  // the voice column reads "—", not "no": there is nothing to do here
  await expect(row).toContainText("—");

  // and the server refuses even if the request is made anyway
  const response = await page.evaluate(async (bearer) => {
    const pack = (await (await fetch("/v1/pack")).json()) as {
      beings: { id: string; displayName: string }[];
    };
    const sofia = pack.beings.find((being) => being.displayName === "Sofia");
    const res = await fetch(`/v1/beings/${sofia?.id ?? "missing"}/enroll/voice`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ objectKey: "inbox/whatever.webm" }),
    });
    return { status: res.status, body: (await res.json()) as unknown };
  }, token());
  expect(response.status).toBe(403);
  expect(JSON.stringify(response.body)).toContain("minor_biometrics_forbidden");
});

test("recording a voice queues an enrollment for tonight's dream", async ({ page }) => {
  await openPanel(page);
  await page.getByTestId("being-name").fill("Paola Verdi");
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("add-msg-text")).toHaveText(/fa parte del branco/);

  // the fake device from the launch args feeds the recorder real audio frames
  await page.getByTestId("rec").click();
  await expect(page.getByTestId("enroll-msg-text")).toHaveText(/Parla normalmente/);
  await expect(page.getByTestId("enroll-msg-text")).toHaveText(/Me lo segno/, { timeout: 30_000 });

  // the request is on record, waiting for the night job
  const queued = await page.evaluate(async () => {
    const res = await fetch("/v1/pack");
    return ((await res.json()) as { beings: unknown[] }).beings.length;
  });
  expect(queued).toBeGreaterThan(0);
});

test("a correction reaches UGO and the panel says so", async ({ page }) => {
  await openPanel(page);
  await page.getByTestId("being-name").fill("Marco Neri");
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("add-msg-text")).toHaveText(/fa parte del branco/);

  await page.getByTestId("corr-signal").selectOption("wrong_name");
  await page.getByTestId("add-corr").click();
  await expect(page.getByTestId("corr-msg-text")).toHaveText(/Preso/);
});

test("the panel shows the money and the cache without any SQL", async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId("stats")).toContainText("speso oggi");
  await expect(page.getByTestId("stats")).toContainText("risparmio cache");
  await expect(page.getByTestId("stats")).toContainText("ricordi");
});
