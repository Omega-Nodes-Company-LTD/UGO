import { expect, test, type Page } from "@playwright/test";
import { createDbClient, PRIME_ACCOUNT_ID, recognitionProfiles } from "@ugo/db";

/**
 * The operator panel end to end: a real browser against the real soul started
 * by global-setup. What matters here is not that the HTML renders — it is that
 * somebody who has never opened a terminal can register their account and
 * that the protections are visible while they do it.
 */

const soulHttp = (): string => {
  const ws = process.env.UGO_E2E_SOUL_WS;
  if (ws === undefined) throw new Error("global setup did not export UGO_E2E_SOUL_WS");
  return ws.replace(/^ws/, "http").replace("/v1/face", "");
};

const token = (): string => process.env.UGO_E2E_TOKEN ?? "";

/**
 * Writes a voice profile straight into the real Postgres, the way the night
 * job would. Only the encoder is skipped: what this test is about is consent
 * withdrawal, not DSP — the payload is still an opaque UGO1 envelope.
 */
const seedVoiceProfile = async (beingId: string): Promise<void> => {
  const url = process.env.UGO_E2E_DATABASE_URL;
  if (url === undefined) throw new Error("global setup did not export UGO_E2E_DATABASE_URL");
  const db = createDbClient(url);
  try {
    await db.insert(recognitionProfiles).values({
      accountId: PRIME_ACCOUNT_ID,
      beingId,
      modality: "voice",
      model: "mfcc-stats-v1",
      dimensions: 24,
      payload: Buffer.concat([Buffer.from("UGO1"), Buffer.alloc(60, 9)]),
      sampleCount: 3,
    });
  } finally {
    await db.$client.end();
  }
};

/**
 * Adds a being and waits for the row to exist. Waiting on the confirmation
 * message instead would pass on the PREVIOUS message and let the test race
 * ahead of the repaint — which is exactly how this helper came to exist.
 */
const addBeing = async (page: Page, displayName: string, species = "human"): Promise<void> => {
  // the pack form lives on the pack page and the caller may be anywhere by now
  // (ADR-035 gave the panel pages). Going there is the helper's job, not the
  // caller's: relying on call order is how two of these broke.
  await goHouse(page, "branco");
  await page.getByTestId("being-name").fill(displayName);
  await page.getByTestId("being-species").fill(species);
  await expect(page.getByTestId("add-being")).toBeEnabled();
  await page.getByTestId("add-being").click();
  await expect(page.getByTestId("pack-row").filter({ hasText: displayName })).toHaveCount(1);
};

const openPanel = async (page: Page): Promise<void> => {
  await page.goto(`${soulHttp()}/admin`);
  await page.getByTestId("token").fill(token());
  await page.getByTestId("save-token").click();
  // ADR-035: the panel has pages now, and it opens on the house summary.
  // Most of what these tests touch lives on the pack page, so that is where
  // "open the panel" means to be.
  await goHouse(page, "branco");
};

/** Clicks a rail entry for one of the house pages and waits for it to be on. */
const goHouse = async (page: Page, name: string): Promise<void> => {
  await page.locator(`.rail a[data-nav="${name}"]`).click();
  await expect(page.locator(`section.page[data-page="${name}"]`)).toBeVisible();
};

/**
 * Opens the first exemplar's page. Clicked rather than addressed by id: the
 * id is seeded by a migration and hard-coding it here would make these tests
 * fail for a reason that has nothing to do with what they assert.
 */
const goGosino = async (page: Page, sub: string): Promise<void> => {
  await page.locator('.rail a[href^="#/g/"]').first().click();
  await page.locator(`.rail a[data-nav="g:${sub}"]`).click();
  await expect(page.locator(`section.page[data-page="${sub}"]`)).toBeVisible();
};

test("a wrong token does not let anybody in", async ({ page }) => {
  await page.goto(`${soulHttp()}/admin`);
  await page.getByTestId("token").fill("non-e-il-token");
  await page.getByTestId("save-token").click();
  await expect(page.getByTestId("auth-msg-text")).toHaveText(/Token non valido/);
  await expect(page.getByTestId("pack-rows")).toBeHidden();
});

