# RovaOS UI Redesign — Product Requirements Document (PRD)

**Status:** Approved — ready to build · **Version:** 1.0 · **Date:** 2026-06-18 · **Owner:** Johan
**Reference:** "Aura AI" dark/minimal home (centered hero → search box → suggestion chips → live card row)
**Target:** `JohanSardar/rovalabs` → `projects/jarvis/frontend` (Vite build served by the backend at `../frontend/dist`)

> Front matter (Problem → Users) is the PRD; §0–§16 are the detailed requirements + technical design that satisfy it.

---

## Problem & opportunity

RovaOS is the executive operator surface (~95 tools across calendar, email, finance, comms). Today's UI is a generic glass chat: every tool — whether it just read the inbox or **booked a real meeting** — renders as the same gray "tool call" box, so high-value actions land with no weight, and the home screen is static prompt cards with no sense of the user's day. The opportunity is to make RovaOS feel like a premium executive operator: a focused dark surface (modeled on the Aura reference) where booking a meeting or sending an email produces a distinct, animated confirmation the user can trust at a glance.

## Goals / non-goals

**Goals**
- A premium single dark UI matching the Aura reference's calm/minimal feel, expressed in RovaOS's domain.
- **Signature confirmation cards** with custom motion when RovaOS books a meeting or sends an email — the headline feature.
- A home screen that reflects the user's actual day (next meeting / today's events / unread) when M365 is reachable.
- Every other tool reads as one clean, collapsible chip — no raw JSON, no gray boxes, no emoji.
- Motion is testable with zero backend (gallery + demo injection) so design can iterate fast.

**Non-goals (v1)** — full list in §15.
- No bespoke cards for tools beyond Calendar + Email (reminders/drafts/Teams stay generic chips).
- No light theme, no multi-user/principal switching, no inline list rendering for read tools.
- No change to the RovaOS agent, its tools, or the WebSocket wire-protocol contract.

## Success metrics / acceptance

Definition of done is the checklist in §16. In short: booking a meeting or sending an email reliably produces the matching animated hero card (content from the call, confirmation from the result); all other tools render as polished chips; `prefers-reduced-motion` degrades cleanly; the `?gallery` route + "Preview a booking" exercise every card state with no backend; The RovaOS frontend still talks to its backend over the unchanged protocol; `npm run build` is clean.

## Users & context

