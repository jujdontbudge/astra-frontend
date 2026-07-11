# RovaOS — Hero Launch Cinematic (Plan & Storyboard)

**Status:** In production
**Format:** 16:9, 1080p, ~50–55s (primary). Optional 9:16 social cut after.
**Audience:** Business owners — "your calendar, email, and meetings, handled."
**Look:** RovaOS's own language — near-black `#0a0a0b`, violet accent `#8b7cff`, soft glow, restraint. No emoji, no stock-y clutter.

## Architecture — HYBRID (why)
AI video models cannot faithfully render a *specific* product UI; they hallucinate a fake interface. So:
- **The product itself = real screen-recorded footage** of the running RovaOS app, driven deterministically (Playwright + the e2e mock backend). This is the heart of the film and costs **0 credits**.
- **Higgsfield = the cinematic connective tissue** where AI shines and hallucination doesn't hurt: an abstract brand genesis intro, 1–2 atmospheric beauty shots, an outro, and a custom music bed.
- **ffmpeg** sequences everything, adds crossfades, overlays in-brand titles, mixes the music, exports.

## Storyboard — three acts

### ACT I · GENESIS (~0:00–0:07) — AI
Black. A single violet spark. Energy/particles converge into a luminous orb that resolves into the RovaOS mark. Cinematic riser + soft whoosh (native audio). Wordmark settles: **RovaOS**.
- Shots: `brand-keyframe` (nano_banana_2) → `intro` (veo3_1_lite img→video, 8s, audio).

### ACT II · THE PRODUCT (~0:07–0:42) — REAL UI, the payoff
The captivating core. Real footage, slow deliberate pacing, title callouts punctuating each beat.
1. **Home materializes** — "Good afternoon, Rohan.", composer, suggestion chips, live cards (Rohan 1:1 · 4 events · 7 unread). Slow push-in.
2. **A request is typed** — "Schedule the Q3 planning sync with Ben and Maya" → Send appears → the **signature zoom transition** into the conversation.
3. **THE MONEY SHOT — RovaOS acts.** The CalendarCard animates in ("Meeting booked — Q3 planning sync", date tile **24**, When/Where/Guests, checkmark path-draws), then the EmailCard ("Email sent — Q3 planning sync confirmed"). Premium signature motion.
4. **Breadth** — fast, confident montage: gallery replays (calendar / email / error states) + a chip flow (Triage inbox → tool chip → 7 results). Conveys range across ~95 tools.
- Title overlays (RovaOS type): *Books your meetings.* / *Triages your inbox.* / *Drafts and sends email.* / *Ninety-five tools. One conversation.*
- Shots: `ui-home`, `ui-type-zoom`, `ui-booking` (hero), `ui-gallery`, `ui-chip` — all real capture.

### ACT III · RESOLUTION (~0:42–0:52) — AI + title
UI dissolves into violet light; the mark reforms. Lockup: **RovaOS — your day, handled.** Energy settles to black.
- Shots: `outro` (veo3_1_lite img→video from the same keyframe).

## Audio
One continuous **sonilo_music** bed (~52s): cinematic ambient electronic — warm intro → building mid → resolved tail. Intro shot keeps its native whoosh under the music; UI section stays clean with music only.

## Credit budget (of 270)
| Element | Model | Est. credits |
|---|---|---|
| Brand keyframe | nano_banana_2 | 2 |
| Intro (8s, audio) | veo3_1_lite | 12 |
| Outro (~6–8s) | veo3_1_lite | 9 |
| Atmospheric shot ×1–2 | veo3_1_lite | 8–12 ea |
| Music bed (~52s) | sonilo_music | 3 |
| Real UI footage | Playwright | 0 |
| Re-roll buffer | — | ~30 |
| **Total** | | **~70–90** |

## Pipeline / status
1. [in progress] Capture real UI footage → `assets/cinematic/ui/*.mp4`
2. [ ] Generate AI shots + music → `assets/cinematic/ai/*`
3. [ ] Build title cards → `assets/cinematic/titles/*.png` (alpha)
4. [ ] Assemble with ffmpeg → `assets/cinematic/rovaos-hero.mp4`
5. [ ] Deliver + review; iterate

## Tools
- Playwright 1.61 + chromium (installed), reusing `tests/rovaos-e2e.mjs` mock backend for deterministic UI performance.
- Higgsfield CLI (`generate create … --wait`) for video/image/music; ffmpeg at `/Users/johansardar/anaconda3/bin/ffmpeg`.
