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
  // NON al centro: da ADR-058 un click sul muso è una mela (`reward`, che non
  // cambia stato), e col vagabondaggio acceso il maiale ogni tanto sta proprio
  // lì. E non nell'angolo (30,30) di prima: da ADR-096 lassù ci sono barra e
  // colonna comandi, che intercetterebbero il click.
  await page.getByTestId("face-canvas").click({ position: { x: 300, y: 100 } });
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

// ADR-038: the bubble lasts six seconds; miss it and the sentence was gone.
// This asserts the two things that make the scroll worth having — a real
// reply lands in it, and it is still there after the tab is reloaded.
test("what was said stays in the scroll, and survives a reload", async ({ page }) => {
  await openFace(page);
  await expect(page.getByTestId("log")).toBeHidden();

  await page.evaluate(() => {
    window.__ugoFace.send({ type: "heard_text", text: "ciao UGO, mi senti?" });
  });
  await expect(page.getByTestId("speak-text")).toContainText("Grunf", { timeout: 30_000 });

  await page.getByTestId("btn-log").click();
  await expect(page.getByTestId("log")).toBeVisible();
  const lines = page.getByTestId("log-lines").locator("li");
  // both halves of the exchange: what the room said, and what came back
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toContainText("ciao UGO, mi senti?");
  await expect(lines.last()).toContainText("Grunf");

  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
  await expect(page.getByTestId("log")).toBeHidden();
  await page.getByTestId("btn-log").click();
  await expect(page.getByTestId("log-lines").locator("li")).toHaveCount(2);

  // svuota is the only copy the body holds, so it has to empty for real
  await page.getByTestId("log-clear").click();
  await expect(page.getByTestId("log-lines").locator("li.empty")).toHaveCount(1);
  await page.getByTestId("log-close").click();
  await expect(page.getByTestId("log")).toBeHidden();
});

/**
 * ADR-096: il chiosco nascondibile. Due stati per lo stesso markup: qui si
 * prova che il nascondere non porta via i gesti primari, e che la scelta è
 * del dispositivo — un reload non riporta il chiosco che avevi mandato via.
 */
test("il chiosco si nasconde nel dock e la scelta sopravvive al reload", async ({ page }) => {
  await openFace(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "esteso");

  await page.getByTestId("btn-hide").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "nascosto");
  // dal dock i gesti primari restano vivi: il registro si apre lo stesso
  await page.getByTestId("btn-log").click();
  await expect(page.getByTestId("log")).toBeVisible();
  await page.getByTestId("log-close").click();

  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "nascosto");

  await page.getByTestId("btn-expand").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "esteso");
});

test("su telefono i comandi sono un foglio, e la presa lo nasconde", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFace(page);
  // la presa esiste solo dove il foglio esiste: su desktop è il bottone in barra
  await expect(page.getByTestId("sheet-grip")).toBeVisible();

  await page.getByTestId("sheet-grip").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "nascosto");
  await expect(page.getByTestId("sheet-grip")).toBeHidden();

  await page.getByTestId("btn-expand").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-chrome", "esteso");
});

/**
 * ADR-090: i due diritti dove vive chi li ha.
 *
 * Il pannello `/admin` li aveva già, e chi vive in questa casa il pannello non
 * lo apre: vede il muso. Qui si prova la strada vera — browser, chiosco, soul
 * e Postgres veri — perché una pagina che si monta solo nei test unitari non
 * ha ancora incontrato nessuno.
 */
test("dal chiosco si vede cosa UGO tiene, e la cancellazione non parte per sbaglio", async ({
  page,
}) => {
  const token = process.env.UGO_E2E_TOKEN ?? "";
  await page.goto(
    `/?soul=${encodeURIComponent(soulWs())}&token=${encodeURIComponent(token)}`,
  );
  await expect(page.getByTestId("app")).toHaveAttribute("data-connected", "true");

  await page.getByTestId("btn-mydata").click();
  await expect(page.getByTestId("mydata")).toBeVisible();

  // i conti ci sono, e sono conti: nove righe, nessun contenuto
  await expect(page.getByTestId("mydata-lines").locator("li")).toHaveCount(9);
  await expect(page.getByTestId("mydata-lines")).toContainText("ricordi");

  // «dimentica» senza dire chi non fa niente e lo dice
  await page.getByTestId("mydata-forget").click();
  await expect(page.getByTestId("mydata-msg")).toHaveText(/Prima dimmi chi/);

  // chiuso e riaperto, il token digitato non è rimasto lì per il prossimo
  await page.getByTestId("mydata-token").fill("un-token-qualunque");
  await page.getByTestId("mydata-close").click();
  await page.getByTestId("btn-mydata").click();
  await expect(page.getByTestId("mydata-token")).toHaveValue("");
});
