# Changelog

## 2.3.0 — 2026-11-04

- **Every point on a tree is a way out.** Tap a point (on the stage, in a card or in the full view) and its card opens: name, year, what changed, then links — the real sources for archive points, and for traced points searches built from the model's phrase for that point (X, Know Your Meme, Wikipedia, Google; DexScreener for a `$TICKER`). Then *trace from here* and *what did it become?*. A floating card on wide screens, a bottom sheet on phones.
- `trace_lineage` nodes carry `q`, the search phrase that finds the point on the web. The model still never writes URLs.

## 2.2.0 — 2026-11-03

- **The trace stage.** Every answer with a tree grows on a wide stage instead of a small card: while upstream looks, probes reach out from the root and fall back; then the line grows from its origin point by point — each point with its year and what changed — side forks sprout as it passes, the status line walks the points, and it arrives at what you asked. Under it, the result: the name, how many forks from which origin, and upstream's lines. Phones grow top → down, one row per point, like `git log --graph`. Tap any point to trace it next; `open ↗` for the full tree.
- **Any word gets a tree.** The archive answers by itself only when you name one of its objects exactly (name, alias, ticker, handle, source link); everything else goes to upstream, which must draw a tree for every message. A reply without a tree is asked again with `trace_lineage` forced (`force` on `/api/ask` → `tool_choice`).
- Keyword shortcuts (`hot`, `latest`, `anything`, `help`…) are slash commands only, so plain words are traced.
- Fixed: Claude in the artifact viewer is waited for whatever the host (`claude.use` answers after the first script run); `cache: false` for chat.
- Home: no counter line, no "forking now", no AI pill, no update date; six starters picked fresh per visit, half from the archive, half traced live.
- A message sent while upstream is still answering is queued, not dropped. Bigger tap targets on tree points.

## 2.1.0 — 2026-11-03

- **Any input gets a tree.** Outside the archive, upstream traces the line itself with `trace_lineage`: origin → each fork with a year and what changed → the thing you asked about. Drawn like any lineage (mint path, tappable nodes, full view), tagged `traced`. Replaces the dotted "unverified" sketch.
- **$FORK · /freeforks.** A *get +5,000 $FORK* button under the input and the `/freeforks` command: sign in with X, then four trials one at a time in the chat (follow 1,500 · like 1,000 · repost 1,250 · comment 1,250), each counted by the server 5 s after its link is opened; then a Solana wallet and a summary. Allocations are pending.
- Sign in with X (OAuth 2.0 + PKCE, read-only, token revoked after the profile read), signed session cookie, `/api/health`, `/api/me`, `/api/task/open|claim`, `/api/wallet`, `/api/logout`.
- Supabase schema `supabase/migrations/0001_init.sql`: ledger with idempotency keys, rewards decided in SQL, every table closed to `anon`.
- `src/config.js`: ticker, CA, the X account and post for the trials — shared by the page and the functions.
- Demo mode for `/freeforks` where the functions aren't there (preview, artifact, `npm start` without env).
- `npm start` runs every Netlify function by its `config.path`; header pill with your pending $FORK; toasts.
- Fixed: fork-point labels in trees no longer run over the previous node's label; `hidden` always wins over component `display`.
- Docs: `SETUP.ru.md`, `.env.example`, `docs/DECISIONS.md`.

## 2.0.0 — 2026-11-03

A rebuild around one question.

- New single-screen interface: *where did it come from?*, one input, six starters, what's forking now.
- **upstream**, the guide: an instant archive layer (intent detection in English and Russian, fuzzy + transliterated search, tickers, handles, URLs) and an optional model layer that can only act through tools — it searches, draws lineage / mutation / sources / hot cards, or sketches an explicitly **unverified** lineage for things outside the archive.
- Model backends: Claude via the artifact `sample` capability, or any OpenAI-compatible endpoint through `netlify/functions/ask.mjs` (key stays server-side). Without either, the site runs archive-only.
- A reactive background canopy that listens while you type, thinks while upstream works and lights the traced path when it answers.
- Full-tree overlay, mutation card, sources card, archive card; tap any node to ask about it.
- Mint-on-black palette with a light mirror; Instrument Serif + JetBrains Mono.
- `npm run build` generates `src/archive.js` (the documented subset) from `src/data.js` and `netlify/lib/upstream.mjs` (upstream's system brief and tool list) from `src/brain.js`; the dev server also runs the model function.
- `/api/ask` sends only its own brief and tools and accepts only chat turns, so the key can't be used as a general-purpose model; same-origin JSON only, 9 s upstream timeout.
- Removed the culture-graph homepage, explore mode, map and routed views (`core.js`, `net.js`).

## 1.0.0 — 2026-10-16

- Culture graph homepage: every family drawn as plates of fork trees, ten-year time playback, signals on recent branches, explore mode that clears the overlay.
- Documented lineages with sources: Jean Philanthrope, Doge, Pepe the Frog, Chill Guy, Moo Deng, Italian brainrot, 6-7, the nihilistic penguin, #GrrMondays, Jimothy the raccoon.
- Live lineage, hot forks, cultural families, mutation explorer, deepest lineages.
- Trace, Map, Archive, object pages, mutation view, search.
- Mobile lineage stacks with a bottom-sheet inspector; keyboard navigation and list view in every graph.
- `validate`, `charts` and `serve` scripts; GitHub Pages and CI workflows.
