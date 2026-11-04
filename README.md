<div align="center">

<img src="docs/media/banner.svg" alt="forks — where did it come from?" width="100%">

<br>

**Type anything and watch the line of GitHub repositories it came from grow.**<br>
Every point is a real public repository — a fork, a port, a rewrite, a project built on or inspired by the one before — with its stars, its year and a link.

<br>

[![License: MIT](https://img.shields.io/badge/license-MIT-6EE7B7?style=flat-square&labelColor=090B0A)](LICENSE)
[![Zero build](https://img.shields.io/badge/build-none-151A17?style=flat-square&labelColor=090B0A)](#run-it)
[![Vanilla JS](https://img.shields.io/badge/vanilla-JS-151A17?style=flat-square&labelColor=090B0A)](src)
[![GitHub data](https://img.shields.io/badge/every%20point-a%20real%20repo-2E6B52?style=flat-square&labelColor=090B0A)](#how-it-works)
[![$FORK](https://img.shields.io/badge/%24FORK-%2Ffreeforks-E8B45A?style=flat-square&labelColor=090B0A)](#fork-freeforks)

[**forks.wiki**](https://forks.wiki) · [**Run it**](#run-it) · [**How it works**](#how-it-works) · [**Setup**](SETUP.ru.md)

<br>

<img src="docs/media/shot-answer.png" alt="dogecoin traced on the stage: bitcoin/bitcoin → litecoin-project/litecoin → dogecoin/dogecoin, the line in mint" width="100%">

</div>

<br>

## Everything forks from something

`bitcoin/bitcoin` was forked into `litecoin-project/litecoin`, which was forked into `dogecoin/dogecoin`. `neovim/neovim` forked `vim/vim`. `ollama/ollama` is built on `ggml-org/llama.cpp`, which grew out of `ggml-org/ggml`. Open source is one big family tree — forks is a way to see a branch of it from a single question:

```
where did it come from?
```

Type a word, an idea, a product, `owner/name` or a GitHub link. Even things that aren't software: `doge` gets you the coins people built around it.

## The trace stage

While upstream looks, probes reach out from a seed and fall back. Then the line grows from the origin repository, point by point — each with its year, its stars and what changed — side branches sprout as it passes, the status line walks the points, and it arrives at the repository you asked about, ringed. Under it: the name, how many forks from which origin, the stars, upstream's line or two, and **the repositories** — the line numbered from the origin, then the branches, each with the owner's avatar, description, language, age, how it came from its parent and stars, one tap from GitHub. On a phone the same tree grows top → down, one row per repository, like `git log --graph`.

**Tap any point** for its card: description, language, stars, since when, how it came from its parent (*a fork of …*, *a rewrite of …*, *built on …*), and links — **open on github**, its **forks**, the **network graph**, the homepage — then *trace from here* or *what did it become?*.

<div align="center">
<img src="docs/media/shot-ai.png" alt="the repositories under the tree: the line from bitcoin/bitcoin to dogecoin/dogecoin, then the branches, each with stars, language and how it came" width="92%">
</div>

## How it works

```mermaid
flowchart LR
  you["anything you type"] --> t["/api/trace"]
  t -- "1 · search (free, cached)" --> s["GitHub search<br/>candidates"]
  t -- "2 · one call, ~250 tokens" --> m["deepseek-flash<br/>thinking off · json"]
  t -- "3 · one GraphQL call" --> v["check every repo<br/>+ its top real forks"]
  v --> stage["the stage grows the line<br/>+ the list of repositories"]
  t -. "same question again" .-> c[("cache<br/>CDN · a week")]
```

1. **Candidates from GitHub.** The server searches GitHub for what you typed (free, cached).
2. **One model call.** `deepseek-flash` with thinking off answers in compact json: 8–14 repositories from the origin to your answer, the interesting branches hanging off it (famous forks, ports, rewrites, successors) and a line or two. No tool loop, no history — about 250 output tokens.
3. **GitHub checks and grows it.** One GraphQL call looks up every repository and its most-starred forks. Repos that don't exist are dropped, duplicates merged, renamed ones get their current name, GitHub's own forks are marked, the origin's real parent is added above it, and notable real forks (≥ 100 stars) are hung on for free, up to 16 points.
4. **Cached.** The same question is answered from the CDN for a week and never reaches the model again.

Stars, years, avatars and links are GitHub's, never the model's.

Without a model, forks falls back to GitHub alone: the most-starred match and the forks GitHub records above it. Details: [docs/UPSTREAM.md](docs/UPSTREAM.md).

| Where it runs | Model | GitHub check |
|---|---|---|
| [forks.wiki](https://forks.wiki) / your Netlify deploy | DeepSeek `deepseek-flash` via [`trace.mjs`](netlify/functions/trace.mjs) (`FORKS_LLM_KEY`; any OpenAI-compatible API works) | yes, with `GITHUB_TOKEN` |
| As a Claude artifact | Claude, through the page's `sample` capability | no — names as the model gave them |
| Local dev | same functions, run by `npm start` | with `GITHUB_TOKEN` |

The model key and the GitHub token never reach the browser. `/api/trace` takes only the question, sends its own brief, caches answers and limits new traces per IP; `/api/repos` validates names, caches for a day and rate-limits per IP.

**What a question costs.** About 700 input tokens (most of them the same brief every time, which DeepSeek bills at the cache-hit rate) and about 250 output tokens: a fraction of a cent per new question at `deepseek-flash` prices, and nothing for a question already asked. DeepSeek is prepaid, so the balance is the hard cap.

## $FORK · /freeforks

The button under the input — **get +5,000 $FORK** — or `/freeforks` starts the trials in the chat: sign in with X, then four small forks of your own, one at a time.

| Trial | Opens | Pending $FORK |
|---|---|---|
| follow | `x.com/intent/follow?screen_name=…` | 1,500 |
| like | `x.com/intent/like?tweet_id=…` | 1,000 |
| repost | `x.com/intent/retweet?tweet_id=…` | 1,250 |
| comment | the post itself | 1,250 |

**GO** opens the link and starts the server's clock; five seconds later the claim counts — nothing is checked against X. Then a Solana wallet and the summary. The account and post live in `src/config.js`; amounts live in the database, never in the browser. Allocations are **pending**, never a balance.

## Run it

```bash
git clone https://github.com/forkwiki/fork.git
cd fork
npm start                                   # http://127.0.0.1:5173
GITHUB_TOKEN=… FORKS_LLM_KEY=sk-… npm start  # with GitHub and DeepSeek
```

`npm start` runs every function in `netlify/functions` the way Netlify routes them. Without the X / Supabase variables, `/freeforks` runs as a labelled demo.

**Deploy:** import the repo into Netlify; there is no build step, `netlify.toml` ships the functions. Every variable and every step is in **[SETUP.ru.md](SETUP.ru.md)**; `GET /api/health` lists whatever is still missing.

| File | What it does |
|---|---|
| `src/prompt.js` | upstream's brief and the json it answers with — shared by `/api/trace` and the Claude artifact. |
| `src/brain.js` | Routing, which brain the page has (`/api/trace` or Claude), the GitHub-only fallback. |
| `src/stage.js` | The trace stage: probes, the growing line, side branches, status, focus ring. |
| `src/app.js` | The page: input, messages, the result under each stage, repository cards, full view, theme, $FORK button. |
| `src/quest.js`, `src/config.js` | `/freeforks` and every public setting. |
| `netlify/functions/repos.mjs` | GitHub: GraphQL lookup of up to 12 repos, search; token server-side. |
| `netlify/functions/trace.mjs` | The whole answer in one request: candidates, one model call, the GitHub check, the cache. |
| `netlify/lib/github.mjs`, `lineage.mjs` | GitHub GraphQL / search; turning the model's proposal into a tree of real repos. |
| `netlify/functions/{auth-start,auth-callback,api}.mjs`, `supabase/` | Sign in with X and the trials. |

## Design

One question in **Instrument Serif**, everything else in **JetBrains Mono**. Near-black with a single mint accent that only ever means *the line*. The logo, the underline under the question, the background canopy and every tree are the same gesture — **a line that forks.** See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) and [docs/MOTION_SYSTEM.md](docs/MOTION_SYSTEM.md).

## Roadmap

- [x] The trace stage
- [x] Every point a real GitHub repository, checked
- [x] $FORK trials with sign-in with X
- [ ] Shareable trace links (`forks.wiki/?q=…`)
- [x] One cheap model call per question, cached
- [ ] Streaming for the endpoint backend

## License

[MIT](LICENSE). Repository data comes from GitHub's API; forks links to every repository it shows.

<div align="center"><br><img src="docs/media/logo.svg" width="40" alt=""><br><sub><i>everything forks from something.</i></sub></div>
