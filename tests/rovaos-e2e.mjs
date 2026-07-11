import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";

const APP_URL = process.env.ROVAOS_E2E_URL || "http://127.0.0.1:5173";
const MOCK_PORT = Number(process.env.ROVAOS_MOCK_PORT || 18999);
const FALLBACK_PORT = Number(process.env.ROVAOS_FALLBACK_PORT || 18998);
const MOCK_WS = `ws://127.0.0.1:${MOCK_PORT}`;
const FALLBACK_WS = `ws://127.0.0.1:${FALLBACK_PORT}`;
const SHOTS = new URL("../screenshots/rovaos-e2e/", import.meta.url);
const MODEL = "claude-sonnet-4-6";
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const APPROVAL_SECRET = "e2e-private-approval-secret";

function startMockBackend() {
  const stats = { decisions: 0, executions: 0, cancellations: 0, failures: 0, expirations: 0 };
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
      if (msg.type === "approve_action" || msg.type === "cancel_action") {
        stats.decisions += 1;
        if (msg.approval_token !== APPROVAL_SECRET) {
          ws.send(JSON.stringify({ type: "action_error", action_id: msg.action_id, code: "invalid_approval_token", message: "Approval token is invalid." }));
          return;
        }
        if (msg.type === "cancel_action") {
          stats.cancellations += 1;
          ws.send(JSON.stringify({ type: "action_state", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", status: "cancelled" }));
          return;
        }
        if (msg.action_id === "action-expire") {
          stats.expirations += 1;
          ws.send(JSON.stringify({ type: "action_error", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", code: "action_expired", message: "This approval expired before it could execute." }));
          return;
        }
        ws.send(JSON.stringify({ type: "action_state", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", status: "approved" }));
        await delay(35);
        if (msg.action_id === "action-fail") {
          stats.failures += 1;
          ws.send(JSON.stringify({ type: "action_error", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", code: "connector_failed", message: "Email provider rejected the action safely." }));
          return;
        }
        ws.send(JSON.stringify({ type: "action_state", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", status: "executing" }));
        await delay(90);
        stats.executions += 1;
        ws.send(JSON.stringify({ type: "action_state", action_id: msg.action_id, id: `tool-${msg.action_id}`, tool: "send_email", status: "succeeded" }));
        ws.send(JSON.stringify({
          type: "action_result",
          action_id: msg.action_id,
          id: `tool-${msg.action_id}`,
          tool: "send_email",
          status: "succeeded",
          output: JSON.stringify({ status: "sent", message_id: `message-${msg.action_id}` }),
        }));
        return;
      }
      const text = msg.text || "";
      if (text.includes("stoppable")) {
        await delay(4000);
        if (!closed && ws.readyState === 1) ws.send(JSON.stringify({ type: "response", text: "This should have been stopped." }));
        return;
      }
      if (text.includes("missing tool result")) {
        await delay(40);
        if (closed || ws.readyState !== 1) return;
        ws.send(JSON.stringify({ type: "tool_call", id: "missing-result", tool: "list_recent_emails", input: { top: 5 } }));
        await delay(60);
        if (closed || ws.readyState !== 1) return;
        ws.send(JSON.stringify({ type: "response", text: "The backend finished without returning a tool result." }));
        return;
      }
      if (text.includes("forced backend error")) {
        await delay(40);
        if (!closed && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "error", message: "Calendar connection failed safely." }));
        }
        return;
      }
      if (text.includes("approval email")) {
        const actionId = text.includes("fail")
          ? "action-fail"
          : text.includes("cancel")
            ? "action-cancel"
            : text.includes("expire")
              ? "action-expire"
              : "action-approve";
        const subject = text.includes("fail")
          ? "Provider failure check"
          : text.includes("cancel")
            ? "Cancelled note"
            : text.includes("expire")
              ? "Expired note"
              : "Approved note";
        await delay(35);
        if (closed || ws.readyState !== 1) return;
        ws.send(JSON.stringify({
          type: "tool_call",
          id: `tool-${actionId}`,
          tool: "send_email",
          input: { to: ["client@example.com"], subject, body: "Exact reviewed body" },
        }));
        ws.send(JSON.stringify({
          type: "approval_required",
          id: `tool-${actionId}`,
          action_id: actionId,
          approval_token: APPROVAL_SECRET,
          tool: "send_email",
          input: { to: ["client@example.com"], subject, body: "Exact reviewed body" },
          effect: "Send one email to client@example.com.",
          expires_at: Math.floor(Date.now() / 1000) + 900,
          message: "Review this exact action, then use Approve or Cancel.",
        }));
        ws.send(JSON.stringify({
          type: "tool_result",
          id: `tool-${actionId}`,
          tool: "send_email",
          output: JSON.stringify({ status: "approval_required", action_id: actionId }),
        }));
        ws.send(JSON.stringify({ type: "response", text: "This email has not been sent. It is waiting for structured approval." }));
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
        stats,
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
    const text = msg.text();
    if (msg.type() === "warning" && text.includes("Reduced Motion enabled on your device")) return;
    if (msg.type() === "error" || msg.type() === "warning") issues.push(`${msg.type()}: ${text}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ({ seedSettings }) => {
      if (!sessionStorage.getItem("__rovaos_e2e_seeded")) {
        localStorage.clear();
        localStorage.setItem("rovaos.settings.v2", JSON.stringify(seedSettings));
        sessionStorage.setItem("__rovaos_e2e_seeded", "1");
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

  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page.getByTestId("graph-view").waitFor();
  assert.equal(await page.getByRole("button", { name: "Graph", exact: true }).getAttribute("aria-current"), "page");
  for (const section of ["Filters", "Groups", "Display", "Forces"]) {
    await page.getByRole("button", { name: section }).waitFor();
  }
  const graphCanvas = page.getByTestId("graph-canvas");
  const graphSize = await graphCanvas.evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { cssWidth: rect.width, cssHeight: rect.height, width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio };
  });
  assert.ok(graphSize.width >= graphSize.cssWidth && graphSize.height >= graphSize.cssHeight, "graph canvas must have a DPR-aware backing store");
  await page.getByLabel("Search graph files").fill("Q3 planning");
  await page.getByText(/nodes/).last().waitFor();
  const filteredNodeCount = Number((await page.locator(".graph-status span").first().innerText()).split(" ")[0]);
  assert.ok(filteredNodeCount > 0 && filteredNodeCount < 100, "graph search should filter the visible vault");
  await page.getByLabel("Search graph files").fill("");
  await page.locator(".graph-toggle-row", { hasText: "Show orphans" }).locator("input").uncheck({ force: true });
  await page.locator(".graph-range", { hasText: "Repel force" }).locator("input").fill("35");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByText("106%").waitFor();

  const canvasBox = await graphCanvas.boundingBox();
  const nodePoint = await graphCanvas.evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 55; y < rect.height - 45; y += 2) {
      for (let x = 305; x < rect.width - 35; x += 2) {
        const offset = (Math.floor(y * dpr) * canvas.width + Math.floor(x * dpr)) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        if (Math.max(r, g, b) > 170 && Math.max(r, g, b) - Math.min(r, g, b) > 32) return { x, y };
      }
    }
    return null;
  });
  assert.ok(canvasBox && nodePoint, "graph should expose selectable canvas nodes");
  await page.mouse.click(canvasBox.x + nodePoint.x, canvasBox.y + nodePoint.y);
  await page.getByTestId("graph-preview").waitFor();
  assert.ok((await page.locator(".graph-wikilinks button").count()) > 0, "selected note should expose real neighbor wikilinks");
  await shot(page, "09-graph-desktop");
  await page.getByRole("button", { name: "Close note preview" }).click();
  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("home-screen").waitFor();

  const input = page.getByTestId("composer-input");
  const attachmentButton = page.getByRole("button", { name: "File attachments unavailable" });
  assert.equal(await attachmentButton.isDisabled(), true);
  await page.getByText("File uploads are unavailable; only your typed message is sent.").waitFor();
  await input.click();
  await input.fill("stoppable request");
  await page.getByTestId("send-button").waitFor();
  await shot(page, "03-typed-send");
  await input.press("Enter");
  await page.getByTestId("user-message").waitFor();
  await page.getByTestId("stop-button").waitFor();
  await shot(page, "04-conversation-transition");
  await page.getByTestId("stop-button").click();
  await page.locator(".msg-flag", { hasText: "Stopped" }).waitFor();
  await page.getByTestId("stop-button").waitFor({ state: "detached" });

  const dockedInput = page.getByTestId("composer-input");
  await dockedInput.fill("first line");
  await dockedInput.press("Shift+Enter");
  await dockedInput.type("second line");
  assert.equal(await dockedInput.inputValue(), "first line\nsecond line");
  const height = await dockedInput.evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 28, "composer textarea should auto-grow after multiline input");
  await dockedInput.fill("");

  await dockedInput.fill("missing tool result");
  await dockedInput.press("Enter");
  await page.getByText("The backend finished without returning a tool result.").waitFor();
  const missingResultChip = page.getByTestId("tool-chip").last();
  await missingResultChip.locator(".tool-chip-summary", { hasText: "No result was returned before the response completed." }).waitFor();
  assert.ok((await missingResultChip.getAttribute("class")).includes("error"), "missing tool results must render as errors");

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("composer-input").fill("forced backend error");
  await page.getByTestId("composer-input").press("Enter");
  await page.getByTestId("error-note").getByText("Calendar connection failed safely.").waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="conversation-error-announcement"]')?.textContent?.includes("Calendar connection failed safely")
  );

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
    await page.getByTestId("assistant-message").last().getByText("Done. I handled").waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="conversation-announcement"]')?.textContent?.includes("RovaOS response complete")
    );
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
  assert.equal(await page.locator(".app-frame").getAttribute("inert"), "", "settings should make the app background inert");
  assert.equal(await page.locator(".app-frame").getAttribute("aria-hidden"), "true");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close settings");
  assert.equal(await page.getByRole("dialog", { name: "Settings" }).count(), 1);
  await page.getByRole("button", { name: "Anthropic key" }).click();
  await page.getByLabel("Anthropic API key").fill("sk-ant-test");
  await page.getByRole("button", { name: "Show key" }).click();
  assert.equal(await page.getByLabel("Anthropic API key").getAttribute("type"), "text");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("rovaos.settings.v2")?.includes("sk-ant-test") || false),
    false,
    "direct Anthropic key must remain session-only"
  );
  await page.getByLabel("Model").selectOption(MODEL);
  await page.getByRole("button", { name: "Local RovaOS" }).click();
  await page.getByLabel("Backend URL").fill(MOCK_WS);
  await page.getByRole("button", { name: "Test" }).click();
  await page.getByText(/Backend reachable\./).waitFor();
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
  await page.locator(".tool-chip-title", { hasText: "List recent email" }).waitFor();
  await page.locator(".tool-chip-summary", { hasText: "7 results" }).waitFor();
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
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Settings");

  await assertNoEmoji(page);
  assertCleanConsole(issues, "desktop flows");
  await run.context.close();
}

async function approvalFlows(browser, stats) {
  const run = await newPage(browser);
  const { page, issues } = run;
  await page.goto(APP_URL);

  const input = page.getByTestId("composer-input");
  await input.fill("approval email approve");
  await input.press("Enter");

  const card = page.getByTestId("approval-card");
  await card.waitFor();
  assert.equal(await card.getAttribute("data-approval-status"), "pending");
  await card.getByText("Approval required", { exact: true }).waitFor();
  await card.getByText("Send Email", { exact: true }).waitFor();
  await card.getByText("Send one email to client@example.com.").waitFor();
  await card.getByText(/Expires .+ GMT|Expires .+ UTC|Expires .+ EDT|Expires .+ EST/).waitFor();
  assert.equal(
    await card.getByTestId("approval-arguments").textContent(),
    JSON.stringify(
      { to: ["client@example.com"], subject: "Approved note", body: "Exact reviewed body" },
      null,
      2
    ),
    "the approval must show the exact sanitized arguments"
  );

  await page.waitForTimeout(350);
  const tokenExposure = await page.evaluate((secret) => ({
    dom: document.documentElement.outerHTML.includes(secret),
    storage: Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index))).some((value) => value?.includes(secret)),
  }), APPROVAL_SECRET);
  assert.deepEqual(tokenExposure, { dom: false, storage: false }, "approval tokens must never enter DOM or localStorage");
  await shot(page, "11-approval-pending");

  const review = card.getByRole("button", { name: "Review exact arguments" });
  await review.click();
  await card.getByTestId("approval-arguments").waitFor({ state: "detached" });
  await review.click();
  await card.getByTestId("approval-arguments").waitFor();

  // Natural-language confirmation is just another chat message and must never
  // invoke the structured approval channel.
  await page.getByTestId("composer-input").fill("yes");
  await page.getByTestId("composer-input").press("Enter");
  await page.getByTestId("assistant-message").last().getByText("Done. I handled").waitFor();
  assert.equal(stats.decisions, 0, "conversational yes must not approve an action");
  assert.equal(await card.getAttribute("data-approval-status"), "pending");

  const approve = card.getByRole("button", { name: "Approve action" });
  const cancel = card.getByRole("button", { name: "Cancel action" });
  assert.equal(await approve.isEnabled(), true);
  assert.equal(await cancel.isEnabled(), true);
  await approve.click();
  assert.equal(await approve.isDisabled(), true, "approve must become single-use immediately");
  assert.equal(await cancel.isDisabled(), true, "cancel must disable once a decision starts");
  await page.locator('[data-testid="approval-card"][data-approval-status="succeeded"]').waitFor();
  assert.equal(await page.getByTestId("approval-card").count(), 1, "the result must update the original approval block");
  await card.getByText("Action completed", { exact: true }).waitFor();
  await card.getByTestId("approval-result").getByText('"status": "sent"').waitFor();
  // The pre-approval prose stays visible as historical context, and a newer
  // execution summary states what actually happened after approval.
  await page.getByText("This email has not been sent. It is waiting for structured approval.").waitFor();
  await page.getByTestId("execution-summary").getByText(/Approved action completed at .+ — see the result card above\./).waitFor();
  await shot(page, "12-approval-completed");
  assert.equal(stats.decisions, 1);
  assert.equal(stats.executions, 1);

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("composer-input").fill("approval email cancel");
  await page.getByTestId("composer-input").press("Enter");
  const cancelCard = page.getByTestId("approval-card");
  await cancelCard.waitFor();
  await cancelCard.getByRole("button", { name: "Cancel action" }).click();
  await page.locator('[data-testid="approval-card"][data-approval-status="cancelled"]').waitFor();
  await cancelCard.getByText("Action cancelled", { exact: true }).waitFor();
  await page.getByTestId("execution-summary").getByText(/Action cancelled before execution at .+\. Nothing ran\./).waitFor();
  assert.equal(await cancelCard.getByRole("button", { name: "Approve action" }).isDisabled(), true);
  assert.equal(stats.cancellations, 1);
  assert.equal(stats.executions, 1, "cancelled actions must not execute");

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("composer-input").fill("approval email fail");
  await page.getByTestId("composer-input").press("Enter");
  const failedCard = page.getByTestId("approval-card");
  await failedCard.waitFor();
  await failedCard.getByRole("button", { name: "Approve action" }).click();
  await page.locator('[data-testid="approval-card"][data-approval-status="failed"]').waitFor();
  await failedCard.getByText("Email provider rejected the action safely.", { exact: true }).waitFor();
  await page.getByTestId("execution-summary").getByText(/Approved action failed at .+ — see the result card above\./).waitFor();
  assert.equal(await failedCard.getByRole("button", { name: "Approve action" }).isDisabled(), true);
  assert.equal(stats.failures, 1);
  assert.equal(stats.executions, 1, "failed actions must not be reported as successful executions");

  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.getByTestId("composer-input").fill("approval email expire");
  await page.getByTestId("composer-input").press("Enter");
  const expiredCard = page.getByTestId("approval-card");
  await expiredCard.waitFor();
  await expiredCard.getByRole("button", { name: "Approve action" }).click();
  await page.locator('[data-testid="approval-card"][data-approval-status="expired"]').waitFor();
  await page.getByTestId("execution-summary").getByText(/Approval expired without execution at .+\. Nothing ran\./).waitFor();
  assert.equal(await expiredCard.getByRole("button", { name: "Approve action" }).isDisabled(), true);
  assert.equal(stats.expirations, 1);
  assert.equal(stats.executions, 1, "expired approvals must not execute");

  assertCleanConsole(issues, "approval flows");
  await run.context.close();
}

async function persistenceAndResilience(browser) {
  const run = await newPage(browser);
  const { page, issues } = run;
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Triage my unread inbox" }).click();
  await page.getByTestId("assistant-message").last().getByText("Done. I handled").waitFor();
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

  // A pending approval persisted mid-turn (message still "working") must be
  // neutralized after a true reload: the in-memory token vault is gone, so no
  // actionable button may remain enabled.
  const stale = await newPage(browser);
  await stale.page.addInitScript(() => {
    const now = Date.now();
    const conversation = {
      id: "stale-approval",
      title: "Stale approval reload",
      titleSet: true,
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "stale-user", role: "user", text: "approval email approve", time: now, attachments: [] },
        {
          id: "stale-assistant",
          role: "assistant",
          text: "This email has not been sent. It is waiting for structured approval.",
          time: now,
          status: "working",
          blocks: [
            {
              id: "tool-action-stale",
              tool: "send_email",
              kind: "email",
              input: { to: ["client@example.com"], subject: "Stale note", body: "Exact reviewed body" },
              status: "approval_required",
              result: null,
              rawOutput: null,
              approval: {
                actionId: "action-stale",
                effect: "Send one email to client@example.com.",
                expiresAt: Math.floor(now / 1000) + 900,
                message: "Review this exact action, then use Approve or Cancel.",
                status: "pending",
                error: null,
              },
            },
          ],
        },
      ],
    };
    localStorage.setItem("rovaos.chat.v2", JSON.stringify({ conversations: [conversation], activeId: conversation.id }));
  });
  await stale.page.goto(APP_URL);
  const staleCard = stale.page.getByTestId("approval-card");
  await staleCard.waitFor();
  assert.equal(await staleCard.getAttribute("data-approval-status"), "unavailable", "a reloaded tokenless approval must become unavailable");
  assert.equal(await staleCard.getByRole("button", { name: "Approve action" }).isDisabled(), true, "approve must not stay actionable without a token");
  assert.equal(await staleCard.getByRole("button", { name: "Cancel action" }).isDisabled(), true, "cancel must not stay actionable without a token");
  await stale.page.getByTestId("execution-summary").getByText("This approval became unavailable after a reload. Nothing ran.").waitFor();
  await assertNoEmoji(stale.page);
  assertCleanConsole(stale.issues, "stale approval reload");
  await stale.context.close();
}

async function reducedMotionAndMobile(browser) {
  const reduced = await newPage(browser, { reducedMotion: "reduce" });
  await reduced.page.goto(APP_URL);
  await reduced.page.getByTestId("home-screen").waitFor();
  await reduced.page.getByTestId("composer-input").fill("reduced motion check");
  await reduced.page.getByTestId("send-button").click();
  await reduced.page.getByTestId("user-message").waitFor();
  await reduced.page.getByRole("button", { name: "Graph", exact: true }).click();
  const reducedCanvas = reduced.page.getByTestId("graph-canvas");
  await reducedCanvas.waitFor();
  await reduced.page.waitForTimeout(200);
  const reducedFrameA = await reducedCanvas.screenshot();
  await reduced.page.waitForTimeout(250);
  const reducedFrameB = await reducedCanvas.screenshot();
  assert.deepEqual(reducedFrameA, reducedFrameB, "reduced-motion graph should render pre-settled without ambient drift");
  await reduced.page.getByRole("button", { name: "Zoom in" }).click();
  await reduced.page.getByText("106%").waitFor();
  await reduced.page.goto(`${APP_URL}/?gallery`);
  await reduced.page.getByTestId("gallery-page").waitFor();
  await shot(reduced.page, "07-reduced-motion-gallery");
  await assertNoEmoji(reduced.page);
  assertCleanConsole(reduced.issues, "reduced motion");
  await reduced.context.close();

  const mobile = await newPage(browser, { viewport: { width: 390, height: 780 } });
  await mobile.page.goto(APP_URL);
  const mobileTrigger = mobile.page.getByRole("button", { name: "Open sidebar" });
  await mobileTrigger.click();
  await mobile.page.locator(".mobile-sidebar-panel .sidebar").waitFor();
  assert.equal(await mobile.page.locator("main").getAttribute("inert"), "", "mobile drawer should make main content inert");
  assert.equal(await mobile.page.locator("main").getAttribute("aria-hidden"), "true");
  assert.equal(await mobile.page.getByRole("dialog", { name: "Navigation and conversations" }).count(), 1);
  assert.equal(
    await mobile.page.evaluate(() => document.querySelector(".mobile-sidebar-panel")?.contains(document.activeElement)),
    true,
    "focus should move into the mobile drawer"
  );
  await mobile.page.keyboard.press("Escape");
  await mobile.page.getByRole("dialog", { name: "Navigation and conversations" }).waitFor({ state: "detached" });
  assert.equal(await mobile.page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open sidebar");
  await mobileTrigger.click();
  await shot(mobile.page, "08-mobile-sidebar");
  await mobile.page.locator(".mobile-sidebar-panel").getByRole("button", { name: "Graph view" }).click();
  await mobile.page.getByTestId("graph-view").waitFor();
  await mobile.page.getByRole("button", { name: "Filters" }).waitFor();
  await shot(mobile.page, "10-graph-mobile");
  await assertNoEmoji(mobile.page);
  assertCleanConsole(mobile.issues, "mobile");
  await mobile.context.close();

  const tablet = await newPage(browser, { viewport: { width: 768, height: 900 } });
  await tablet.page.goto(APP_URL);
  await tablet.page.getByRole("button", { name: "Triage my unread inbox" }).click();
  await tablet.page.getByTestId("assistant-message").last().getByText("Done. I handled").waitFor();
  await assertComposerUsable(tablet.page, "tablet conversation");
  await assertConversationPinned(tablet.page, "tablet conversation");
  const tabletTrigger = tablet.page.getByRole("button", { name: "Open sidebar" });
  await tabletTrigger.click();
  await tablet.page.getByRole("dialog", { name: "Navigation and conversations" }).waitFor();
  const tabletBounds = await tablet.page.locator(".mobile-sidebar-panel").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: window.innerWidth };
  });
  assert.ok(tabletBounds.left >= 0 && tabletBounds.right <= tabletBounds.viewport, `tablet drawer must stay in viewport (${JSON.stringify(tabletBounds)})`);
  await tablet.page.keyboard.press("Escape");
  await tablet.page.getByRole("dialog", { name: "Navigation and conversations" }).waitFor({ state: "detached" });
  await assertNoEmoji(tablet.page);
  assertCleanConsole(tablet.issues, "tablet");
  await tablet.context.close();
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const mock = await startMockBackend();
  const fallback = await startFallbackBackend();
  const browser = await chromium.launch();
  try {
    await desktopFlows(browser);
    await approvalFlows(browser, mock.stats);
    await persistenceAndResilience(browser);
    await reducedMotionAndMobile(browser);
  } finally {
    await browser.close();
    await mock.close();
    await fallback.close();
  }
  console.log("RovaOS Playwright e2e passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
