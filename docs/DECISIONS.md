# Decisions

Non-obvious choices, one line of why each.

- **Every point is a real GitHub repository** — the model proposes the line, `/api/repos` checks every repo in one GraphQL call and the page only draws what exists, with GitHub's stars, dates and links. A link means "came from": fork, port, rewrite, built on, inspired by, successor — GitHub's own fork records are marked as forks and extend the line upward.
- **Memes are gone** — the 81-object meme archive and its scripts were removed in 3.0; history keeps them.
- **The answer is a growing tree, not a chat bubble** — every lineage plays on a wide stage: probes while looking, then origin → each point → the asked thing, side forks sprouting as the line passes; the text is the caption under it. Phones get the same tree as rows (git-graph), never a squeezed horizontal one.
- **Every reply draws a tree** — a reply that came back as text alone is asked again with `trace_repos` forced.
- **One GraphQL call per tree** — up to 12 repos per request instead of 12 REST calls; answers cached on Netlify's CDN for a day, so a popular line costs nothing the second time.
- **Links come from GitHub, not the model** — a point's card links its `html_url`, `/forks`, `/network` and homepage as GitHub returns them.
- **`/api/ask` owns the prompt and the tools** — built from `brain.js` into `netlify/lib/upstream.mjs`; callers can only send chat turns, so the key can't be used as a free model.
- **Trials are checked by time, not by X** — `api_task_open` stamps the server clock, `api_task_claim` counts after `min_wait_sec` (5 s). Real checks need the paid X API; the UI calls the wait "verifying" and never claims more.
- **The comment trial opens the post itself** — `intent/tweet?in_reply_to=` becomes a quote post in the X app (krill).
- **Amounts live in SQL** — `tasks.reward`; the browser sends a task id, the ledger key `task:<uid>:<task>` makes every credit land once, and the claim reports what was actually credited.
- **No count over profiles on `/api/me`** — glyph lost its database to that under load.
- **One config for page and server** — `src/config.js` is a classic script in the page and a CommonJS module for the functions, so the X account and post can't drift between them.
- **No dependencies** — Supabase over PostgREST with `fetch`, crypto from `node:crypto`; `npm start` runs every function by its `config.path`.
- **Demo only off the live host** — where `/api/me` isn't there (preview, artifact, `npm start` without env) the trials run on localStorage, labelled demo; on forks.wiki a broken API shows "the ledger isn't answering" instead.
- **Session = signed cookie** — `forks_session` HMAC-SHA256, HttpOnly, SameSite=Lax, 30 days; the X token is revoked right after the profile read.
