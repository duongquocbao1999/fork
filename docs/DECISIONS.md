# Decisions

Non-obvious choices, one line of why each.

- **Every point is a real GitHub repository** — the model proposes the line, `/api/repos` checks every repo in one GraphQL call and the page only draws what exists, with GitHub's stars, dates and links. A link means "came from": fork, port, rewrite, built on, inspired by, successor — GitHub's own fork records are marked as forks and extend the line upward.
- **Memes are gone** — the 81-object meme archive and its scripts were removed in 3.0; history keeps them.
- **The answer is a growing tree, not a chat bubble** — every lineage plays on a wide stage: probes while looking, then origin → each point → the asked thing, side forks sprouting as the line passes; the text is the caption under it. Phones get the same tree as rows (git-graph), never a squeezed horizontal one.
- **One model call per question, not a tool loop** — the 3.0 loop (search → trace → text, 3+ calls, history resent each time) cost ~5× more; now the server does the searching and checking for free and the model answers once in compact json (~250 tokens). Thinking is off: its tokens are billed and the tree doesn't need them.
- **The list folds** — a 16-repo list under every tree was more than most people want; one line with the faces of the line and the counts, the full list a tap away.
- **Cache by question** — CDN for a week + memory; the same question costs nothing the second time.
- **Free richness from GitHub** — notable real forks (≥ 100 stars, ≥ 0.5% of the parent) are added by the server, so trees grow without more model tokens.
- **One GraphQL call per tree** — up to 12 repos per request instead of 12 REST calls; answers cached on Netlify's CDN for a day, so a popular line costs nothing the second time.
- **Links come from GitHub, not the model** — a point's card links its `html_url`, `/forks`, `/network` and homepage as GitHub returns them.
- **The server owns the prompt** — `/api/trace` takes only the question and sends its own brief (`src/prompt.js`), so the key can't be used as a free model.
- **Trials are checked by time, not by X** — `api_task_open` stamps the server clock, `api_task_claim` counts after `min_wait_sec` (5 s). Real checks need the paid X API; the UI calls the wait "verifying" and never claims more.
- **The comment trial opens the post itself** — `intent/tweet?in_reply_to=` becomes a quote post in the X app (krill).
- **Amounts live in SQL** — `tasks.reward`; the browser sends a task id, the ledger key `task:<uid>:<task>` makes every credit land once, and the claim reports what was actually credited.
- **No count over profiles on `/api/me`** — glyph lost its database to that under load.
- **One config for page and server** — `src/config.js` is a classic script in the page and a CommonJS module for the functions, so the X account and post can't drift between them.
- **No dependencies** — Supabase over PostgREST with `fetch`, crypto from `node:crypto`; `npm start` runs every function by its `config.path`.
- **Demo only off the live host** — where `/api/me` isn't there (preview, artifact, `npm start` without env) the trials run on localStorage, labelled demo; on forks.wiki a broken API shows "the ledger isn't answering" instead.
- **Session = signed cookie** — `forks_session` HMAC-SHA256, HttpOnly, SameSite=Lax, 30 days; the X token is revoked right after the profile read.
