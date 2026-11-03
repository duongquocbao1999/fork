# upstream — the guide

upstream is the voice of forks: lowercase, short, dry, honest. It has two layers, and the page always says which one answered.

## Archive layer (`src/brain.js`)
Runs first, in the browser, on every message.

1. **detect()** — slash commands, then intent by pattern (English + Russian): persona, help, hot, archive, random, sources, changed, became, origin, describe. Stop-words are removed to leave the entity.
2. **H.search()** — exact name (98) → ticker (100) → handle / URL from sources (92–96) → aliases (94) → prefix / contains → word hits; then Levenshtein similarity ≥ 0.72 on names and aliases; Cyrillic is also tried transliterated (`чилл гай` → `chill gay` → Chill Guy).
3. **archiveAnswer(raw, { strict })** — with a model available the page calls it strict: the archive answers by itself only when the query names one of its objects exactly (`H.exact`: name, alias, ticker, handle, source URL or id). Everything else goes to the model. Without a model a hit scoring ≥ 58 is enough, and below that upstream offers the nearest matches.

Keyword shortcuts (hot, archive, random, help) only work as slash commands; plain words are always traced. Persona answers only for exact questions like "who are you".

## Model layer
Everything the archive couldn't place — a word, a phrase, a name, a whole sentence. The model gets the last ten turns and a system brief (`RULES` in `brain.js`). It **does not get the archive** — it gets tools that run in the page:

| Tool | Does | Returns to the model |
|---|---|---|
| `search_archive(query)` | fuzzy search | up to 6 `{id, name, type, when, platform, family, parent, descendants}` |
| `show_lineage(id)` | draws the lineage card, lights the field | object, description, ancestors, children, path confidence |
| `show_mutation(ancestor_id, descendant_id)` | draws then → now | changed traits |
| `show_sources(id)` | draws the sources card | source titles |
| `show_hot()` | draws forking now | names + 30-day forks |
| `trace_lineage(title, nodes)` | draws a lineage card for anything outside the archive: 2–9 nodes, `nodes[0]` the origin, each node `{name, parent, when, note}`, the asked-about node marked `query: true`; the line to it is lit in mint | "drawn for the user" |

Every message must end with exactly one tree; if a reply comes back without one, the page asks again with `trace_lineage` forced (endpoint: `force` → `tool_choice`; Claude: the instruction appended to the last turn). Rules the model is given: reply in the user's language; search once and never change archive facts; anything counts, from a single word to a whole sentence; outside the archive, trace with `trace_lineage` (4–9 nodes, a year per node, what changed at each fork), keep to the account most people who know the subject would agree with and give years when exact dates aren't well known; state the takeaway plainly; never invent links or sources; no financial advice; point $FORK questions to `/freeforks`; one line for off-topic questions.

Traced answers are tagged `traced` (archive answers `archive`), and the home screen's fine print says archive lines are hand-sourced and everything else is traced live.

`/freeforks` and `/logout` never reach the model: `detect()` returns intent `quest` / `logout` and the page runs them (`src/quest.js`).

## Backends
- **Claude artifact** — `claude.use("sample")`, `modelTier: "quick"`, streamed text, tools executed in the page. If the viewer declines, upstream falls back to the archive and says so.
- **Endpoint** — `POST /api/ask` with OpenAI-style `messages` (user / assistant / tool turns only); up to five tool rounds per answer. `netlify/functions/ask.mjs` proxies to any OpenAI-compatible URL with the key held server-side. The system brief and the tool list are **not** taken from the request: `npm run build` copies `RULES` and the tool schemas from `brain.js` into `netlify/lib/upstream.mjs`, and the function always sends those. A request with a `system` turn, an unknown tool or no user turn gets 400, so the endpoint can't be borrowed as a general-purpose model. `GET /api/ask` → `{ok}` decides whether the AI pill lights up.
- **None** — archive only. Nothing breaks.

## Failure modes
| Code | What the user sees |
|---|---|
| `not_granted` | "the model is switched off for this page, so here is what the archive says." |
| `rate_limited` / 429 | "the model needs a breather. the archive says:" |
| `cancelled` (Stop / Esc) | whatever arrived, or "stopped." |
| anything else | the archive's not-found answer, tagged `archive` |
