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
- **The x scan is once per account** — `upsert_x_user` scores the account only while `profiles.scan` is empty and keeps the lines only if `credit(…, 'scan:<uid>')` actually paid, so a re-login, a grown account or a wiped row never pays twice.
- **No range on the site** — the scan shows what it read and what each line added, never a minimum or a maximum; the numbers live in SQL and `app_config`.
- **The header waits for the scan** — until `/api/scan/seen`, the pill shows the allocation without the scan, so the tokens have somewhere to land.
- **Trees grown are a stat, not a reward** — counted from the page (one tree per call, at most 20 repos; a signed-out tally goes up once, capped at 25 trees), so they never touch the ledger.
- **The quote is checked by its link, not the X API** — free and honest enough: the handle in the URL must be yours, the status id says when it was posted (snowflake), and one id counts once across everyone. It can't prove the post quotes ours.
- **The chat trial counts a real tree** — the server notes your tree count when the trial opens and pays when it has grown; the count comes from the page, so it's a small reward.
- **Referrals bind once, at account creation** — `?ref` rides in the signed OAuth cookie; only a freshly inserted profile gets a referrer, never itself; the inviter is paid when the friend finishes three trials (ledger key `ref:<friend>`).
- **The share card is a canvas, not a screenshot** — drawn from the server's numbers with self-hosted fonts, so it looks the same everywhere and copies as a PNG. GitHub's look, none of its marks.
- **Self-hosted fonts** — the canvas needs fonts it can wait for, and X's in-app browser is slow to reach Google Fonts.
- **Amounts live in SQL** — `tasks.reward`; the browser sends a task id, the ledger key `task:<uid>:<task>` makes every credit land once, and the claim reports what was actually credited.
- **No count over profiles on `/api/me`** — glyph lost its database to that under load.
- **One config for page and server** — `src/config.js` is a classic script in the page and a CommonJS module for the functions, so the X account and post can't drift between them.
- **Dependencies only where the chain is** — Supabase over PostgREST with `fetch`, crypto from `node:crypto`; `npm start` runs every function by its `config.path`. The launch function alone uses pump.fun's SDK and `@solana/web3.js` (pinned SDK, loaded through `createRequire`), because hand-encoding pump.fun's instructions is where money gets lost.
- **Demo only off the live host** — where `/api/me` isn't there (preview, artifact, `npm start` without env) the trials run on localStorage, labelled demo; on forks.wiki a broken API shows "the ledger isn't answering" instead.
- **Session = signed cookie** — `forks_session` HMAC-SHA256, HttpOnly, SameSite=Lax, 30 days; the X token is revoked right after the profile read.

## Coins on repositories (3.5)

- **The split is the server's** — from GitHub (owner, contributors, the fork parent) and upstream's own cached trace; the page never sends a holder, a share or an ancestor. It goes into the transactions, the database and the coin's description from the same plan.
- **Locked, not promised** — `update_fee_shares_v2` revokes the admin in the same bundle as the create, so neither the launcher nor forks can change the split. A Jito bundle makes the three transactions land together or not at all.
- **No wallet on the server** — the launcher pays and signs; the only key the server touches is the fresh mint keypair, encrypted (AES-256-GCM, key from `SESSION_SECRET`) inside a 150-second ticket, used once after the wallet has signed. Wallets sign first because they may rewrite a transaction; if they do, the hash check refuses it.
- **Listed from the chain, not from the request** — `/api/launch/status` reads the bonding curve and the sharing config; only creator = config, equal shares and a revoked admin make a coin `live`.
- **People, not accounts** — pump.fun can't pay a GitHub organization, so an organization's part goes to its top people; bots are skipped; empty parts go to the owner rather than to forks.
- **One coin per repository, a few repositories per wallet** — the repository is held for 10 minutes for the wallet that built it; retries on it don't use up the day.
- **No third-party marks** — the default logo is drawn from the coin's own line and ticker; avatars come from GitHub for the split only.
- **Wallet Standard, no adapter libraries** — the page hands the wallet bytes and reads back signatures; inside the X app it offers to reopen the page in a wallet's browser.

## 4.0 — the redesign, the market, the terminal

