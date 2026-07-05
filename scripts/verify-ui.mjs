import { chromium } from "playwright";
const URL = process.env.ASTRA_URL || "http://127.0.0.1:4280";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(URL);
await p.getByTestId("home-screen").waitFor({ timeout: 8000 });
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/ui-after-default.png" });
await p.getByTestId("composer-input").click();
await p.getByTestId("composer-input").fill("Schedule a meeting with the team");
await p.waitForTimeout(500);
const cs = await p.getByTestId("composer-input").evaluate((el) => {
  const s = getComputedStyle(el);
  return { outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, outlineStyle: s.outlineStyle };
});
console.log("composer-input focus outline:", JSON.stringify(cs));
await p.screenshot({ path: "/tmp/ui-after-focus.png" });
// tight crop of the rail
await p.locator(".icon-rail").screenshot({ path: "/tmp/ui-after-rail.png" });
// send the message and inspect the user bubble color vs the send button
await p.getByTestId("composer-input").fill("hi");
await p.getByTestId("composer-input").press("Enter");
await p.locator(".bubble.user").first().waitFor({ timeout: 8000 });
await p.waitForTimeout(700);
const bub = await p.locator(".bubble.user").first().evaluate((el) => getComputedStyle(el).backgroundImage);
console.log("bubble.user background:", bub);
await p.screenshot({ path: "/tmp/ui-bubble.png" });
await b.close();
console.log("ok");