- **Primary user — the principal (default "Rohan").** A busy operator who delegates calendar/email/ops to RovaOS and needs at-a-glance trust that an action actually happened. The home greeting and cards serve this user.
- **Builder/operator — Johan.** Runs the local stack, iterates the UI, holds the M365/Anthropic credentials. Needs to test the animations without firing real M365 side effects (hence the gallery + demo harness).
- **Environment.** M365 runs on a shared (Ben's) tenant and may be unauthed locally; the design degrades gracefully (static home cards, demo card injection) rather than breaking.

---

## 0. One-paragraph summary

Rebuild the RovaOS frontend from zero as a single dark, premium, minimal chat surface modeled on the Aura reference but expressed in its domain (calendar / email / operations). The headline feature is **signature confirmation cards with custom motion** when RovaOS books a meeting (`create_calendar_event`) or sends an email (`send_email`). Every other tool renders as one polished, collapsible chip. The home screen leads with a time-aware greeting, a centered composer, suggestion chips, and a row of cards that show today's real data when Microsoft 365 is reachable and fall back to static quick-actions when it isn't. Stack: React 19 + Vite (fixed) + Tailwind v4 + Framer Motion.

**Hard guardrail:** the WebSocket wire protocol with the RovaOS backend is a fixed contract. A rebuild re-implements the *client*, it does not reinvent the protocol. Two small **backend** additions are required (§7) and they live in Ben's repo (`rovalabs`) — call them out explicitly before merging.

**No emoji.** Strip the `⚠️` the old error path injected and all decorative emoji. Status/među is conveyed with Lucide icons + styled chips only.

---

## 1. Decision log (locked)

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| 1 | Scope | Full ground-up rebuild | `src/` rebuilt; WS protocol contract preserved verbatim |
| 2 | Stack | React 19 + Vite + Tailwind v4 + Framer Motion (`motion`) | New deps: `tailwindcss@4`, `@tailwindcss/vite`, `motion` |
| 3 | Card data source | **Confirmed-only** | Card renders/animates once, when `tool_result` arrives. No optimistic in-flight card. |
| 4 | Home card row | **Hybrid**: live via `/api/home`, static fallback | New backend endpoint; graceful degrade when M365 unauthed |
| 5 | Calendar treatment | **Unified `CalendarCard`** + `EmailCard` | `create_calendar_event` → one card (attendee row only if attendees present); `send_email` → EmailCard |
| 6 | Other ~93 tools | **Polished generic chip** | One `ToolChip` component, humanized title + collapsible detail |
| 7 | Motion character | **Premium signature** | Spring entrance, SVG checkmark draw-on, staggered details, per-type sweep, soft glow. No confetti. Respects `prefers-reduced-motion`. |
| 8 | Hero line | **Time-aware greeting + configurable name** | `Good morning, Rohan.` — name = 1 constant, default `Rohan` |
| 9 | Theme | **Single dark** + violet accent | One token set; no theme toggle |
| 10 | Nav shell | **Slim icon rail (64px), expandable** | Rail → click logo to expand into full sidebar (history/search) |
| 11 | Test harness | **Gallery route + demo injection** | `?gallery` renders all card states; Settings → "Preview a booking" injects synthetic events into a live chat |

---

## 2. Tech stack & dependencies

- **React 19 + Vite** — unchanged; backend serves `projects/jarvis/frontend/dist`.
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin; tokens declared in `@theme` inside `src/index.css`.
- **Framer Motion** (`motion` package, `motion/react`) — entrances, layout transitions, SVG path draw, stagger, reduced-motion.
- **lucide-react** — all iconography (kept).
- No component library (shadcn intentionally not used — single-purpose app, bespoke look).

```
npm i motion
npm i -D tailwindcss@^4 @tailwindcss/vite
```

`vite.config.js`: add `@tailwindcss/vite` plugin. `src/index.css` starts with `@import "tailwindcss";` then an `@theme { ... }` block (tokens §4).

---

## 3. App shell & layout

```
┌────────────────────────────────────────────────────────────┐
│ rail │                      main                             │
│ 64px │                                                       │
│      │   (home OR conversation)                              │
│  A › │                                                       │
│  ⊕   │                                                       │
│  ⌕   │                                                       │
│  ▤   │                                                       │
│      │                                                       │
│  ⚙   │   [ composer — centered on home, docked in chat ]     │
└────────────────────────────────────────────────────────────┘
```

- **IconRail** (64px, fixed left): logo "A" with chevron (expand), New chat (`Plus`), Search (`Search`), History (`MessageSquare`), spacer, Settings (`Settings`) pinned bottom. Each is an icon button with a tooltip on hover. Active state = violet accent + soft pill background.
- **Expand**: clicking the logo/chevron slides out the **Sidebar** panel (animated width, `motion` `layout`) overlaying or pushing main: shows search input + chat history list (rename on double-click, delete on hover) + account row. Collapsing returns to the rail. Persist collapsed state to `localStorage("rovaos.rail.expanded")`.
- **Top-right**: intentionally empty (the status pill was removed earlier). Optionally a single ghost "New chat" icon on mobile only.
- **Main**: holds either `<Home/>` (no messages) or `<Conversation/>` (has messages), with the `<Composer/>` centered-on-home / bottom-docked-in-chat.
- **Mobile (<720px)**: rail collapses to a floating menu button (top-left) that opens the sidebar as an overlay with a scrim.

---

## 4. Design system (tokens)

Single dark theme. Declare as CSS custom properties in `@theme` so Tailwind utilities map to them.

```css
@theme {
  /* surfaces */
  --color-bg:        #0a0a0b;   /* app background (near-black) */
  --color-surface:   #141416;   /* cards, composer, rail */
  --color-surface-2: #1c1c20;   /* elevated / hover */
  --color-border:    rgba(255,255,255,0.08);
  --color-border-strong: rgba(255,255,255,0.14);

  /* text */
  --color-text:  #f4f4f5;
  --color-muted: #8a8a92;
  --color-faint: #5a5a62;

  /* accent (violet) */
  --color-accent:        #8b7cff;
  --color-accent-strong: #6d5efc;
  --color-accent-soft:   rgba(139,124,255,0.14);

  /* semantic */
  --color-success: #34d399;   /* checkmarks, "booked"/"sent" */
  --color-warning: #fbbf24;
  --color-danger:  #f87171;   /* errors (icon + chip, never an emoji) */

  /* radii */
  --radius-sm: 10px; --radius-md: 14px; --radius-lg: 20px; --radius-xl: 28px;

  /* shadow / glow */
  --shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 30px rgba(0,0,0,0.45);
  --glow-accent: 0 0 0 1px var(--color-accent-soft), 0 8px 40px rgba(139,124,255,0.18);

  /* type */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
}
```

- **Type scale**: hero `clamp(2rem, 5vw, 3.25rem)` weight 300, letter-spacing −0.02em (thin/large like the reference). Body 15px/1.55. Labels 12.5px uppercase tracking-wide muted. Mono for tool args/diffs.
- **Spacing**: 4px base; generous breathing room (the reference is airy). Main content max-width ~760px, centered.
- **Borders**: 1px hairline `--color-border`; hover lifts to `--color-border-strong`. No heavy shadows except cards.
- **Accent use**: focus rings, active nav, send button, card success accents, hero cursor. Logo mark may use a subtle violet→indigo gradient; everything else solid.

---

## 5. Home screen (`<Home/>`)

Shown when the active conversation has no messages.

```
            Good morning, Rohan.
          What should we tackle first?

      ┌──────────────────────────────────────┐
      │  Ask RovaOS anything…              [↑] │
      │  [+]                                  │
      └──────────────────────────────────────┘

   [ What's on my calendar today? ] [ Triage my inbox ]
   [ Schedule a meeting ] [ Run my morning briefing ]

   ┌─ Next ──────────┐ ┌─ Today ──┐ ┌─ Inbox ──┐
   │ Rohan 1:1       │ │ 4 events │ │ 7 unread │
   │ 2:30 PM · 30m   │ │          │ │          │
   └─────────────────┘ └──────────┘ └──────────┘
```

### 5.1 Hero
- Greeting: `Good {morning|afternoon|evening}, {NAME}.` — `NAME` from `const PRINCIPAL_NAME = "Rohan"` in `lib/config.js`. Time buckets: <12 morning, <18 afternoon, else evening.
- Subline: `What should we tackle first?` (muted).
- Entrance: fade-up, 1 beat before the composer.

### 5.2 Composer (shared component, see §6)
- On home: centered, larger, with a soft accent focus glow.
- Placeholder: `Ask RovaOS anything…`.

### 5.3 Suggestion chips (`<SuggestionChips/>`)
Static list (no emoji), clicking sends the prompt. Default set (redline freely):
1. `What's on my calendar today?`
2. `Triage my unread inbox`
3. `Schedule a meeting` (lands the user in a flow likely to fire **CalendarCard**)
4. `Run my morning briefing`

Chips: pill, hairline border, hover lifts border + slight scale; stagger-in.

### 5.4 Home cards (`<HomeCards/>`) — hybrid
- On mount, `GET {httpBase}/api/home` (derive httpBase from `jarvisUrl`, same transform as the health check).
- **If `{ available: true, ... }`** → render live cards:
  - **Next** — `nextMeeting`: subject + start time + duration; click → `What's my next meeting about?`
  - **Today** — `todayCount` events; click → `What's on my calendar today?`
  - **Inbox** — `unread` count; click → `Triage my unread inbox`
- **If unreachable / `available:false` / error / timeout (1.5s)** → render static quick-action cards (Calendar / Inbox / Briefing) that fire prompts. No error noise on the home screen.
- Cards: `--color-surface`, hairline, hover lifts; a subtle violet top-edge accent on the "Next" card. Skeleton shimmer while loading (≤1.5s).

---

## 6. Composer (`<Composer/>`)

Reused on home (centered) and in conversation (bottom-docked). Behavior carried over from the current app (it works well):
- Auto-grow textarea (max ~200px), Enter to send / Shift+Enter newline.
- Attachments: image/pdf/text; images <1.5MB embedded as data URLs (persist); chips above the input with remove buttons.
- Send button: violet, `ArrowUp`; while streaming becomes a Stop (`Square`) wired to `stop()`.
- Publishes its height to `--composer-h` so the conversation reserves bottom space (keep the existing layout-effect approach).
- Disabled state (not ready): muted, clicking opens Settings.

---

## 7. Backend changes (touch `rovalabs` — flag before merge)

Both are small and additive. They do **not** change existing message/response behavior.

### 7.1 Emit `tool_result` + add `id` to `tool_call`
In `backend/app.py`, inside the `chat()` tool loop (around the existing `result = await execute_tool(block.name, block.input)`):

```python
for block in assistant_content:
    if block.type == "tool_use":
        if ws:
            await ws.send_json({
                "type": "tool_call",
                "id": block.id,          # NEW: lets the client correlate call↔result
                "tool": block.name,
                "input": block.input,
            })
        result = await execute_tool(block.name, block.input)   # result is a JSON string
        if ws:
            await ws.send_json({
                "type": "tool_result",   # NEW
                "id": block.id,
                "tool": block.name,
                "output": result,        # JSON string; client JSON.parses it
            })
        tool_results.append({ "type": "tool_result", "tool_use_id": block.id, "content": result })
```

Notes: `output` is the already-`json.dumps`'d handler return. Client parses defensively (some tools — e.g. `book_calendly_slot` — return a plain string, not JSON; treat parse failure as `{ text: output }`).

### 7.2 New `GET /api/home`
Returns the day-at-a-glance for the hybrid home cards. Reuse existing handlers; never raise — degrade to `available:false`.

```python
@app.get("/api/home")
async def home():
    try:
        token = get_microsoft_token()
    except Exception:
        token = os.getenv("MICROSOFT_ACCESS_TOKEN", "")
    if not token:
        return {"available": False}
    try:
        events = (await calendar_tools.HANDLERS["list_upcoming_events"](token=token, days_ahead=1)).get("events", [])
        recent = (await email_tools.HANDLERS["list_recent_emails"](token=token, top=25, unread_only=True)).get("emails", [])
        next_ev = events[0] if events else None
        return {
            "available": True,
            "nextMeeting": next_ev and {"subject": next_ev["subject"], "start": next_ev["start"], "end": next_ev["end"]},
            "todayCount": len(events),
            "unread": len(recent),
        }
    except Exception:
        return {"available": False}
```

(Confirm handler signatures against the real modules when wiring; shapes per §11.)

---

## 8. Client data flow & protocol

`lib/ws.js` (was `agent/jarvis.js`) speaks the **exact** protocol:

- Connect: `ws(s)://{host}/ws/{sessionId}`
- Send: `{ "type": "message", "text": <user text>, "api_key"?: <browser key> }`
- Receive (0+): `{ "type": "tool_call",  "id", "tool", "input" }`
- Receive (0+): `{ "type": "tool_result","id", "tool", "output" }`   ← NEW
- Receive (1): `{ "type": "response", "text" }`  → resolve
- Receive (err): `{ "type": "error", "message" }`  → reject with message

### 8.1 How calls/results map to UI (the decisions — implement however you like)
- Track each tool block **by its `id`**: a `tool_call` opens a block (`running`), the matching `tool_result` completes it (`done` + parsed result). Same id = same block. (Parse `output` defensively; non-JSON → treat as plain text.)
- Classify each tool: `create_calendar_event` → calendar card, `send_email` → email card, everything else → generic chip.
- **Confirmed-only rule (decision #3):** hero cards render **only on the `done` result** and animate once; while a hero tool is running, show just the working/typing indicator (no partial hero card). Generic chips may show their running→done states live.

---

## 9. Action rendering taxonomy

`<ActionRenderer block={block}/>` switches on `block.kind`.

### 9.1 `<CalendarCard>` (`create_calendar_event`)
**Data:** content from `block.input` (`subject`, `start`, `end`, `attendees[]`, `location`, `is_online`); confirmation from `block.result` (`event_id`, `status:"created"`).
**Layout:**
```
┌─────────────────────────────────────────┐
│ ┌────┐  Meeting booked            ✓      │   ← header: date tile + title + checkmark
│ │ JUN│  Q3 planning sync                 │
│ │ 24 │  Tue · 2:30–3:00 PM · 30m         │
│ └────┘  ▢ Microsoft Teams  · 3 guests    │   ← online badge + attendee chips (only if present)
│         ◯ ◯ ◯  rohan, ben, …             │
└─────────────────────────────────────────┘
```
- Title reads "Meeting booked" if `attendees.length || is_online`, else "Event added".
- **Attendee row only renders when `attendees.length > 0`** (unified card, per decision #5).
- Teams/online badge only when `is_online`.
- Error state (`result.error` or status not created): danger accent, "Couldn't book — {reason}", no checkmark draw.

### 9.2 `<EmailCard>` (`send_email`)
**Data:** content from `input` (`to[]`, `subject`, `body`, `cc[]`, `importance`); confirmation from `result` (`status:"sent"`, `to[]`, `subject`).
**Layout:**
```
┌─────────────────────────────────────────┐
│ ✉  Email sent                     ✓      │
│    To: ben@rova…, +2                     │
│    Re: Q3 numbers                        │
│    "Hi Ben — attached the…"  (1–2 lines) │
│    [ high ]  (importance pill if not normal) │
└─────────────────────────────────────────┘
```
- Body preview clamped to 2 lines.
- `importance` pill only when `high`/`low`.
- Error state mirrors CalendarCard.

### 9.3 `<ToolChip>` (all other tools)
One collapsible row. Humanized title + one-line result summary; expand reveals args + raw result.
```
◉ Searched inbox · 7 results                 ˄
◉ Checked availability · Tue 2–4 pm free     ˄
◉ Searched the web · "Q3 filings"            ˄
```
- **Title map** (`humanizeTool`), fallback = snake_case→Title Case:
  `search_emails`→"Searched inbox", `list_recent_emails`→"Listed email", `read_email`→"Read an email", `list_upcoming_events`→"Checked calendar", `check_availability`→"Checked availability", `set_reminder`→"Set a reminder", `list_reminders`→"Listed reminders", `create_draft_email`→"Drafted an email", `reply_to_email`→"Replied", `forward_email`→"Forwarded an email", `send_teams_message`→"Sent a Teams message", `web_search`→"Searched the web", `run_morning_digest`→"Ran morning briefing", `run_eod_digest`→"Ran end-of-day digest".
- **Summary** (`summarizeResult(result)`): if array-bearing key (`results|emails|events|reminders`) → "N results"; else `result.status` prettified; else first scalar; else "done". Never dump raw JSON in the collapsed state.
- States: `running` (spinner, `Loader2` spin), `done` (filled accent dot), `error` (danger dot + reason on expand).

### 9.4 `<ErrorNote>` (no emoji)
Replaces the old `⚠️ {message}` string injection. A styled inline note: `AlertTriangle` icon (danger) + message text in a danger-tinted hairline chip. The reducer's `error` event sets `status:"error"` and stores the message in a structured field — **do not concatenate an emoji into `text`.**

---

## 10. Motion spec (Framer Motion)

The **full, descriptive choreography lives in the build brief §5** — don't duplicate it here. Contract-level rules only:
- Centralize shared variants/springs in one module; built with Framer Motion (`motion`).
- **Everything degrades to a simple fade under `prefers-reduced-motion`** (no path-draw, glow, or sweep) — use `useReducedMotion()`.
- Hero-card signatures are fixed by decision #7: soft spring arrival + brief accent glow → an SVG checkmark **path-draw** → a quick staggered detail reveal → one per-type signature (**EmailCard** a thin "seal/send" sweep; **CalendarCard** the date-tile fill). **No confetti.** Plays once on the `done` mount.
- Exact durations/easings/spring constants are Codex's to **tune by eye** against the reference (sensible start: snappy spring arrival, ~0.3s checkmark draw, small per-row stagger).

---

## 11. Reference data shapes (from backend exploration)

Exact tool I/O the cards/chip rely on (source: `projects/jarvis/backend/tools/`):

| Tool | Input (key fields) | Result (success) |
|------|--------------------|------------------|
| `create_calendar_event` | `subject, start, end, attendees[], body, location, is_online` | `{ event_id, subject, status:"created" }` |
| `send_email` | `to[], subject, body, cc[], importance` | `{ status:"sent", to[], subject, threaded }` |
| `list_upcoming_events` | `days_ahead` | `{ events:[{id,subject,start,end,location,attendees[],is_online,teams_link}] }` |
| `list_recent_emails` | `top, unread_only, from_address` | `{ emails:[{id,subject,from,date,has_attachments,preview,is_read}] }` |
| `check_availability` | `start_date, end_date` | `{ busy_slots:[{subject,start,end}], total_events, timezone }` |
| `search_emails` | `query, top, folder` | `{ results:[{id,subject,from,date,preview,is_read,...}] }` |
| `set_reminder` | `message, when, recurring, condition` | `{ status:"reminder_set", reminder:{id,message,when,...} }` |

> `create_calendar_event`'s result is thin (just `event_id, subject, status`) — that's why rich card content comes from `input`. A future enhancement could chase `event_id` through `list_upcoming_events` for the real Teams link; out of scope for v1.

---

## 12. Test harness

### 12.1 Gallery route (`?gallery`)
`App.jsx`: if `new URLSearchParams(location.search).has("gallery")` → render `<CardGallery/>` instead of the app. The gallery shows, each with a **Replay** button (remounts via changing `key`):
- CalendarCard: with attendees + online, without attendees, error
- EmailCard: sent, high-importance, error
- ToolChip: running, done-with-results, error
- ErrorNote
Lets you iterate motion with zero backend and tweak `lib/motion.js` live.

### 12.2 Demo injection (Settings → "Preview a booking")
A dev action in Settings (or a `?demo` flag) that calls a `ChatContext` helper `injectDemoAction(kind)` which pushes a synthetic assistant message containing a `done` block with sample `input`+`result` — so you see the card animate **inside a real conversation flow** without M365 or real side effects. Provide `calendar` and `email` samples.

---

## 13. File structure

Codex's call — organize by feature (shell / home / chat / blocks / composer / settings / gallery, plus a lib for the WS client, motion, and utils, and a state layer for settings + chat). The only constraints: keep the WS client, the BYOK path, and the chat/settings state isolated and reusable.

**Reuse this working logic from the current app (restyle, don't re-derive):** storage-safe `load()` guards (localStorage can throw on access — never crash), debounced persistence, mid-stream message heal on reload, abort/stop, attachment embedding, the composer height→`--composer-h` layout effect, and the health check.

---

## 14. Build order (milestones)

- **M0 — Foundation.** Add Tailwind v4 + motion. `index.css` tokens. `AppShell` + `IconRail` + expandable `Sidebar`. Dark theme renders.
- **M1 — Home.** Hero (greeting), centered Composer, SuggestionChips, **static** HomeCards.
- **M2 — Chat core.** `ws.js` with `tool_call`/`tool_result`/`response`/`error`; ChatContext blocks upsert-by-id; Conversation + Message + Typing + **ToolChip** (generic path end-to-end).
- **M3 — Hero cards.** CalendarCard + EmailCard + `motion.js` choreography (checkmark draw, stagger, per-type sweep, reduced-motion).
- **M4 — Test harness.** `?gallery` CardGallery + `injectDemoAction`. Iterate motion here.
- **M5 — Backend + live home.** `tool_result`/`tool_call id` in `app.py`; `GET /api/home`; wire HomeCards hybrid (live → static fallback). *(Touches `rovalabs` — flag.)*
- **M6 — Polish & verify.** No-emoji error path, empty/error/disabled states, mobile rail→overlay, focus rings, build clean, preview-verify, screenshot.

---

## 15. Out of scope (v1) / future

- Tier-2 cards (reminder-set, draft-created, Teams-sent) — generic chip for now.
- Inline list rendering for read tools (email rows, agenda) — generic chip for now.
- Light theme (tokens are structured so it's a drop-in later).
- Chasing `event_id` → real Teams join link in CalendarCard.
- Multi-user / non-Rohan principal switching (name is a constant).

---

## 16. Acceptance criteria

1. Home shows time-aware "Good {time}, Rohan." + centered composer + chips + card row (live when `/api/home` says available, static otherwise) — no emoji anywhere.
2. Sending a message streams a response; generic tools render as polished collapsible chips with humanized titles.
3. When `create_calendar_event` / `send_email` complete, the matching hero card animates in once (spring + drawn checkmark + staggered details + per-type sweep); attendee row appears only when attendees exist.
4. `prefers-reduced-motion` collapses all motion to a simple fade.
5. `?gallery` renders every card state with working Replay; Settings "Preview a booking" injects a card into a live chat with no backend.
6. The RovaOS frontend still talks to its backend over the unchanged WS protocol; BYOK Anthropic path still works.
7. Single dark theme, slim icon rail expandable to sidebar, top-right clean.
8. `npm run build` is clean; backend serves `frontend/dist`.
```
