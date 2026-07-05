import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";

const APP_URL = process.env.ASTRA_E2E_URL || "http://127.0.0.1:5173";
const MOCK_PORT = Number(process.env.ASTRA_MOCK_PORT || 18999);
const FALLBACK_PORT = Number(process.env.ASTRA_FALLBACK_PORT || 18998);
const MOCK_WS = `ws://127.0.0.1:${MOCK_PORT}`;
const FALLBACK_WS = `ws://127.0.0.1:${FALLBACK_PORT}`;
const SHOTS = new URL("../screenshots/astra-e2e/", import.meta.url);
const MODEL = "claude-sonnet-4-6";
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function startMockBackend() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/api/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, integrations: { calendar: true, email: true } }));
      return;
    }
    if (url.pathname === "/api/home") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          available: true,
          nextMeeting: {
            subject: "Rohan 1:1",
            start: "2026-06-19T14:30:00-04:00",
            end: "2026-06-19T15:00:00-04:00",
          },
          todayCount: 4,
          unread: 7,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    let closed = false;
    ws.on("close", () => {
      closed = true;
    });
    ws.on("message", async (raw) => {
      const msg = JSON.parse(String(raw));
      const text = msg.text || "";
      if (text.includes("stoppable")) {
        await delay(4000);
        if (!closed && ws.readyState === 1) ws.send(JSON.stringify({ type: "response", text: "This should have been stopped." }));
        return;
      }
      await delay(60);
      if (closed || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "tool_call", id: "tool-1", tool: "list_recent_emails", input: { top: 25, unread_only: true } }));
      await delay(80);
      if (closed || ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          type: "tool_result",
          id: "tool-1",
          tool: "list_recent_emails",
          output: JSON.stringify({ emails: Array.from({ length: 7 }, (_, id) => ({ id: String(id + 1) })) }),
        })
      );
      await delay(80);
      if (closed || ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          type: "response",
          text: `Done. I handled "${text}" and found 7 unread messages that need triage.`,
        })
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(MOCK_PORT, "127.0.0.1", () => {
      resolve({
        close: () =>
          new Promise((done) => {
            wss.close(() => server.close(done));
          }),
      });
    });
  });
}

function startFallbackBackend() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("access-control-allow-origin", "*");
    if (url.pathname === "/api/home") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ available: false }));
      return;
    }
    if (url.pathname === "/api/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(FALLBACK_PORT, "127.0.0.1", () => {
      resolve({ close: () => new Promise((done) => server.close(done)) });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settings(url = MOCK_WS, patch = {}) {
  return {
    backend: "jarvis",
    jarvisUrl: url,
    apiKey: "",
    model: MODEL,
    mode: "Build",
    ...patch,
  };
}

async function newPage(browser, { viewport = { width: 1200, height: 900 }, reducedMotion = "no-preference", seed = settings() } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") issues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ({ seedSettings }) => {
      if (!sessionStorage.getItem("__astra_e2e_seeded")) {
        localStorage.clear();
        localStorage.setItem("astra.settings.v2", JSON.stringify(seedSettings));
        sessionStorage.setItem("__astra_e2e_seeded", "1");
      }
    },
    { seedSettings: seed }
  );
  return { page, context, issues };
}

async function blockedStoragePage(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") issues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));
  await page.route("**/api/home", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) })
  );
  await page.addInitScript(() => {
    const blocked = {
      getItem() {
        throw new Error("blocked storage");
      },
      setItem() {
        throw new Error("blocked storage");
      },
      removeItem() {
        throw new Error("blocked storage");
      },
      clear() {
        throw new Error("blocked storage");
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => blocked });
  });
  return { page, context, issues };
}

async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: new URL(`${name}.png`, SHOTS).pathname, fullPage: false });
}

async function assertNoEmoji(page) {
  const text = await page.locator("body").innerText();
  assert.equal(EMOJI_RE.test(text), false, `emoji-like glyph found in DOM text: ${text}`);
}

function assertCleanConsole(issues, label) {
  assert.deepEqual(issues, [], `${label} console issues:\n${issues.join("\n")}`);
}

async function waitForHomeFallback(page) {
  await page.getByRole("button", { name: /Calendar Today Review agenda/ }).waitFor({ timeout: 3500 });
  await page.getByRole("button", { name: /Briefing Morning/ }).waitFor({ timeout: 1000 });
}

async function assertComposerUsable(page, label) {
  const box = await page.getByTestId("composer-input").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      viewportHeight: window.innerHeight,
      visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight,
    };
  });
  assert.ok(box.visible, `${label}: composer input must be visible in viewport (${JSON.stringify(box)})`);
  assert.ok(box.bottom <= box.viewportHeight - 24, `${label}: composer should not be clipped by the viewport (${JSON.stringify(box)})`);
  assert.ok(box.top >= box.viewportHeight * 0.55, `${label}: composer should stay docked low in conversation mode (${JSON.stringify(box)})`);
}

async function assertNoFloatingCardCircles(page, label) {
  const count = await page.locator(".hero-motion-icons").count();
  assert.equal(count, 0, `${label}: floating card circle accents should not render`);
}

