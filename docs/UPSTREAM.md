# upstream — the guide

upstream is the voice of forks: lowercase, short, dry, sure of itself. Every answer is a tree of **real public GitHub repositories**: the line from the earliest one to the one that answers what you typed.

## Routing (`route()` in `src/brain.js`)
- `/clear`, `/help`, `/about`, `/freeforks`, `/logout` — handled by the page, never by the model.
- "who are you" and the like — a fixed answer.
- Everything else — a word, an idea, a product, `owner/name`, a GitHub link, a whole sentence — is traced.

## One request, one model call (`netlify/functions/trace.mjs`)
1. **Candidates** — GitHub search for the subject of the question (`P.subject`), top 6, 2.5 s budget, cached.
2. **The model** — one chat completion: `deepseek-flash`, `thinking: {type: "disabled"}`, `response_format: json_object`, `max_tokens: 700`, 8 s budget (Netlify ends synchronous functions at 10 s). The brief is `src/prompt.js` → `SYSTEM`; the user turn is the question plus the candidates. The answer is compact json: `{"t": title, "f": focus, "n": [[repo, parent, rel, note], …], "l": lines}`, 8–14 repos. Unusable json → one retry.
3. **The check** — `netlify/lib/lineage.mjs`: one GraphQL call looks up every repo and its three most-starred forks; repos that don't exist are dropped and their children re-hung (`P.prune`), duplicates merged, names made canonical, GitHub's own forks marked `fork`, the origin's real parent added above it, and real forks with ≥ 100 stars and ≥ 0.5% of their parent's stars hung on (up to 16 points, max two per repo).
4. **The cache** — key = the question lower-cased without trailing punctuation; memory per instance and `netlify-cdn-cache-control: s-maxage=604800`. New traces: `FORKS_TRACES_PER_MIN` per IP (default 8).

`rel` ∈ fork · port · rewrite · built on · inspired by · successor. The usage of every call (input, cached, output tokens) is logged to the function log.

## Without a model
`githubOnly()` searches GitHub for what you typed, takes the most-starred match and climbs the forks GitHub records above it (up to four). The reply says it's GitHub alone.

## Backends
- **Site** — `GET /api/trace?q=` as above; `GET /api/trace` answers `{ok}` and decides which brain the page uses.
- **Claude artifact** — `claude.use("sample")`, `modelTier: "quick"`, the same brief, one call; no GitHub there, so names are drawn as given, without stars or a check.
- **GitHub only** — `netlify/functions/repos.mjs` (`/api/repos`, `/api/repos/search`) for the fallback.

## Failure modes
| What | What the user sees |
|---|---|
| model rate-limited | "too many traces at once. give it a minute." |
| viewer declined Claude | "the model is switched off for this page." |
| no model, GitHub reachable | the GitHub-only tree, labelled as such |
| neither | "couldn't reach a model or github just now. try again in a minute." |
| Stop / Esc | "stopped." |
