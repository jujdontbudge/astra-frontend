// Capture real RovaOS UI footage for the hero cinematic.
// Reuses the e2e mock backend so the app performs its signature flows deterministically.
// Records 1080p webm per beat; ffmpeg converts/sequences later. Zero Higgsfield credits.
import { mkdir, rename, rm } from "node:fs/promises";
import http from "node:http";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";

const APP_URL = process.env.ROVAOS_URL || "http://127.0.0.1:4280";
const MOCK_PORT = 18999;
const MOCK_WS = `ws://127.0.0.1:${MOCK_PORT}`;
const OUT = new URL("../../assets/cinematic/ui/", import.meta.url);
const TMP = new URL("../../assets/cinematic/ui/.tmp/", import.meta.url);
const SIZE = { width: 1920, height: 1080 };
const MODEL = "claude-sonnet-4-6";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function startMockBackend() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (url.pathname === "/api/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, integrations: { calendar: true, email: true } }));
      return;
    }
    if (url.pathname === "/api/home") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        available: true,
        nextMeeting: { subject: "Rohan 1:1", start: "2026-06-19T14:30:00-04:00", end: "2026-06-19T15:00:00-04:00" },
        todayCount: 4,
        unread: 7,
      }));
      return;
    }
    res.writeHead(404); res.end("not found");
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    let closed = false;
    ws.on("close", () => { closed = true; });
    ws.on("message", async (raw) => {
      const msg = JSON.parse(String(raw));
      const text = msg.text || "";
      await delay(500);
      if (closed || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "tool_call", id: "tool-1", tool: "list_recent_emails", input: { top: 25, unread_only: true } }));
      await delay(900);
      if (closed || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "tool_result", id: "tool-1", tool: "list_recent_emails",
        output: JSON.stringify({ emails: Array.from({ length: 7 }, (_, id) => ({ id: String(id + 1) })) }) }));
      await delay(900);
      if (closed || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "response", text: `Done. I handled "${text}" and found 7 unread messages that need triage.` }));
    });
  });
  return new Promise((resolve) => {
    server.listen(MOCK_PORT, "127.0.0.1", () =>
      resolve({ close: () => new Promise((d) => wss.close(() => server.close(d))) }));
  });
}

function seed(patch = {}) {
  return { backend: "jarvis", jarvisUrl: MOCK_WS, apiKey: "", model: MODEL, mode: "Build", ...patch };
}

async function newClip(browser, name) {
  const dir = new URL(`${name}/`, TMP).pathname;
  const context = await browser.newContext({
    viewport: SIZE,
    reducedMotion: "no-preference",
    recordVideo: { dir, size: SIZE },
  });
  const page = await context.newPage();
  await page.addInitScript((s) => {
    localStorage.clear();
    localStorage.setItem("rovaos.settings.v2", JSON.stringify(s));
  }, seed());
  return { context, page };
}

async function finish(context, page, name) {
  const video = page.video();
  await context.close();
  const src = await video.path();
  const dest = new URL(`${name}.webm`, OUT).pathname;
  await rename(src, dest);
  console.log(`saved ${name}.webm`);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  const backend = await startMockBackend();
  const browser = await chromium.launch({ headless: true });

  // Clip A — home (live cards)
  try {
    const { context, page } = await newClip(browser, "ui-home");
    await page.goto(APP_URL);
    await page.getByText("Rohan 1:1").waitFor({ timeout: 8000 });
    await delay(4500);
    await finish(context, page, "ui-home");
  } catch (e) { console.error("ui-home FAILED", e.message); }

  // Clip B — type a request → signature zoom transition into conversation
  try {
    const { context, page } = await newClip(browser, "ui-type-zoom");
    await page.goto(APP_URL);
    await page.getByText("Rohan 1:1").waitFor({ timeout: 8000 });
    await delay(900);
    const input = page.getByTestId("composer-input");
    await input.click();
    await input.pressSequentially("Triage my unread inbox and flag what needs action", { delay: 55 });
    await page.getByTestId("send-button").waitFor();
    await delay(800);
    await input.press("Enter");
    await page.getByTestId("user-message").waitFor();
    await delay(3500);
    await finish(context, page, "ui-type-zoom");
  } catch (e) { console.error("ui-type-zoom FAILED", e.message); }

  // Clip C — HERO: Preview a booking → CalendarCard + EmailCard animate in
  try {
    const { context, page } = await newClip(browser, "ui-booking");
    await page.goto(APP_URL);
    await page.getByText("Rohan 1:1").waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: "Settings" }).first().click();
    await page.getByTestId("settings-modal").waitFor();
    await delay(400);
    await page.getByRole("button", { name: "Preview a booking" }).click();
    await page.getByTestId("calendar-card").waitFor({ timeout: 8000 });
    await page.getByTestId("email-card").waitFor({ timeout: 8000 });
    await delay(5500);
    await finish(context, page, "ui-booking");
  } catch (e) { console.error("ui-booking FAILED", e.message); }

  // Clip D — gallery: breadth of card states + replays
  try {
    const { context, page } = await newClip(browser, "ui-gallery");
    await page.goto(`${APP_URL}/?gallery`);
    await page.getByTestId("gallery-page").waitFor({ timeout: 8000 });
    await delay(1600);
    const replays = await page.getByRole("button", { name: "Replay" }).all();
    for (const b of replays.slice(0, 3)) { await b.click(); await delay(1200); }
    await delay(1600);
    await finish(context, page, "ui-gallery");
  } catch (e) { console.error("ui-gallery FAILED", e.message); }

  // Clip E — breadth: a chip flow → tool chip → results
  try {
    const { context, page } = await newClip(browser, "ui-chip");
    await page.goto(APP_URL);
    await page.getByText("Rohan 1:1").waitFor({ timeout: 8000 });
    await delay(700);
    await page.getByRole("button", { name: "Triage my unread inbox" }).first().click();
    await page.getByTestId("tool-chip").waitFor({ timeout: 8000 });
    await page.getByText("7 results").waitFor({ timeout: 8000 });
    await delay(3500);
    await finish(context, page, "ui-chip");
  } catch (e) { console.error("ui-chip FAILED", e.message); }

  await browser.close();
  await backend.close();
  await rm(TMP, { recursive: true, force: true });
  console.log("done");
}

run().catch((e) => { console.error(e); process.exit(1); });
