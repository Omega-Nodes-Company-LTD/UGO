import { expect, test, type Page } from "@playwright/test";

/**
 * The 3D body (ADR-026) in a real browser, against real soul.
 *
 * These assert on the body's own readout, never on pixels: a screenshot of a
 * WebGL scene is a fragile thing to hang a suite on, and what matters here is
 * that posture, activity and gestures are actually being driven — not that a
 * particular pixel is a particular pink.
 *
 * The `z-` prefix is load-bearing. Playwright runs spec files in path order
 * against ONE soul process, so psyche and face state carry across files: this
 * suite taps, darkens the room and puts UGO to sleep, and every one of those
 * would leak into a spec that expects to find him idle. It runs last.
 */

const soulWs = (): string => {
  const url = process.env.UGO_E2E_SOUL_WS;
  if (url === undefined) throw new Error("global setup did not export UGO_E2E_SOUL_WS");
  return url;
};

const open = async (page: Page, extra = ""): Promise<void> => {
  await page.goto(`/?soul=${encodeURIComponent(soulWs())}${extra}`);
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
};

const body = (page: Page): Promise<Record<string, string | number>> =>
  page.evaluate(() => window.__ugoBody.debug());

test("the WebGL body comes up and reports a posture and an activity", async ({ page }) => {
  await open(page);
  await expect
    .poll(async () => (await body(page)).posture, { timeout: 10_000 })
    .toBeTruthy();
  const debug = await body(page);
  // if this says "2d" the browser refused WebGL and we are testing the fallback
  expect(debug.renderer).not.toBe("2d");
  expect(["in piedi", "seduto", "coricato", "accovacciato"]).toContain(debug.posture);
  expect(["fermo", "cammina", "grufola"]).toContain(debug.activity);
});

test("posture is its own axis: an exhausted UGO lies down while still idle", async ({ page }) => {
  await open(page, "&wander=off");
  // soul's face state is per-process, not per-connection, so an earlier spec's
  // tap leaves him `alert` — and alert legitimately forces him onto his feet.
  // A full chat turn is the real path back to idle.
  await page.evaluate(() => {
    window.__ugoFace.send({ type: "heard_text", text: "tutto a posto?" });
  });
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", {
    timeout: 30_000,
  });
  // soul keeps broadcasting the REAL psyche, so the hypothetical one has to be
  // re-applied on every poll: what is under test is the mapping, not who wins
  // the last write. The face state stays `idle` throughout — which is the
  // point, posture is not the state.
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          window.__ugoBody.mood({ energia: 0.05 });
        });
        return (await body(page)).posture;
      },
      { timeout: 15_000 },
    )
    .toBe("coricato");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
});

test("a tap is answered by the body itself, with no round trip to soul", async ({ page }) => {
  await open(page, "&wander=off");
  // fuori dal centro: lì c'è il muso (con wander=off, SEMPRE), e da ADR-058
  // quel click è una mela — `wiggle`, non la carezza `happyGrunt`. E fuori
  // dal cromo del chiosco (ADR-096): l'angolo in alto a sinistra ora è barra
  // e colonna comandi, che intercetterebbero il click.
  await page.getByTestId("face-canvas").click({ position: { x: 300, y: 100 } });
  await expect
    .poll(async () => (await body(page)).lastGesture, { timeout: 15_000 })
    .toBe("happyGrunt");
});

test("any gesture in the catalogue can be played and then releases the body", async ({ page }) => {
  await open(page, "&wander=off");
  await page.evaluate(() => {
    window.__ugoBody.play("sneeze");
  });
  await expect.poll(async () => (await body(page)).lastGesture, { timeout: 15_000 }).toBe("sneeze");
  // It must end: a gesture that never clears would block autonomy for good.
  // The claim is that THE SNEEZE ends — not that nothing else is playing:
  // after 22:00 Europe/Rome soul is asleep, and a sleeping body legitimately
  // plays its own drowsy gestures every few seconds, so polling for "" raced
  // against autonomy and went red the first night the CI ever ran after dark.
  // 15s like its neighbours, not 5: software-GL frames on a 2-core runner are
  // slow, and this poll measures the gesture engine, not the runner.
  await expect
    .poll(async () => (await body(page)).gesture, { timeout: 15_000 })
    .not.toBe("sneeze");
});

test("the 2D face is still there for a device that cannot do WebGL", async ({ page }) => {
  await open(page, "&renderer=2d");
  const debug = await body(page);
  expect(debug.renderer).toBe("2d");
  // and it still answers the contract the app talks to — whatever mood the
  // earlier tests in this file left him in
  await expect(page.getByTestId("app")).toHaveAttribute(
    "data-state",
    /sleeping|idle|alert|listening|thinking|talking/,
  );
});
