# forks — Design System (4.0)

## Idea
A code host's look, without its name or marks: a flat canvas, boxes with a muted header row, hairline borders, 6px corners, system type, mono for code and numbers, a green primary button, an underlined tab bar. The page you land on is already a graph — a repository's family tree with the tokens on it — so the site explains itself before anyone reads a word.

## Mark
A trunk with one fork: `M9 20V3.6` + `M9 14.4C9 10 15.4 10.5 15.4 6.8`, a filled root dot, a hollow tip, in the success green. It is the logo, the favicon and upstream's avatar.

## Colour (dark first, light mirrored) — `css/forks.css`
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` / `--bg-2` | `#0d1117` | `#ffffff` | canvas, boxes |
| `--bg-3` | `#151b23` | `#f6f8fa` | box headers, muted surfaces |
| `--bg-inset` | `#010409` | `#f6f8fa` | the site header, the stage |
| `--ink` / `--ink-2` / `--ink-3` | `#f0f6fc` / `#9198a1` / `#656c76` | `#1f2328` / `#59636e` / `#818b98` | text tiers |
| `--rule` / `--rule-2` | `#3d444db3` / `#3d444d` | `#d1d9e0b3` / `#d1d9e0` | borders |
| `--acc` | `#3fb950` | `#1a7f37` | **the traced line**, success, buys, the primary button (`--primary #238636`) |
| `--link` | `#4493f8` | `#0969da` | links, **project tokens** |
| `--warn` | `#d29922` | `#9a6700` | **coins launched here**, pending $FORK |
| `--err` | `#f85149` | `#d1242f` | errors, sells |
| `--tab` | `#f78166` | `#fd8c73` | the selected tab's underline |

Colour carries meaning only. Green is the line and "go"; blue a link or someone else's token; amber a coin from here; red a sell or a failure.

## Type
- **System sans** (`-apple-system, Segoe UI, Noto Sans…`) for the interface: 14px body, 600 for headings and names.
- **JetBrains Mono** (self-hosted) for code, repository names on the stage, numbers, prices and addresses (tabular). Tiny prices are written with a subscript zero count: `0.0₅4194` = 0.000004194.
- **Anybody** (self-hosted) only inside canvases: the fork card and the generated coin logos.

## Layout
- **Header** (every page): mark + `forks / page`, a search box (`/` focuses it; a coin address opens its terminal, anything else is traced), invite, $FORK, the wallet button with its menu, X, theme. Under it the tab bar: Graph · Market (with a count) · Launch · Guide.
- **Graph page**: a main column (intro, the trace box, starter chips, the timeline) and a 296px sidebar (About, tokens on this graph with prices, newest coins, $FORK). The sidebar hides under 1012px; on phones the intro shrinks to its headline so the graph starts on the first screen.
- **Timeline**: every graph is a box (`upstream · graph` header, the stage, the result); text answers are comments with an avatar and an arrow; what you asked is a small event line. Once you ask, the box moves to a dock at the bottom.
- **Terminal**: title row (logo, $TICKER, labels, price), a five-cell stats box, then chart + activity on the left and trade + about (340px) on the right. On phones: chart, trade, activity, about, with a sticky Buy/Sell bar.

## Components
- **Button** — `.btn` (default, `--btn` fill), `.btn.primary` (green), `.btn.danger` (sells), 32px tall, 6px corners; `.q-btn` inside cards follows the same rules.
- **Label / token** — `.label` hairline pills (`green`, `blue`, `amber`, `red`, `purple`); `.tok.project` (blue) and `.tok.forks` (amber) for tickers.
- **Box** — `.box` + `.box-h` (muted header, 44px) + `.box-b`; cards in the timeline are boxes with a `// kind · subject` header.
- **Input** — 32–36px, 6px corners, blue focus ring; the trace box has a fork icon and a green **Trace** button.
- **Chip** — 2em pill, hairline, link-coloured text. Starters, follow-ups, commands; a chip may be a link.
- **Stage** — the inset canvas inside a graph box, about half the screen tall on wide screens. Points are repositories: name above the line, `year · ★ stars · what changed` under it; the line to the asked repo in green, side branches in ink-3; the asked repo ringed. Phones: one row per repository, elbows like `git log --graph`.
- **Repository list** — under the result, folded to one 48px line: overlapping avatars of the line, `N repositories · line of n · m branches · ★ total`, *show*. Open: the line numbered from the origin, then the branches; each row = avatar, `owner/` dim + `name`, description, language dot, since, how it came, stars; the asked repo on a green tint; project tokens and coins as chips with their price, linked to their terminal.
- **Point card** — popover (bottom sheet on phones): the name as a link, `★ stars · language · since year`, how it came from its parent in green, its tokens with price and *trade →*, description, links to GitHub / forks / network graph / homepage, then *trace from here*, *what did it become?*, and *trade $TICKER* or *launch a coin*.
- **Header button** — `.pill`: invite, sign in / your pending $FORK, the wallet (its icon and short address when connected), X, theme. Phones: icons only, except *sign in*.
- **Market row** — 36px logo, `$TICKER` + a `forks` label or `project token`, the repository, a curve progress bar; price, market cap, 24 h (green/red), volume, Trade.
- **Chart** — a canvas: candles green/red, volume at 35% opacity, a dashed last-price line with its value on the axis, a crosshair with O/H/L/C on hover; colours read from the CSS tokens, so it follows the theme.
- **Trade panel** — Buy/Sell tabs (green/red underline), a 48px mono amount field with its unit, quick amounts (SOL presets, or 25/50/100% to sell), the quote box (receive, minimum, impact, route), slippage, one full-width button whose label says what happens next.
- **Fork card** — the share picture, 1200×675 (drawn at 1.6×) in GitHub's dark palette (`#0d1117` panel, `#3d444d` lines, `#4493f8` links, `#3fb950` diffstats): `forkwiki / @handle`, a Fork button counting $FORK, the commit graph down to `HEAD → main`, an allocation bar (scan green, trials purple, invites coral), squares of 500, the invite link as `git clone`. In the chat it prints in from the top.
- **Coin** — amber (`--warn`) means a coin: `$TICKER` after a point's name on the stage (or at the head of its meta line when the name fills the column), a hairline amber chip in the repository list, an amber-bordered row in the point card.
- **Launch card** — `// launch · owner/name`: the split as rows (28px avatar, `@login` + role, the part in mono, a 2px bar scaled to the largest part; forks' row in green), the line above, then the coin: a 112px logo (92px on phones) with *another* / *upload*, the ticker in amber after a `$`, the name, a dashed box to tick, one button that reads *connect a wallet* then *launch $TICKER*, and the steps as dots (amber pulsing → green ok, red error with the reason under it).
- **Coin logo** — 512×512 PNG drawn on a canvas: `#0A0D0C`, a dot grid over the top two thirds, the line it came from in the old mint green with grey side branches, the repo as an amber point with a glow, `$TICKER` in Anybody 900 fitted to the width, `owner/name` in mono. Seeded by the repo; *another* reseeds.
- **Coin card** — logo, `$TICKER`, name · repo, market cap and 24 h change (green up, red down) or *no trades seen yet*, the address in a full-width mono row that copies on tap (green pulse), pump.fun · dexscreener · solscan, the split folded, *Open the terminal*, *Share on X*.
