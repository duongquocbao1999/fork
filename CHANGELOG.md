# Changelog

## 3.5.0 — 2026-11-05

- **Coins on repositories.** Anyone with a Solana wallet launches a repository's coin on pump.fun from forks.wiki — `/launch owner/name`, *launch a coin* in a point's card, or the chip under a tree; `/coins` for the newest; `?launch=owner/name` links. One coin per repository.
- **Creator fees split once, for good**: owner 70% (an organization's part to its top 5 people), top contributors 5%, up the line 10 / 3 / 2% (GitHub's fork record first, then upstream's traced line), forks 10%. Bots and organizations are never paid; empty parts go to the owner; at most 10 recipients. People claim on pump.fun with GitHub. Decided on the server (`netlify/lib/split.mjs`); the page only shows it.
- **One bundle, all or nothing** (`netlify/lib/chain.mjs`): missing GitHub fee accounts → `create_v2` + `create_fee_sharing_config` → `update_fee_shares_v2` (admin revoked) + Jito tip. The server holds no wallet: the mint key rides encrypted in a 150-second ticket and co-signs after the wallet; the server refuses anything not byte-for-byte what it built. Listed only after the split is read back from the chain (curve creator = the config, shares equal, admin revoked).
- **The launch card**: the split with faces and parts, the line above, a logo drawn in the family style (the line it came from, the repo's amber point, the ticker) or your own upload, ticker and name, a box to tick, connect → sign once → bundle → chain, each step shown; *try again* after a rejected or dropped bundle (same repo, same day, no extra limit used).
- **Wallets through the Wallet Standard** (`src/wallet.js`, no libraries): Phantom, Solflare, Backpack and the rest; inside the X app, *open in Phantom / Solflare* lands back on the same launch.
- **The coin card**: logo, $TICKER, the address with one-tap copy, market cap and 24 h change from DexScreener when it has them, pump.fun · dexscreener · solscan, the split, share on X. **$TICKER on the trees** and in the repository list.
- `0004_launch.sql`: `launches`, `launch_attempts`, `launch_blocklist`; `api_launch_state` / `reserve` / `get` / `settle`, `api_tokens`, `api_tokens_recent`; `launch.per_day` in `app_config`. Before it's run, `/launch` shows a preview and trees show no coins.
- `/api/health`: `launch.ready` and `launch.missing`. New env: `SOLANA_RPC_URL`; optional `JITO_URL`, `PUMP_IPFS_URL`, `LAUNCH_BUILDS_PER_MIN`. `npm install` before a CLI deploy.
- Fixed: the invite pill wasn't icon-only on narrow phones.

## 3.4.0 — 2026-11-04

- **New letters.** Headings and numbers in Anybody (heavy, variable width), everything else in JetBrains Mono; both self-hosted from `fonts/` (OFL), so the page and the share card draw the same on every phone. Instrument Serif and Google Fonts are gone.
- **Six trials, 10,000 together**: follow 2,000 · like 1,000 · retweet 1,500 · comment 1,500 · ask upstream anything 1,000 · quote with your fork card 3,000. "repost" reads "retweet".
- **Ask upstream anything**: the trial waits for your next tree and counts when it lands (the server compares your tree count with the one it noted when the trial opened).
- **Your fork card**, drawn like a repository page: `forkwiki / @handle` with a Fork button counting your $FORK, the commits that made it (x scan, trials, trees, invites) down to `HEAD → main`, an allocation bar, squares of 500, and your invite link as `git clone`. 1920×1080 PNG from a canvas: **copy card** (clipboard; share sheet or download where images can't be copied), **quote on x** (text with your numbers and your invite link, quoting the post), **save image**.
- **The quote, checked by its link**: `x.com/<you>/status/<id>` — the handle must be yours, the post newer than your forks account (time read from the id), and no post counts for two people.
- **Invites**: `forks.wiki/r/<handle>` → `?ref=` kept 30 days → through the X sign-in → bound once, to a brand-new account, never to yourself. +2,000 to the inviter when the friend finishes three trials (`ref.reward`, `ref.min_tasks`, `ref.min_followers` in `app_config`). An *invite* pill in the header and `/invite`: your link, copy, share, signed in · counted · earned.
- Removed the "not a balance until $FORK launches. i'll be here." line.
- `0003_refs.sql`: `tasks.verify`, `task_completions.base/proof`, `profiles.ref_code`, `referrals`, `ensure_ref_code`, `ref_qualify`, `quote_check`, `upsert_x_user(…, p_ref)`, `api_task_claim(…, p_proof)`. Older migrations can be re-run without resetting amounts or the schema version; sign-in falls back through older signatures until 0003 is run; `/api/health` lists what's missing.

## 3.3.0 — 2026-11-04

- **The x scan.** At the first sign-in the server reads the X account (`users/me` with `public_metrics`, `verified`, `verified_type`) and forks it a one-time pending allocation from five lines — time on X, followers, posts, lists, verified — each saturating on its own; an account that adds up to little gets a floor through a *first fork* line. Once per account for sure: ledger key `scan:<uid>`, and the lines are kept only when that call paid. Knobs in the new `app_config` table (`cfg(key, default)`), defaults in `supabase/migrations/0002_scan.sql`.
- The page plays the scan back: *reading* with a sweep, each number scrambling in, its amount popping, the total counting up, then the tokens fly from the total into the header pill, which ticks up as they land. The header holds the scan back until it has been played. Reduced motion: all at once, no flight. The site never states a range.
- **Trials worth 10,000**: follow 3,000 · like 2,000 · repost 2,500 · comment 2,500 (new claims; earlier ones keep what they paid). The button reads *get +10,000 $FORK*.
- **Your fork**, after the last trial: the allocation counting up, *x scan* and *trials · 4/4*, trees grown and repositories seen, the wallet inline, a share button with the number. Trees grown signed out wait in the browser and go up with the sign-in (capped); a stat, never a reward.
- The X account: [@forkwikis](https://x.com/forkwikis) in the header, `/help` and the persona. The trials point at `x.com/jack/status/20` for now, so the links can be tried end to end; swap `x.post` / `x.postBy` in `src/config.js`.
- `POST /api/scan/seen`, `POST /api/seen`; `/api/me` adds `scan`, `scanSeen`, `scanTotal`, `tasksTotal`, `traces`, `reposSeen`; `/api/health` lists a missing `0002_scan.sql`. Before 0002 is run, sign-in falls back to the old `upsert_x_user` (no scan) instead of failing.

## 3.2.0 — 2026-11-04

- The repositories under a tree are folded into one line — the faces of the line, *5 repositories · line of 3 · 2 branches · ★ total* — and open on tap.
- The GitHub repo, redone: a short README with a demo GIF of a tree growing, a desktop and a phone still, how a question becomes a tree, what it costs, how to run and deploy; `docs/media/social.png` (1280×640) for the repository's social preview; the old v1 logos removed.
- Deploy notes: use the Netlify CLI or Git — dragging a zip into Netlify uploads the page without its functions.

## 3.1.0 — 2026-11-04

- **One cheap call per question.** `GET /api/trace?q=` does it all: GitHub search for candidates → **one** `deepseek-flash` call (thinking off, json out, ~250 tokens, compact `{"t","f","n":[[repo,parent,rel,note]],"l"}`) → one GraphQL check of every repo. No tool loop, no history. A bad answer gets one retry.
- **Richer trees for free.** The model is asked for 8–14 repos with the interesting branches (famous forks, ports, rewrites, successors); the server adds each repo's most-starred real forks (≥ 100 stars and ≥ 0.5% of the parent) up to 16 points, drops what doesn't exist, merges duplicates, marks GitHub's forks, adds the origin's real parent.
- **Cached.** The same question (any case, with or without "?") never reaches the model twice: memory per instance + Netlify CDN for a week. New traces are limited per IP (`FORKS_TRACES_PER_MIN`, default 8).
- **The repositories under the tree.** A panel with the line (numbered) and the branches: owner avatar, `owner/name`, description, language dot, since when, how it came from its parent, stars; every row opens GitHub. Points on the stage are sized by stars.
- The brief lives in `src/prompt.js`, shared by the function and the Claude artifact. Removed `ask.mjs`, the tool loop and `netlify/lib/upstream.mjs` / `build-upstream.cjs`.

## 3.0.0 — 2026-11-04

- **Every point is a GitHub repository.** You type anything; upstream finds the real repositories with `search_repos` and proposes the line with `trace_repos` (fork, port, rewrite, built on, inspired by, successor); `/api/repos` checks every one in a single GraphQL call, drops what doesn't exist, takes the canonical name, marks GitHub's own forks and adds the origin's real parent above it. Stars, years and links on the stage are GitHub's.
- A repository's card: description, `★ stars · language · since`, how it came from its parent, links to GitHub, its forks, the network graph and the homepage; *trace from here*, *what did it become?*.
- Without a model, GitHub alone: the most-starred match and the forks recorded above it.
- `netlify/functions/repos.mjs` (`GITHUB_TOKEN`): GraphQL lookup of up to 12 repos, search, CDN cache for a day, memory cache, per-IP limit. `/api/health` reports `github`.
- Removed the meme archive (`src/data.js`, `src/archive.js`), its scripts, charts, docs and the GitHub Pages workflow; the archive button and the meme starters. New starters about code.

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
