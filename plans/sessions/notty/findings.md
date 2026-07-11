# Findings

## Graph implementation

- Built and verified: 450 deterministic nodes, 982 links, six clusters, 12 orphans.
- Unit, production build, desktop/mobile Playwright, and reduced-motion tests pass.
- In-app browser visual QA confirmed node preview, search filtering, and Obsidian-style controls.

## Canonical RovaOS audit

- `/Users/johansardar/rovalabs` is synchronized with `origin/main` (0 ahead / 0 behind).
- The canonical backend registers 103 tools across 26 code modules; `MASTER_PLAN.md` still claims
  95 tools and lists several inaccurate counts/statuses.
- Anthropic is connected and verified through both direct WebSocket and real browser UI paths.
- Other connector credentials in tracked GitHub files must be treated as compromised. They were
  not copied into the live ignored `.env`.
- Microsoft consent scopes, token-cache permissions, LastPass secret handling, backend adapter
  compatibility, absolute path loading, and frontend demo-fallback behavior required repairs.
- Claimed ShareFile support has no canonical connector implementation. QuickBooks, LinkedIn, and
  Gusto access-token refresh is missing. WhatsApp incoming reads have no webhook ingestion path.
- External write tools need server-enforced structured approval and idempotency before live testing.

## Final verification session (2026-07-11)

- **All six physical browser truth checks passed** against the live backend (:8888): Calendly availability and booking fail-closed with zero side effects, support chat fail-closed (cancel path proven), restaurant search fail-closed with no invented data, Calendly listed as its own unconfigured Settings integration, and approval reload healing physically proven (pending → `unavailable`, buttons disabled, honest summary).
- **Physical testing caught a real backend bug** the unit tests missed: workbooks authored by non-openpyxl writers parse with `workbook.calculation = None`, crashing the new recalculation flag with `AttributeError`. Fixed by constructing `CalcProperties()`; test now simulates the true parse state. Lesson: fixture provenance matters — the browser fixture was JS-authored, the test fixture was openpyxl-authored.
- **Post-approval summaries (Fix A) observed live in all three outcomes** — completed, failed, and cancelled — without any tool re-execution.
- **Knowledge engine** now healthy with a separate admin token (never printed): 401 unauthorized, synthetic ingest, exact `[Source: …]` citation, cleanup to 0/0 verified.
- **UI/UX audits (3 parallel) + implementation in both copies:** the worst finds were two infinite-hang paths (WS half-open socket, stalled Anthropic stream — both now watchdogged), whole-history re-render per streaming token (fixed via memo + stable-action context split), and untouchable mobile affordances (delete/toolbar hover-gated; now visible, 44 px targets). Bundle code-split: graph + settings chunks lazy-load, physically verified.
- **Final counts:** backend 149/149, knowledge 26/26, both UI suites green twice (before and after UI changes), registry 104 exact, matrix 192 unique, secret scan value-free.
- Hidden-tab browser driving recipe that made physical QA reliable: read_page → click ref → type → screenshot pumps to advance rAF-driven animations → re-read refs → click "Send message"; approvals via "Approve action"/"Cancel action" refs; true reloads via navigate.

> Last updated: 2026-07-11 02:42:10
