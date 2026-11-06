# Changelog

## 4.3.0 — 2026-11-06

- **Season 1: launch coins, earn $FORK.** The dev of every coin launched here earns a pending $FORK allocation: +5,000 when it's live, +5,000 at $10K market cap, +10,000 at $30K, +25,000 when it graduates from the curve, +25,000 at $100K, +75,000 at $500K, +150,000 at $1M — up to 295,000 a coin. `supabase/migrations/0006_season1.sql`: `seasons`, `season_tiers`, `season_seen`, `season_excluded`, `dev_wallets`, `launches.dev_user`; every reward goes through `credit()` with one idempotency key (`s1:launch:<mint>`, `s1:cap:<mint>:<tier>`).
  - **Who's the dev**: the X account signed in when the launch was sent (attached after the wallet's signatures check out), or the one that later links the launching wallet by signing a text message with it (`/api/season/link`, ed25519 checked on the server; one X account per wallet, up to five wallets).
  - **Market caps measured by the server**: `season-tick`, a scheduled function every 10 minutes — the curve on the chain for coins still on it, DexScreener's consensus price with $5K+ liquidity after it; a milestone counts once seen twice, 10+ minutes apart; graduating is read from the chain. The page never sends an amount, a cap or a user.
  - **Limits**: three launch rewards a day per X account, accounts younger than 30 days don't earn, forks' treasury never earns, nothing after the season ends. All tunable (`app_config s1.*`, `season_tiers`).
  - **On the site**: a Season 1 section on `/launch` (the ladder, your season with your coins and the milestones they reached, *Link a wallet*, the top devs), a line in the launch form (*this launch earns you +5,000 $FORK*), a strip under the $FORK box on the home page. `/api/health` → `season`.
- **The terminal's coins on a tree use the market's consensus price** (`/api/tokens`), like the rest of the site.
- **Brand for X**: a new avatar (the fork mark with the coin at its tip) and header (*Every repo has a lineage. Some have coins.* over git → bitcoin → solana → pump.fun → your repo), in `docs/brand/`.
- The season ladder is compact on phones.

## 4.2.1 — 2026-11-06

- **The market leads with forks.** *On forks* is the first section: its own *Trending on forks* strip — the coins launched here, ranked by trading over the last hour, then the day, then market cap; the coin on `forkwiki/fork` pinned first; a *Launch a coin* card at the end — then every coin launched here, sortable (trending, market cap, volume, change, newest, curve). *Solana* comes second: Jupiter's trending strip, then the project tokens and Solana's top tokens. One filter for both. Old `?tab=` links land on the Solana list they meant.
- **Right prices when DexScreener has a broken pool.** MET showed $1,354 (the real price: $0.27) because DexScreener had a stale MET/JUP pool priced thousands of times off — and since its "liquidity" is that price times the pool's tokens, the broken pool looked the deepest. A pair is now picked by consensus: the price most of the market agrees on (pools within 3× of each other, weighed by their number of trades) or Jupiter's price when we have it; pools far from it are dropped, the deepest of the rest wins. Fixes the price, market cap, 24 h change and the chart's pool everywhere (market, sidebar, terminal).
- **A logo without words.** The generated coin logo is now a wordless fork glyph — the line the repository came from, its branches, the repository glowing on top — centred for pump.fun's round crop, in one of eight palettes picked from the repository (*another* cycles them). Upload still replaces it.
- **No fee from forks' own wallet.** A trade or a launch from the treasury wallet no longer adds a 0.5% transfer to itself; the quote says *none · forks' own wallet*.

## 4.2.0 — 2026-11-06

