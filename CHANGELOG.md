# Changelog

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