- **A code host's look, not a brand's** — boxes, tabs, labels and a green primary button read as "a place for code" at a glance; no names, logos or marks are borrowed. The animated canvas went: it fought with a flat, dense UI and cost battery on phones.
- **The site opens on a graph** — a prepared one (where pump.fun's code comes from, on Solana) with the project tokens on it and live prices, so a visitor from X understands the product before typing. Its relations were checked by hand: GitHub fork records where they exist (anza-xyz/agave ← solana-labs/solana, jup-ag/whirlpools ← orca-so/whirlpools), "built on" otherwise.
- **Project tokens by GitHub owner** — `config.projects` maps an organization to its token (pump-fun → PUMP, jup-ag → JUP…), so any trace through their repositories shows it. Mints checked against DexScreener. Blue, never amber: they aren't ours.
- **Two routes, one panel** — a coin on its pump.fun curve trades on the curve with pump.fun's SDK (the route most coins here will need, built and checked by our server, signed by the wallet); everything else goes through Jupiter's `/order` + `/execute`, which lands the transaction itself. The panel shows the route, so it's never a surprise.
- **Nothing custodial** — the server never holds a key, never chooses an amount, and sends only what the wallet signed. A Jupiter transaction is Jupiter's; a curve transaction must match the hash the server built.
- **Market data from public sources** — DexScreener for prices, GeckoTerminal for candles and trades, our RPC for holders, balances and curve progress; cached in memory and on the CDN so a crowd doesn't exhaust the free limits. A coin nobody indexes yet still shows a price and a market cap, computed from its curve.
- **Buy at launch** — the launcher may buy first, in the same bundle, after the split is locked (so even that first buy's creator fee lands in the split). Capped at 20 SOL.
- **Multi-page, still no build** — five HTML pages share `css/forks.css` and `src/shell.js`; `/coin/<mint>` is a rewrite to `coin.html`.

## 4.1 — $FORK up front, GitHub, more tokens

- **The reward is the first box on the page** — the sidebar is hidden on phones, where most of the traffic from X is; a $FORK box under the title tells everyone what there is to earn and, once signed in, where they stand. On phones it keeps the number and the button and lets the graph still start on the first screen.
- **A trial survives a reload** — the X app and phone browsers often reload a page you come back to. The opened trial is noted in sessionStorage; on return the page goes back to the trials and claims it (the server's clock is the check, as before). The showcase grows once a visit, then renders instantly.
- **GitHub as an optional trial, verified by GitHub itself** — OAuth with no scopes, the token revoked at once, the bonus decided in SQL from the session's uid. One GitHub per X account in both directions and a minimum account age: the cheapest way to farm it would be fresh accounts. It never counts toward the six trials or a referral, so it can't unlock anything else.
- **More tokens, still curated** — project tokens are added only when their GitHub organization and their mint both check out, with real liquidity. Trending comes from GeckoTerminal's own ranking and is labelled as not ours; any token with a market opens in the terminal, labelled the same way, because people paste addresses from X.
- **IPFS through Pinata** — pump.fun stopped taking uploads from other servers; its own docs pin with Pinata, so forks does the same, with one secret key on the server and the metadata JSON in the shape pump.fun's frontend writes.
- **Previews are versioned files** — chats cache a link's picture by its URL for days; a new file per version is the only refresh that reaches everyone.

## 4.2 — a fee, one market, trades from the chain

- **0.5% on trades, taken without a key** — on a curve, the fee is a SOL transfer inside the transaction the wallet signs, to the treasury address in the config; the server builds it, the quote shows it, the signed bytes are checked against what was built. Through Jupiter, Jupiter's own referral program does the same job; without a referral account the trade simply carries no forks fee. The buy at launch pays it too. The amount is never sent by the page.
- **The 10% creator share stays a pump.fun split** — the coin is created by the launcher's wallet, not ours, and that's fine: pump.fun's fee-sharing config pays every share, ours included, straight to its recipient. Creating coins from a forks wallet would mean a hot key on the server and a custodian in the middle — exactly what forks avoids.
- **A fresh coin is read from the chain** — GeckoTerminal indexes a new pool in minutes, which is the whole life of many memecoins. For a coin on its curve, the curve's own transactions (SOL and tokens it moved) are the trades, and candles are built from them until GeckoTerminal has enough of its own.
- **One market, ranked by others** — trending and top on Solana come from Jupiter's lists (verified or high organic score, never flagged, never stablecoins, each with a logo) and say so; forks' own coin is the one thing pinned, and it's labelled as pinned. (4.2.1: the coins launched here got their own section, first — see below.)
- **pump.fun's links point home** — a new coin's *website* is its page on forks and its *telegram* is the repository, so pump.fun's visitors land where the split and the code are. The mint address is made before the metadata so the link can carry it.

## 4.2.1 — forks first, prices by consensus, a logo without words

- **On forks leads the market** — the coins launched here are what forks is for, so they get the first section and their own trending strip, ranked by what anyone can check: trading over the last hour, then the day, then market cap. Solana's lists stay below, as context.
- **A price is what the market agrees on** — one broken pool on DexScreener (MET at $1,354 instead of $0.27) carried a fake "liquidity" big enough to win the deepest-pool rule. Pools are now grouped by price; the group with the most trades — a count a wrong price can't inflate — or the one holding Jupiter's price wins, and the deepest pool inside it is used.
- **No words on the logo** — a ticker baked into the image is cropped by pump.fun's circle, unreadable at 32 px, and wrong the moment the ticker changes. A centred glyph in the family style reads at any size; the ticker lives next to it, where wallets put it.
- **The treasury doesn't pay itself** — a fee transfer from the treasury to the treasury is a no-op that only confuses the explorer; it is left out, and the quote says so.
