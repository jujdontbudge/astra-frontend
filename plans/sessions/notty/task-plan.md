# Task Plan — Astra: ship-ready agent chat

**Goal:** Turn the static "Astra" mockup into a fully-functional, deployable SPA. Keep the
glass aesthetic + animations. Every control must do something real. Remove dead code.

## Architecture
- **Agent engine** (`src/agent/`): unified event stream consumed by the UI.
  - `simulated.js` — rich local agent (plan -> tools -> verify -> summary), default, zero setup.
  - `anthropic.js` — optional BYOK streaming to api.anthropic.com (key stored per-browser).
  - `runAgent.js` — dispatch (key present -> real, else -> simulated).
- **State** (`src/context/`): `ChatContext` (conversations/messages/streaming, localStorage),
  `SettingsContext` (apiKey/model/mode/theme, localStorage).
- **Components** (`src/components/`): Sidebar (threads), StartScreen, Conversation, Message,
  AgentBlocks (plan/diff/terminal/verify/browse/image), Composer, SettingsModal.
- **lib/**: minimal safe markdown renderer + utils.

## Functional requirements (all must work)
- Real multi-conversation chat, persisted; new/rename/delete/search threads.
- Streaming agent responses with stop/interrupt.
- Plan timeline + tool cards + verify checklist (simulation).
- Multi-line composer (Enter send / Shift+Enter newline), working image attachments.
- Ask vs Build mode.
- Settings: BYOK key + model + theme + clear data.
- Responsive (desktop glass look preserved; usable on mobile via drawer).
- `npm run build` clean; deployable static (base: './').

## Removed
- Fake setTimeout reply, dead capability nav, decorative buttons, fixed-1920 `--px` scaling.

> Last updated: 2026-07-05 12:52:39
