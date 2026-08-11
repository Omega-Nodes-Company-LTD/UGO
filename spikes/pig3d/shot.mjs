import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PW || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("file://" + process.cwd() + "/preview.html");
await page.waitForTimeout(2000);

// dorme: deve accovacciarsi
await page.click('[data-state="sleeping"]');
await page.waitForTimeout(1200);
await page.locator("#stage").screenshot({ path: "shot-sleeping.png" });

// annoiato in idle: deve mettersi a girare e grufolare
await page.click('[data-state="idle"]');
await page.fill("#noia", "95");
await page.dispatchEvent("#noia", "input");
await page.fill("#energia", "80");
await page.dispatchEvent("#energia", "input");
const seen = new Set();
for (let i = 0; i < 60; i += 1) {
  await page.waitForTimeout(400);
  const a = await page.textContent("#activity");
  if (a && !seen.has(a)) {
    seen.add(a);
    await page.locator("#stage").screenshot({ path: `shot-${a}.png` });
  }
  if (seen.size === 3) break;
}
console.log("attività viste:", [...seen].join(", "));
await page.click('[data-gesture="sbadiglio"]');
await page.waitForTimeout(950);
await page.locator("#stage").screenshot({ path: "shot-sbadiglio.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
