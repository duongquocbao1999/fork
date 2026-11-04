<div align="center">

<img src="docs/media/banner.svg" alt="forks — where did it come from?" width="100%">

### Type anything. Watch the GitHub repositories it came from grow.

Every point is a real public repository — a fork, a port, a rewrite, a project built on the one before — with its stars, its year and one tap to GitHub.

[![forks.wiki](https://img.shields.io/badge/forks.wiki-live-6EE7B7?style=flat-square&labelColor=090B0A)](https://forks.wiki)
[![License: MIT](https://img.shields.io/badge/license-MIT-151A17?style=flat-square&labelColor=090B0A)](LICENSE)
[![No build](https://img.shields.io/badge/vanilla%20JS-no%20build-151A17?style=flat-square&labelColor=090B0A)](src)
[![DeepSeek](https://img.shields.io/badge/deepseek--flash-1%20call%20per%20question-151A17?style=flat-square&labelColor=090B0A)](#what-a-question-costs)
[![$FORK](https://img.shields.io/badge/%24FORK-%2Ffreeforks-E8B45A?style=flat-square&labelColor=090B0A)](#fork)
[![X](https://img.shields.io/badge/x-%40forkwikis-151A17?style=flat-square&labelColor=090B0A&logo=x)](https://x.com/forkwikis)

<br>

<img src="docs/media/demo.gif" alt="typing 'where did dogecoin come from?': probes search, then the line grows bitcoin/bitcoin → litecoin-project/litecoin → dogecoin/dogecoin, with branches, and the list of repositories opens" width="100%">

</div>

<br>

`bitcoin/bitcoin` was forked into `litecoin-project/litecoin`, which was forked into `dogecoin/dogecoin`. `neovim/neovim` forked `vim/vim`. `ollama/ollama` is built on `ggml-org/llama.cpp`. Open source is one family tree, and forks shows you a branch of it from a single question — a word, a project, `owner/name`, a GitHub link, even something that isn't software at all.

<table>
<tr>
<td width="68%"><img src="docs/media/shot-answer.png" alt="the result: dogecoin/dogecoin, 2 forks from bitcoin/bitcoin, and the repositories — the line numbered from the origin, then the branches"></td>
<td width="32%"><img src="docs/media/shot-phone.png" alt="the same tree on a phone, growing top to bottom like git log --graph"></td>
</tr>
<tr>
<td><sub><b>The result.</b> The line from the origin to your answer, the branches around it, every repo with its stars, language, age and how it came from its parent. Folded into one line until you open it.</sub></td>
<td><sub><b>On a phone</b> the tree grows top to bottom, one row per repository.</sub></td>
</tr>
</table>

## How a question becomes a tree

```mermaid
flowchart LR
  q["anything you type"] --> t["/api/trace"]
  t -- "1 · free" --> s["GitHub search<br/>candidates"]
  t -- "2 · one call" --> m["deepseek-flash<br/>thinking off · json"]
  t -- "3 · one call" --> g["GitHub GraphQL<br/>check every repo<br/>+ its top real forks"]
  g --> stage["the stage"]
  t -. "asked before" .-> c[("cache · a week")]
```

1. **Candidates.** The server searches GitHub for what you typed.
2. **One model call.** `deepseek-flash`, thinking off, answers in compact json: 8–14 repositories from the origin to your answer, with the interesting branches — famous forks, ports, rewrites, successors.
3. **GitHub checks it.** One GraphQL call looks up every repository: what doesn't exist is dropped, duplicates merged, renamed repos get their current name, GitHub's own forks are marked, the origin's real parent is added above it, and notable real forks (≥ 100★) are hung on for free — up to 16 points.
4. **The stage grows it.** Probes while it looks, then the line point by point, side branches as it passes, the answer ringed. Tap any point for its card: GitHub, its forks, the network graph, *trace from here*.

Stars, years, avatars and links come from GitHub, never from the model.

## What a question costs

| | |
|---|---|
| A new question | one `deepseek-flash` call · ~700 tokens in (mostly the same brief, billed at the cache-hit rate) · ~250 out · **a fraction of a cent** |
| The same question again | **free** — answered from the CDN for a week |
| GitHub | free with a token · one search + one GraphQL call per new question |
| Abuse | new traces limited per IP (`FORKS_TRACES_PER_MIN`, default 8); DeepSeek is prepaid, so the balance is the cap |

## Run it

```bash
git clone https://github.com/forkwiki/fork.git && cd fork
GITHUB_TOKEN=… FORKS_LLM_KEY=sk-… npm start   # http://127.0.0.1:5173
```

No dependencies, no build step. `npm start` serves the page and runs every function in `netlify/functions` the way Netlify routes them.

## Deploy

The page needs its functions, so deploy with the Netlify CLI or from Git — **not** by dragging a zip into Netlify (that uploads the page without the functions).

```bash
npx netlify-cli login
npx netlify-cli link          # once: pick the site
npx netlify-cli deploy --prod
```

Set the environment variables in Netlify first, then deploy:

| Variable | |
|---|---|
| `FORKS_LLM_KEY` | DeepSeek API key (any OpenAI-compatible API works with `FORKS_LLM_URL` / `FORKS_LLM_MODEL`) |
| `GITHUB_TOKEN` | fine-grained token, public repositories read-only |
| `X_CLIENT_ID`, `X_CLIENT_SECRET`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` | only for `/freeforks` |

`GET /api/health` lists whatever is still missing. Step by step, in Russian: **[SETUP.ru.md](SETUP.ru.md)**.

## $FORK

The **get +10,000 $FORK** button, or `/freeforks`:

1. **Sign in with X.** upstream reads the account first — how long it has been on X, followers, posts, lists, verified — and forks it a one-time pending allocation. The page plays the reading back line by line, then the tokens fly up into the header.
2. **Six trials**, one at a time, 10,000 together: follow, like, retweet, comment (each counted by the server five seconds after its link opens), **ask upstream anything** (counted when your tree grows), and **quote the post with your fork card** (counted by the link to your quote: your handle, a post newer than your account, never counted twice).
3. **Your fork**: a card drawn like a repository page — the commits that made your allocation, where it came from, your invite link as a clone URL. Copy it as a picture, quote on X, save it; then the Solana wallet.

**Invite**: `forks.wiki/r/<handle>`. +2,000 $FORK, pending, for every friend who signs in through your link and finishes three trials.

<table>
<tr>
<td width="50%"><img src="docs/media/shot-scan.png" alt="the x scan in the demo: four lines read in — on x for 10 yrs +3,350, followers 21 +2,150, posts 1,465 +2,450, in lists 1 +250 — the total 8,200 $FORK, tokens flying up into the header"></td>
<td width="50%"><img src="docs/media/shot-card.png" alt="an example fork card (demo): forkwiki / @forkwikis with a Fork button counting 21,550, the commits — read the x account +9,550, merge 6/6 trials +10,000, grow 14 trees, invite 1 friend +2,000 — HEAD at 21,550 $FORK, an allocation bar, squares of 500, and git clone forks.wiki/r/forkwikis"></td>
</tr>
</table>

Allocations are **pending**, never a balance. The X account and the post live in `src/config.js`; the amounts in the database — `tasks.reward` for the trials, `scan_lines()` and the `scan.*` / `ref.*` knobs in `app_config`. Follow along: [@forkwikis](https://x.com/forkwikis).

## Inside

```
index.html               the page: tokens, layout, every style
src/
  prompt.js              upstream's brief and its json — shared by the server and the Claude artifact
  brain.js               routing, which brain the page has, the GitHub-only fallback
  stage.js               the growing tree
  app.js                 input, results, the repository list, cards, full view
  field.js               the living canopy behind everything
  quest.js · config.js   /freeforks, /invite and every public setting
  card.js                your fork as a picture: drawn on a canvas, copied, quoted
netlify/
  functions/trace.mjs    one request → one answer: candidates, one model call, the check, the cache
  functions/repos.mjs    GitHub for the fallback
  functions/auth-*.mjs · api.mjs    sign in with X (and who invited you), the trials
  lib/github.mjs · lineage.mjs      GitHub GraphQL and search; proposal → tree of real repos
supabase/migrations/     the trials' database, closed to anon: 0001 → 0002 (scan) → 0003 (invites, six trials)
fonts/                   Anybody and JetBrains Mono, self-hosted (OFL)
```

More: [docs/UPSTREAM.md](docs/UPSTREAM.md) · [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE). Repository data comes from GitHub's API; forks links to every repository it shows.

<div align="center"><br><img src="docs/media/logo.svg" width="36" alt=""><br><sub><i>everything forks from something.</i></sub></div>