- **A 0.5% fee on trades made through forks — and on the buy at launch.** On a pump.fun curve it's a plain SOL transfer to forks' treasury (`launch.treasury`) inside the same transaction: taken off the SOL in on a buy, off the SOL out on a sell; the quote's minimum is net of it. Through Jupiter it's Jupiter's referral fee (`referralAccount` + `referralFee=50` on `/order`; Jupiter keeps 20% of it), on when `JUP_REFERRAL_ACCOUNT` is set — without it Jupiter trades carry no forks fee. The buy at launch pays it out of the amount entered. Every quote shows it before the wallet signs (*forks fee 0.5% · 0.005 SOL*). `config.trade.feeBps` (0 turns it off). `/api/health` → `trade.fee_bps`, `trade.jupiter_fee`.
- **Trades and the chart of a fresh coin, live from the chain.** A coin still on its curve no longer waits for GeckoTerminal to index its pool (which took minutes, sometimes longer): trades are read straight from the chain — the curve's signatures, then its transactions in one batch, SOL and tokens moved by the curve — and candles are built from them until GeckoTerminal has enough of its own. Trades refresh every 5 seconds, the chart every 10, and right after your own trade. The terminal says where the chart comes from.
- **The coin's logo shows.** Logos on IPFS (pump.fun's metadata, Pinata) load through `/api/ipfs/<cid>`: several gateways raced, images only (PNG, JPEG, GIF, WebP, ≤ 3 MB), cached for good. Optional env `PINATA_GATEWAY`.
- **pump.fun links on new coins**: *website* is the coin's page on forks (`forks.wiki/coin/<address>`, the address made before the metadata), *telegram* is the repository on GitHub. Coins launched before 4.2 keep their metadata (it can't be changed on the chain).
- **Copy CA, clearly**: the address in a pill with a labelled *Copy CA* button that turns to *Copied*; shortened on phones.
- **One market.** On top, a trending strip: forks' own coin pinned first, then Jupiter's trending Solana tokens (1 h). Below, one list — coins launched here, the project tokens, and Solana's top tokens by Jupiter's organic score (24 h; verified or high organic activity, never flagged, never stablecoins, each with a logo) — 100+ tokens with chips (all · coins · projects · top), sorts (market cap, volume, change, liquidity, newest, curve) and *show more*. The coin launched on `forkwiki/fork` (`config.market.pinRepo`) is pinned first everywhere. GeckoTerminal stays the fallback when Jupiter's lists don't answer.
- **Project tokens: BTC and ETH** on Solana (cbBTC, Wormhole ETH) — 29 in all, each with a logo (Jupiter, DexScreener, then the GitHub avatar).
- **New link-preview cards** for the home page and the market (`/og/home-42.png`, `/og/market-42.png`: the new graph, 100+ tokens, BTC and ETH) and a new social preview for the repository.
- **A new opening graph**: *from git to forks* — git → bitcoin → litecoin → dogecoin; bitcoin → ethereum and solana; solana → anza-xyz/agave → jito-solana; solana → anchor → pump.fun → forkwiki/fork. Counted in steps; the follow chips trade the coin on `forkwiki/fork` first.

## 4.1.1 — 2026-11-06

