// Render in-brand title overlays as transparent 1080p PNGs (alpha) for ffmpeg compositing.
import { chromium } from "playwright";

const HTML = new URL("../../assets/cinematic/titles/title.html", import.meta.url).href;
const OUT = new URL("../../assets/cinematic/titles/", import.meta.url);
const IDS = ["callout-1", "callout-2", "callout-3", "callout-4", "wordmark", "lockup"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
for (const id of IDS) {
  await page.goto(`${HTML}?id=${id}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(`${id}.png`, OUT).pathname, omitBackground: true });
  console.log(`rendered ${id}.png`);
}
await browser.close();