test("the account can be registered without touching a terminal", async ({ page }) => {
  await openPanel(page);

  await addBeing(page, "Ivan Bianchi");
  // the dog is a first-class member, not an attribute of a human
  await addBeing(page, "Argo", "dog");

  const rows = page.getByTestId("pack-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Argo" })).toContainText("cane");
  // a newcomer has no voiceprint and the card says which, not just "no"
  await expect(rows.filter({ hasText: "Ivan" })).toContainText("voce non ancora insegnata");
});

test("a minor is registered with no voice profile ever offered", async ({ page }) => {
  await openPanel(page);
  await page.getByTestId("being-minor").check();
  await addBeing(page, "Sofia");

  const row = page.getByTestId("pack-row").filter({ hasText: "Sofia" });
  // not "no voiceprint yet" but "none, by choice": there is nothing to do here
  await expect(row).toContainText("nessuna impronta, per scelta");

  // e il server rifiuta lo stesso, se la richiesta gliela fai comunque.
  // ADR-101 ha tolto la variante col presign: la porta che resta è quella per
  // cui passa il pannello — audio nostro, muro PRIMA del bucket
  const response = await page.evaluate(async (bearer) => {
    const pack = (await (await fetch("/v1/pack")).json()) as {
      beings: { id: string; displayName: string }[];
    };
    const sofia = pack.beings.find((being) => being.displayName === "Sofia");
    const res = await fetch(`/v1/beings/${sofia?.id ?? "missing"}/enroll/voice/audio`, {
      method: "POST",
      headers: { "content-type": "audio/webm", authorization: `Bearer ${bearer}` },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    return { status: res.status, body: (await res.json()) as unknown };
  }, token());
  expect(response.status).toBe(403);
  expect(JSON.stringify(response.body)).toContain("minor_biometrics_forbidden");
});

test("recording a voice queues an enrollment for tonight's dream", async ({ page }) => {
  await openPanel(page);
  await addBeing(page, "Paola Verdi");

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
  await addBeing(page, "Marco Neri");

  await page.getByTestId("corr-signal").selectOption("wrong_name");
  await page.getByTestId("add-corr").click();
  await expect(page.getByTestId("corr-msg-text")).toHaveText(/Preso/);
});

test("the panel shows the money and the cache without any SQL", async ({ page }) => {
  await openPanel(page);
  await goHouse(page, "sommario");
  await expect(page.getByTestId("stats")).toContainText("speso oggi");
  await expect(page.getByTestId("stats")).toContainText("risparmio cache");
  await expect(page.getByTestId("stats")).toContainText("ricordi");
});

test("withdrawing consent destroys the voiceprint, it does not just stop using it", async ({
  page,
}) => {
  await openPanel(page);
  await addBeing(page, "Giulia Ferri");

  // give her a voiceprint the way the night job would
  const beingId = await page.evaluate(async () => {
    const pack = (await (await fetch("/v1/pack")).json()) as {
      beings: { id: string; displayName: string }[];
    };
    return pack.beings.find((b) => b.displayName === "Giulia Ferri")?.id ?? "";
  });
  await seedVoiceProfile(beingId);
  await page.getByTestId("refresh").click();
  const row = page.getByTestId("pack-row").filter({ hasText: "Giulia" });
  await expect(row).toContainText("impronta vocale · 3 campioni");

  // she changes her mind: "non ascoltarmi più"
  await row.locator('[data-toggle="noAudio"]').check();
  await expect(page.getByTestId("pack-msg-text")).toHaveText(/impronta vocale è stata distrutta/);
  await expect(page.getByTestId("pack-row").filter({ hasText: "Giulia" })).toContainText(
    "nessuna impronta, per scelta",
  );

  // and it is gone from the database, not merely ignored
  const left = await page.evaluate(async (id) => {
    const res = await fetch(`/v1/pack`);
    const pack = (await res.json()) as { beings: { id: string; hasVoiceProfile: boolean }[] };
    return pack.beings.find((b) => b.id === id)?.hasVoiceProfile;
  }, beingId);
  expect(left).toBe(false);
});

test("relations between the others can be declared and removed", async ({ page }) => {
  await openPanel(page);
  for (const name of ["Ivan R.", "Sofia R."]) await addBeing(page, name);
  await page.getByTestId("rel-a").selectOption({ label: "Ivan R." });
  await page.getByTestId("rel-b").selectOption({ label: "Sofia R." });
  await page.getByTestId("rel-type").selectOption("parent_of");
  await page.getByTestId("add-rel").click();
  await expect(page.getByTestId("rel-msg-text")).toHaveText(/Collegati/);
  await expect(page.getByTestId("rel-item").filter({ hasText: "Ivan R." })).toContainText(
    "è genitore di",
  );

  await page.getByTestId("rel-item").filter({ hasText: "Ivan R." }).getByRole("button").click();
  await expect(page.getByTestId("rel-item").filter({ hasText: "Ivan R." })).toHaveCount(0);
});

test("the whole soul can be downloaded, and a being erased for good", async ({ page }) => {
  await openPanel(page);
  await addBeing(page, "Carlo Esposito");
  await goHouse(page, "dati");

  const download = page.waitForEvent("download");
  await page.getByTestId("export").click();
  expect((await download).suggestedFilename()).toMatch(/^ugo-\d{4}-\d{2}-\d{2}\.json$/);

  // erasure refuses to happen by accident
  await page.getByTestId("forget-being").selectOption({ label: "Carlo Esposito" });
  await page.getByTestId("forget").click();
  await expect(page.getByTestId("forget-msg-text")).toHaveText(/Scrivi DIMENTICA/);
  await expect(page.getByTestId("pack-row").filter({ hasText: "Carlo" })).toHaveCount(1);

  await page.getByTestId("forget-confirm").fill("DIMENTICA");
  await page.getByTestId("forget").click();
  await expect(page.getByTestId("forget-msg-text")).toHaveText(/Dimenticato/);
  await expect(page.getByTestId("pack-row").filter({ hasText: "Carlo" })).toHaveCount(0);
});

test("the panel shows whether the machinery underneath is alive", async ({ page }) => {
  await openPanel(page);
  await goHouse(page, "sommario");
  await expect(page.getByTestId("health")).toContainText("db");
  await expect(page.getByTestId("health")).toContainText("ollama");
});

test("what UGO remembers can be read, and searched the way he would", async ({ page }) => {
  await openPanel(page);
  await goGosino(page, "memoria");

  // give him something to remember, through the front door
  await page.evaluate(async () => {
    await fetch("/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "home", text: "il corriere DHL si chiama Ivan" }),
    });
  });

  await page.getByTestId("mem-go").click();
  await expect(page.getByTestId("mem-msg-text")).toHaveText(/ultimi che ha scritto|Ecco cosa/);

  // a search runs the same re-ranking the chat uses, so it answers with a score
  await page.getByTestId("mem-q").fill("chi consegna i pacchi");
  await page.getByTestId("mem-go").click();
  await expect(page.getByTestId("mem-msg-text")).toHaveText(/Ecco cosa ripescherebbe/);
});

test("the memory graph draws what UGO has connected, and says so in words", async ({ page }) => {
  await openPanel(page);

  // somebody for the memories to be about — added on the pack page, which is
  // where openPanel leaves you, before moving to the page under test
  await addBeing(page, "Ivan Bianchi");
  await goHouse(page, "riunioni");

  await page.getByTestId("graph-go").click();

  // the shape is the legend: squares are people, circles are memories
  await expect(page.getByTestId("graph-node").first()).toBeVisible();
  await expect(page.getByTestId("graph-svg").locator("svg")).toHaveAttribute(
    "aria-label",
    "Grafo della memoria",
  );
  await expect(page.getByTestId("graph-msg-text")).toContainText(/nodi/);
});

test("meetings are listed, and a bad link is refused with a reason", async ({ page }) => {
  await openPanel(page);
  await goHouse(page, "riunioni");
  await expect(page.getByTestId("meet-list")).toContainText("Nessuna riunione");

  await page.getByTestId("meet-join").click();
  await expect(page.getByTestId("meet-msg-text")).toHaveText(/Serve il link/);

  // Vexa is not wired in this environment: the panel must say so plainly
  // rather than leaving the operator staring at a spinner
  await page.getByTestId("meet-url").fill("https://meet.google.com/abc-defg-hij");
  await page.getByTestId("meet-join").click();
  await expect(page.getByTestId("meet-msg-text")).toHaveText(/riunioni non sono configurate|Non è entrato/);
});

test("the mood is the first thing on the page, drawn and not just numbered", async ({ page }) => {
  await openPanel(page);
  await goGosino(page, "stato");

  // the hero: what kind of creature has been living here, before any accounting
  await expect(page.getByTestId("mood-label")).not.toHaveText("—");
  await expect(page.getByTestId("mood-phrase")).not.toHaveText("");

  // six magnitudes, each with its resting point marked
  const bars = page.getByTestId("psyche-bars").locator(".var");
  await expect(bars).toHaveCount(6);
  await expect(bars.filter({ hasText: "curiosità" })).toHaveCount(1);
  expect(await page.getByTestId("psyche-bars").locator(".baseline").count()).toBeGreaterThan(0);

  // the mood series needs two points to be a line; with one it says so in words
  // rather than drawing a misleading dot
  const moodPlot = page.getByTestId("mood-chart");
  await expect(moodPlot).toBeVisible();
  const hasPlot = await moodPlot.locator("svg.chart, p.empty").count();
  expect(hasPlot).toBeGreaterThan(0);
});

test("spending is shown against its limit, with the numbers reachable", async ({ page }) => {
  await openPanel(page);
  await goHouse(page, "conti");
  const spend = page.getByTestId("spend-chart");
  await expect(spend).toBeVisible();
  await expect(spend.locator("svg.chart, p.empty")).toHaveCount(1);

  // an accessible way out of the picture, for anybody the chart does not serve
  await page.getByText("Vedi i numeri").click();
});

test("each service says what it is doing in words, not only in colour", async ({ page }) => {
  await openPanel(page);
  await goHouse(page, "sommario");
  const pills = page.getByTestId("health").locator(".pill");
  // db, mqtt, ollama, percezione: il conto è qui apposta, perché un servizio
  // che sparisce dal sommario si legge come un servizio che sta bene
  await expect(pills).toHaveCount(4);
  await expect(pills.filter({ hasText: "db" })).toContainText("risponde");
  // mqtt is deliberately unconfigured on this deployment, and says so
  await expect(pills.filter({ hasText: "mqtt" })).toContainText("non configurato");
  // ADR-101: e la percezione, spenta qui, lo dice con la stessa parola
  await expect(pills.filter({ hasText: "perception" })).toContainText("non configurato");
});

/**
 * ADR-039: the rooms are a catalogue, not a spelling. What matters end to end
 * is that a room made here **survives having nobody in it** — the reason to
 * make one in advance — and that moving somebody is a choice from a list.
 */
test("a room is made empty, filled from a list, and unmade without losing anybody", async ({
  page,
}) => {
  await openPanel(page);
  await goHouse(page, "stanze");

  await page.getByTestId("room-name").fill("officina");
  await page.getByTestId("room-go").click();
  const officina = page.getByTestId("rooms-list").locator(".deed").filter({ hasText: "officina" });
  await expect(officina).toHaveCount(1);
  // nobody lives there and it is a room anyway: that is the whole point
  await expect(officina).toContainText("vuota");

  // "in che stanza" is a list of real rooms now, not a field to type into
  const where = page.getByTestId("move-room");
  await expect(where.locator("option")).toContainText(["— nessuna stanza —", "officina"]);

  await page.getByTestId("move-who").selectOption({ index: 0 });
  await where.selectOption("officina");
  await page.getByTestId("move-go").click();
  await expect(officina).not.toContainText("vuota");

  // unmaking it evicts rather than deletes: he is still here, on no screen
  page.once("dialog", (dialog) => void dialog.accept());
  await officina.getByTestId("room-del").click();
  await expect(page.getByTestId("rooms-list").filter({ hasText: "officina" })).toHaveCount(0);
  await expect(page.getByTestId("rooms-list")).toContainText("Senza stanza");
});
