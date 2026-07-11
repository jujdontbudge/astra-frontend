// Capture every UI state for design review → /tmp/rovaos-review/*.png
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const URL = process.env.ROVAOS_URL || "http://127.0.0.1:4280";
const OUT = "/tmp/rovaos-review";
await mkdir(OUT, { recursive: true });

const b = await chromium.launch({ headless: true });

async function page(viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", (e) => errors.push(e.message));
  return { ctx, p, errors };
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });

// 1. home default
let { ctx, p, errors } = await page();
await p.goto(URL);
await p.getByTestId("home-screen").waitFor();
await p.waitForTimeout(900);
await shot(p, "01-home");

// 2. composer focused + typed
await p.getByTestId("composer-input").click();
await p.getByTestId("composer-input").fill("Book a meeting with Ben for Friday at 2pm");
await p.waitForTimeout(400);
await shot(p, "02-typed");

// 3. conversation (demo mode reply)
await p.getByTestId("composer-input").press("Enter");
await p.getByTestId("user-message").waitFor();
await p.waitForTimeout(2600);
await shot(p, "03-conversation");

// 4. sidebar expanded
await p.getByRole("button", { name: "Chats" }).first().click();
await p.waitForTimeout(600);
await shot(p, "04-sidebar");

// 5. settings modal
await p.getByRole("button", { name: "Settings" }).first().click();
await p.getByTestId("settings-modal").waitFor();
await p.waitForTimeout(400);
await shot(p, "05-settings");

// 6. preview booking (hero cards)
await p.getByRole("button", { name: "Preview a booking" }).click();
await p.getByTestId("calendar-card").last().waitFor();
await p.getByTestId("email-card").last().waitFor();
await p.waitForTimeout(2200);
await shot(p, "06-booking-cards");
console.log("console errors main flow:", JSON.stringify(errors));
await ctx.close();

// 7. gallery
({ ctx, p, errors } = await page());
await p.goto(`${URL}/?gallery`);
await p.getByTestId("gallery-page").waitFor();
await p.waitForTimeout(1800);
await shot(p, "07-gallery");
await ctx.close();

// 8-9. mobile
({ ctx, p, errors } = await page({ width: 390, height: 844 }));
await p.goto(URL);
await p.getByTestId("home-screen").waitFor();
await p.waitForTimeout(800);
await shot(p, "08-mobile-home");
await p.getByTestId("composer-input").fill("hi");
await p.getByTestId("composer-input").press("Enter");
await p.getByTestId("user-message").waitFor();
await p.waitForTimeout(2400);
await shot(p, "09-mobile-conversation");
console.log("console errors mobile:", JSON.stringify(errors));
await ctx.close();

await b.close();
console.log("done →", OUT);