async function assertConversationPinned(page, label) {
  const metrics = await page.evaluate(() => {
    const flow = document.querySelector(".flow");
    const composer = document.querySelector('[data-testid="composer-wrap"]');
    const messages = Array.from(document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]'));
    const latest = messages.at(-1);
    const flowRect = flow?.getBoundingClientRect();
    const composerRect = composer?.getBoundingClientRect();
    const latestRect = latest?.getBoundingClientRect();
    return {
      messageCount: messages.length,
      scrollTop: flow?.scrollTop ?? null,
      scrollHeight: flow?.scrollHeight ?? null,
      clientHeight: flow?.clientHeight ?? null,
      flowBottom: flowRect?.bottom ?? null,
      latestBottom: latestRect?.bottom ?? null,
      composerTop: composerRect?.top ?? null,
      composerBottom: composerRect?.bottom ?? null,
      viewportHeight: window.innerHeight,
    };
  });

  assert.ok(metrics.messageCount > 0, `${label}: expected rendered messages (${JSON.stringify(metrics)})`);
  assert.ok(metrics.composerBottom <= metrics.viewportHeight, `${label}: composer should stay in viewport (${JSON.stringify(metrics)})`);
  assert.ok(metrics.flowBottom <= metrics.composerTop + 1, `${label}: message pane should end above composer (${JSON.stringify(metrics)})`);
  assert.ok(
    metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 6,
    `${label}: conversation should be pinned to latest message (${JSON.stringify(metrics)})`
  );
  assert.ok(
    metrics.latestBottom <= metrics.flowBottom + 6,
    `${label}: latest message should resolve at the bottom of the pane (${JSON.stringify(metrics)})`
  );
}

async function desktopFlows(browser) {
  const fallback = await newPage(browser, { seed: settings(FALLBACK_WS) });
  await fallback.page.goto(APP_URL);
  await fallback.page.getByTestId("home-screen").waitFor();
  await waitForHomeFallback(fallback.page);
  await assertNoEmoji(fallback.page);
  await shot(fallback.page, "01-home-fallback");
  assertCleanConsole(fallback.issues, "home fallback");
  await fallback.context.close();

  const run = await newPage(browser);
  const { page, issues } = run;
  await page.goto(APP_URL);
  await page.getByText("Rohan 1:1").waitFor();
  await shot(page, "02-home-live");

  const input = page.getByTestId("composer-input");
  await input.click();
  await input.fill("stoppable request");
  await page.getByTestId("send-button").waitFor();
  await shot(page, "03-typed-send");
  await input.press("Enter");
  await page.getByTestId("user-message").waitFor();
  await page.getByTestId("stop-button").waitFor();
  await shot(page, "04-conversation-transition");
  await page.getByTestId("stop-button").click();
  await page.getByText("Stopped").waitFor();
  await page.getByTestId("stop-button").waitFor({ state: "detached" });

  const dockedInput = page.getByTestId("composer-input");
  await dockedInput.fill("first line");
  await dockedInput.press("Shift+Enter");
  await dockedInput.type("second line");
  assert.equal(await dockedInput.inputValue(), "first line\nsecond line");
  const height = await dockedInput.evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 28, "composer textarea should auto-grow after multiline input");
  await dockedInput.fill("");

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("home-screen").waitFor();
  for (const prompt of [
    "What's on my calendar today?",
    "Triage my unread inbox",
    "Schedule a meeting",
    "Run my morning briefing",
  ]) {
    await page.getByRole("button", { name: "New chat" }).first().click();
    await page.getByRole("button", { name: prompt }).first().click();
    await page.getByText(prompt).waitFor();
    await page.getByText("Done. I handled").waitFor();
    await assertComposerUsable(page, `after prompt ${prompt}`);
    await assertConversationPinned(page, `after prompt ${prompt}`);
  }

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByTestId("sidebar-search").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Search chats");
  await page.getByTestId("sidebar-search").fill("morning");
  await page.locator(".thread-title", { hasText: "Run my morning briefing" }).waitFor();
  await page.getByTestId("sidebar-search").fill("");

  await page.locator(".thread-open").first().dblclick();
  await page.getByTestId("rename-input").fill("Renamed briefing");
  await page.getByTestId("rename-input").press("Enter");
  await page.getByText("Renamed briefing").waitFor();
  await page.locator(".thread-open").first().dblclick();
  await page.getByTestId("rename-input").fill("Cancelled rename");
  await page.getByTestId("rename-input").press("Escape");
  await page.getByText("Renamed briefing").waitFor();
  await page.locator(".thread").first().hover();
  await page.locator(".thread-del").first().click();
  await page.getByText("Renamed briefing").waitFor({ state: "detached" });

  await page.reload();
  await page.locator(".sidebar").waitFor();

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByTestId("settings-modal").waitFor();
  await page.getByRole("button", { name: "Anthropic key" }).click();
  await page.getByLabel("Anthropic API key").fill("sk-ant-test");
  await page.getByRole("button", { name: "Show key" }).click();
  assert.equal(await page.getByLabel("Anthropic API key").getAttribute("type"), "text");
  await page.getByLabel("Model").selectOption(MODEL);
  await page.getByRole("button", { name: "Local RovaOS" }).click();
  await page.getByLabel("Backend URL").fill(MOCK_WS);
  await page.getByRole("button", { name: "Test" }).click();
  await page.getByText("Connected to RovaOS.").waitFor();
  await page.getByRole("button", { name: "Preview a booking" }).click();
  await page.getByTestId("calendar-card").waitFor();
  await page.getByTestId("email-card").waitFor();
  await assertNoFloatingCardCircles(page, "preview booking");
  await shot(page, "05-preview-booking");

  await page.getByRole("button", { name: "Copy answer" }).first().click();
  await page.getByText("Copied").first().waitFor();
  await page.getByRole("button", { name: "Share answer" }).first().click();
  await page.getByRole("button", { name: "Positive feedback" }).first().click();

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("home-screen").waitFor();
  await page.getByRole("button", { name: /Inbox 7 unread/ }).click();
  await page.getByTestId("tool-chip").waitFor();
  await page.getByText("Listed email").waitFor();
  await page.getByText("7 results").waitFor();
  await page.getByTestId("tool-chip").click();
  await page.getByText('"unread_only": true').waitFor();
  await page.getByTestId("tool-chip").click();
  const userCountBeforeRetry = await page.getByTestId("user-message").count();
  await page.getByRole("button", { name: "Retry answer" }).last().click();
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="user-message"]').length > count, userCountBeforeRetry);

  await page.goto(`${APP_URL}/?gallery`);
  await page.getByTestId("gallery-page").waitFor();
  await page.getByText("Calendar with attendees").waitFor();
  await page.getByText("Calendar without attendees").waitFor();
  await page.getByText("Calendar error").waitFor();
  await page.getByText("Email high importance").waitFor();
  await page.getByText("Tool running").waitFor();
  await page.getByText("Error note").waitFor();
  await assertNoFloatingCardCircles(page, "gallery");
  await shot(page, "06-gallery");
  const replayButtons = await page.getByRole("button", { name: "Replay" }).all();
  assert.ok(replayButtons.length >= 10, "gallery should expose replay for each card state");
  for (const button of replayButtons.slice(0, 4)) await button.click();

  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Settings" }).first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear all conversations" }).click();
  await page.getByText("0 stored conversations.").waitFor();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByTestId("settings-modal").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator(".modal-overlay").click({ position: { x: 4, y: 4 } });
  await page.getByTestId("settings-modal").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByTestId("settings-modal").waitFor({ state: "detached" });

  await assertNoEmoji(page);
  assertCleanConsole(issues, "desktop flows");
  await run.context.close();
}

