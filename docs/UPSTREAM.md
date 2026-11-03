# upstream — the guide

upstream is the voice of forks: lowercase, short, dry, honest. It has two layers, and the page always says which one answered.

## Archive layer (`src/brain.js`)
Runs first, in the browser, on every message.

1. **detect()** — slash commands, then intent by pattern (English + Russian): persona, help, hot, archive, random, sources, changed, became, origin, describe. Stop-words are removed to leave the entity.
2. **H.search()** — exact name (98) → ticker (100) → handle / URL from sources (92–96) → aliases (94) → prefix / contains → word hits; then Levenshtein similarity ≥ 0.72 on names and aliases; Cyrillic is also tried transliterated (`чилл гай` → `chill gay` → Chill Guy).
3. **archiveAnswer()** — a hit scoring ≥ 58 is *confident*: the reply is composed from sourced fields only, with cards and follow-ups. Below that, the message goes to the model if one is available, otherwise upstream says the thing isn't in the tree and offers the nearest matches.

## Model layer
Only for messages the archive couldn't place. The model gets the last ten turns and a system brief (`RULES` in `brain.js`). It **does not get the archive** — it gets tools that run in the page:

| Tool | Does | Returns to the model |
|---|---|---|
| `search_archive(query)` | fuzzy search | up to 6 `{id, name, type, when, platform, family, parent, descendants}` |
| `show_lineage(id)` | draws the lineage card, lights the field | object, description, ancestors, children, path confidence |
| `show_mutation(ancestor_id, descendant_id)` | draws then → now | changed traits |
| `show_sources(id)` | draws the sources card | source titles |
| `show_hot()` | draws forking now | names + 30-day forks |
| `suggest_unverified_lineage(title, nodes)` | draws a dotted red tree (≤ 7 nodes) | "drawn as unverified" |

Rules the model is given: reply in the user's language; search before showing; never invent dates, platforms, people or sources for archive objects; outside the archive, sketch only with the unverified tool and say it is from memory; no financial advice; one line for off-topic questions.

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