- **Launches work again: the logo and metadata go to IPFS through Pinata.** pump.fun no longer takes uploads at `pump.fun/api/ipfs` (launches stopped at *Logo and metadata to IPFS*). Now the server pins the logo, then the metadata JSON pointing to it (`name`, `symbol`, `description`, `image`, `showName`, `createdOn`, `website`, `twitter`), both to public IPFS through Pinata's v3 API, as pump.fun's own docs do, and uses `https://ipfs.io/ipfs/<cid>`. New env `PINATA_JWT` (secret); launches stay closed until it's set (`/api/health` → `launch.ipfs`, `launch.missing`). `PUMP_IPFS_URL` still works for another uploader when there's no Pinata key.
- **Logos for the project tokens**: Jupiter's token list first (what wallets show), then DexScreener (from any pair), then the project's GitHub avatar — in the market, the sidebar, the terminal, the point card and the trending tab. One batch for all 27, cached six hours (Jupiter's limit is shared with trading); a logo that doesn't load falls back to its letter.
- **Link previews**: a designed card for each page (home, market and terminal, launch, guide) at `/og/<page>-41.png` — a new file name per version, so X, Telegram and Discord fetch the new one instead of a cached old picture — with full Open Graph and X card tags (size, alt, `@forkwikis`). A real favicon (`/favicon.ico`, `/favicon.svg`) and an Apple touch icon, which crawlers and phones ask for by URL.
- **README**: what forks does in four lines, new screenshots (home with $FORK, market with logos, terminal, launch, phone), the new env, `docs/media/social.png` for the repository's social preview.

## 4.1.0 — 2026-11-06

- **$FORK on the home page, big.** A box right under the title: *up to 33,000 $FORK* — the X scan (2,000–20,000), six trials (+10,000), +2,000 per friend, GitHub (+3,000, optional) — with *Sign in with X*. Signed in, it shows your pending allocation, your progress through the trials and the next step (continue, connect GitHub, invite). On phones it stays big where it counts and the graph still starts on the first screen. The sidebar's small $FORK button is gone.
- **The trial card, fixed.** The terminal's full-width trade button style leaked into the trials and squeezed the text into a narrow column; now: an icon, the trial in one line, the reward, and a sized button that says what it does (*follow on x ↗*), with a hint that it counts about five seconds after opening. Phones: the button goes full width under the text.
- **No replay after a trial's link.** The graph grows once a visit (sessionStorage); after a reload — the X app or a phone browser often reloads the page when you come back — it's simply there. A trial whose link you opened is noted, and on return the page goes back to the trials and counts it by itself (the server's clock started when you opened it), without opening the link again.
- **Connect GitHub**, an optional trial: `/github` or the GitHub tile. GitHub's own OAuth with no scopes (public profile only), `netlify/functions/auth-github.mjs`; the token is revoked right away. `0005_github.sql`: `profiles.github_*`, `tasks.optional`, `api_github_link` (one GitHub per X account and back, accounts younger than 30 days don't count, +3,000 once through the ledger), the page can't open or claim it, referrals count the six trials only. New env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. `/api/health` → `github_connect`.
- **More tokens in the market.** 21 more project tokens, each owner checked against a live GitHub repository and each mint against DexScreener (≥ ~$15K liquidity): PYTH, W, MET, KMNO, DRIFT, DBR, MPLX, META, HNT, RENDER, MNDE, CLOUD, NOS, SHDW, ME, ORE, TNSR, MNGO, STEP, LAYER, HONEY — 27 in all. A **Trending** tab: Solana's trending tokens from GeckoTerminal (`/api/trending`, one row per token, ≥ $10K liquidity, cached two minutes). Liquidity sort.
- **Any Solana token in the terminal**: an address with a DexScreener pair (≥ $1K liquidity) opens `/coin/<address>`, labelled *Solana token · not on forks*, traded through Jupiter.

## 4.0.1 — 2026-11-06

- **Fix: the market, the terminal and launches were down on Netlify** (`/api/market`, `/api/coin`, `/api/tokens`… answered 502; the terminal said *Couldn’t read this coin*). `@solana/web3.js` pulls `rpc-websockets`, which now requires `uuid` 14 — an ES-module-only package that CommonJS can load only on Node ≥ 20.19/22.12; the functions ran on an older Node and crashed on start. `package.json` pins that `uuid` to 11 (`overrides`), so the SDKs load on Node 18, 20 and 22.
- The SDKs now load defensively (`netlify/lib/chain.mjs`): if one can't load, the functions still start — prices, charts, trades lists and coin pages keep working, and anything that needs the chain answers `not_configured` with `why: "sdk"` instead of a crash.
- `GET /api/chain`: did the market function load the Solana SDKs, which Node it runs on, the error if not. `/api/health` shows `node` and points to it; `launch.missing` lists the SDK when it's missing.
- The home sidebar fills its token prices from the market as soon as it answers, not after the graph has finished typing.

## 4.0.0 — 2026-11-06

- **A new look**, borrowed from code hosts without their names or marks: a flat canvas, boxes with a muted header, hairline borders, 6px corners, system type with mono for code and numbers, a green primary button, an underlined tab bar; dark and light. One stylesheet for every page (`css/forks.css`); the header, tabs, search, wallet menu and footer come from `src/shell.js`. The animated canvas is gone.
- **Five pages**: Graph (`/`), Market (`/market`), a terminal per coin (`/coin/<address>`), Launch (`/launch`), Guide (`/guide`). The header search opens a coin by its address or traces anything else; `/` focuses it.
- **The site opens on a graph**: where pump.fun's code comes from, on Solana — solana-labs/solana → anza-xyz/agave → jito-foundation/jito-solana, firedancer, otter-sec/anchor → pump-fun/pump-public-docs, orca-so/whirlpools → jup-ag/whirlpools, raydium-io/raydium-cp-swap — with live GitHub data, and the tokens on it.
- **Project tokens on trees**: a project's own token, by GitHub owner (SOL, PUMP, JTO, JUP, ORCA, RAY to start, in `config.projects`), sits on its repositories in blue with its price; coins launched here stay amber. Repository rows carry both as chips that open the terminal; the point card shows them with *trade →*.
- **The market**: coins launched here and the project tokens, with price, market cap, 24 h change, volume and bonding-curve progress; filter and sort; refreshes every 30 s. A coin DexScreener hasn't indexed yet is priced from its curve.
- **The terminal**: a canvas candle chart (1m–1d, GeckoTerminal), trades, the top 20 holders (the curve labelled), the fee split, the repository and the line it came from, the address, and a buy/sell panel. A coin on its pump.fun curve trades on the curve (built by the server with pump.fun's SDK, signed by the wallet, checked and sent); anything else through Jupiter (`/order` → `/execute`); SOL against USDC. Quick amounts, slippage, impact and route before signing; confirmation with a Solscan link. No forks fee on trades. Tiny prices read `0.0₅4194`.
- **The launch page**: search GitHub or paste a repository, see its card and its split, then the same form as the chat — now with **buy at launch** (up to 20 SOL, bought first in the bundle, after the split is locked) and an optional **X link** for pump.fun. Live coins open their terminal.
- **The guide** and **`/info`**: what everything is, the split, claiming on pump.fun, the terminal, $FORK, the commands.
- Wallets reconnect silently to the last one used; the header shows the wallet with a menu (balance, copy, Solscan, disconnect).
- Server: `netlify/functions/market.mjs` (`/api/market`, `/api/prices`, `/api/coin`, `/api/chart`, `/api/trades`, `/api/holders`, `/api/balance`, `/api/trade/quote`, `/api/trade/build`, `/api/trade/send`, `/api/tx`), `netlify/lib/markets.mjs`; `chain.mjs` gains the dev buy, pump.fun's Global and fee state, curve trades, holders, balances. `/api/health` adds `trade`. New optional env: `JUP_API_KEY`, `JUP_URL`. No new migration.

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