async function persistenceAndResilience(browser) {
  const run = await newPage(browser);
  const { page, issues } = run;
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Triage my unread inbox" }).click();
  await page.getByText("Done. I handled").waitFor();
  await page.reload();
  await page.getByTestId("user-message").getByText("Triage my unread inbox").waitFor();
  await assertNoEmoji(page);
  assertCleanConsole(issues, "persistence");
  await run.context.close();

  const blocked = await blockedStoragePage(browser);
  await blocked.page.goto(APP_URL);
  await blocked.page.getByTestId("home-screen").waitFor();
  await assertNoEmoji(blocked.page);
  assertCleanConsole(blocked.issues, "blocked storage");
  await blocked.context.close();
}

async function reducedMotionAndMobile(browser) {
  const reduced = await newPage(browser, { reducedMotion: "reduce" });
  await reduced.page.goto(APP_URL);
  await reduced.page.getByTestId("home-screen").waitFor();
  await reduced.page.getByTestId("composer-input").fill("reduced motion check");
  await reduced.page.getByTestId("send-button").click();
  await reduced.page.getByTestId("user-message").waitFor();
  await reduced.page.goto(`${APP_URL}/?gallery`);
  await reduced.page.getByTestId("gallery-page").waitFor();
  await shot(reduced.page, "07-reduced-motion-gallery");
  await assertNoEmoji(reduced.page);
  assertCleanConsole(reduced.issues, "reduced motion");
  await reduced.context.close();

  const mobile = await newPage(browser, { viewport: { width: 390, height: 780 } });
  await mobile.page.goto(APP_URL);
  await mobile.page.getByRole("button", { name: "Open sidebar" }).click();
  await mobile.page.locator(".mobile-sidebar-panel .sidebar").waitFor();
  await shot(mobile.page, "08-mobile-sidebar");
  await assertNoEmoji(mobile.page);
  assertCleanConsole(mobile.issues, "mobile");
  await mobile.context.close();
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const mock = await startMockBackend();
  const fallback = await startFallbackBackend();
  const browser = await chromium.launch();
  try {
    await desktopFlows(browser);
    await persistenceAndResilience(browser);
    await reducedMotionAndMobile(browser);
  } finally {
    await browser.close();
    await mock.close();
    await fallback.close();
  }
  console.log("Astra Playwright e2e passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
