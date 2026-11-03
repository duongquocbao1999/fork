# Decisions

Non-obvious choices, one line of why each.

- **Any input gets a tree** — the archive answers what it has sourced; everything else goes to the model, which must draw it with `trace_lineage` (origin → forks → the asked-about thing). Traced trees are drawn like archive trees; the reply is tagged `traced`, the home fine print says what is hand-sourced, and the model is told never to invent links.
- **The answer is a growing tree, not a chat bubble** — every lineage plays on a wide stage: probes while looking, then origin → each point → the asked thing, side forks sprouting as the line passes; the text is the caption under it. Phones get the same tree as rows (git-graph), never a squeezed horizontal one.
- **Exact names only for the archive shortcut** — fuzzy archive hits ("brain" → Italian brainrot) were hijacking words people wanted traced; with a model on, only an exact name, alias, ticker, handle or link skips it.
- **Every reply draws a tree** — a reply that came back as text alone is asked again with `trace_lineage` forced.
- **The model never sees the archive** — it gets tools; archive facts reach the user only from `archive.js`.
- **`/api/ask` owns the prompt and the tools** — built from `brain.js` into `netlify/lib/upstream.mjs`; callers can only send chat turns, so the key can't be used as a free model.
- **Trials are checked by time, not by X** — `api_task_open` stamps the server clock, `api_task_claim` counts after `min_wait_sec` (5 s). Real checks need the paid X API; the UI calls the wait "verifying" and never claims more.
- **The comment trial opens the post itself** — `intent/tweet?in_reply_to=` becomes a quote post in the X app (krill).
- **Amounts live in SQL** — `tasks.reward`; the browser sends a task id, the ledger key `task:<uid>:<task>` makes every credit land once, and the claim reports what was actually credited.
- **No count over profiles on `/api/me`** — glyph lost its database to that under load.
- **One config for page and server** — `src/config.js` is a classic script in the page and a CommonJS module for the functions, so the X account and post can't drift between them.
- **No dependencies** — Supabase over PostgREST with `fetch`, crypto from `node:crypto`; `npm start` runs every function by its `config.path`.
- **Demo only off the live host** — where `/api/me` isn't there (preview, artifact, `npm start` without env) the trials run on localStorage, labelled demo; on forks.wiki a broken API shows "the ledger isn't answering" instead.
- **Session = signed cookie** — `forks_session` HMAC-SHA256, HttpOnly, SameSite=Lax, 30 days; the X token is revoked right after the profile read.
