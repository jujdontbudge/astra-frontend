# Task Plan — "Obsidian LARP" graph view

**Goal:** A purely visual, non-functional Obsidian-style graph view that LOOKS fully functional.
Must behave/look exactly like Obsidian's graph. Reference vibe: the graph image in
https://www.yatesweb.com/adding-quality-control-to-andrej-karpathys-llm-wiki/

## Resolved spec (from /grill-me, 8/8 answered)
1. **Entry point** — new "Graph" button in the left IconRail; clicking swaps `<main>` to a
   full-bleed in-app graph screen (same mechanism as Home/Conversation swap). Any other rail
   button (New chat / Chats) returns to the chat view.
2. **Render tech** — custom **Canvas 2D + hand-rolled force sim, zero deps** (replicates
   Obsidian's PixiJS/WebGL look at this scale). Barnes-Hut quadtree for repulsion → 60fps at 400+.
3. **Node content** — generic personal-vault filler ("Meeting notes", "Q3 planning",
   "Daily 2026-07-10", "Reading list", tag-nodes), grouped into color-coded clusters.
4. **Obsidian chrome** — FULL control panel, **wired to the sim**: Filters / Groups / Display /
   Forces sections. Repel force, link distance, center force sliders retune the live sim;
   text-fade threshold controls label appearance on zoom; color-group rules recolor matching nodes.
5. **Node click** — focus (glide-center + neighborhood highlight) + fake Obsidian note-preview
   popover: fake title, a few lines of body, `[[wikilinks]]` to neighbors, a tag.
6. **Scale** — ~400+ nodes, huge multi-year-vault hairball, 4-6 clusters.
7. **Palette** — authentic Obsidian dark (#1e1e1e canvas, grey-lavender nodes, translucent grey
   links, purple hover glow, Obsidian panel styling). Note: canvas bg intentionally differs
   from app bg to read as Obsidian.
8. **Motion / a11y** — settle-then-quiesce (nodes drift in ~2s, alpha decays, sim goes quiet;
   drag or slider change re-heats then re-settles). Reduced-motion (`useReducedMotionPreference`):
   render pre-settled (run sim headless to convergence before first paint), no drift-in / re-heat
   animation, but pan/zoom/drag still work.

## Defaults taken without asking (obvious options)
- Rail icon: lucide `Waypoints` (fallback `Network`), with active state.
- Deterministic seeded PRNG so the vault (labels, links, layout) is stable across reloads.
- Node radius scales with degree (link count), like Obsidian.
- Hover: highlight neighborhood, dim the rest. Zoom past text-fade threshold reveals labels.

## Implementation sketch
- `src/App.jsx` — add explicit active-view state (`chat` | `graph`) to `Shell`; render `<GraphView/>` when graph.
- `src/components/IconRail.jsx` — add Graph RailButton + `onGraph` / `active === "graph"`.
- `src/graph/fakeVault.js` — seeded generator: ~450 nodes, clusters, links, fake note bodies, tags, wikilinks.
- `src/graph/simulation.js` — force sim: Barnes-Hut repulsion, spring links, center gravity, alpha decay + reheat.
- `src/components/GraphView.jsx` — canvas render loop (pan/zoom/drag/hover, label fade), control panel, preview popover.
- `src/styles.css` — append `.graph-*` Obsidian-authentic styles (near-black canvas, Obsidian panel/sliders).
- Honor `useReducedMotionPreference`.

## Status: BUILT AND VERIFIED

- Implemented deterministic 450-node / 982-link graph with six clusters and 12 orphans.
- Implemented Canvas 2D Barnes-Hut force simulation, pan/zoom/drag/hover/focus, note previews,
  filters, groups, display controls, force controls, responsive behavior, keyboard controls, and
  reduced-motion settling.
- Added graph unit coverage and desktop/mobile/reduced-motion Playwright coverage.
- Verified with `npm run test:graph`, `npm run build`, and `npm run test:e2e` on 2026-07-10.
- Visually inspected in the in-app browser, including a real node preview and a live search filter.

> Last updated: 2026-07-11 02:42:10
