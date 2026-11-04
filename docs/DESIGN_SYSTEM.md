# forks — Design System

## Idea
One question, one growing tree. You type; a stage opens and the line of GitHub repositories grows on it, point by point, over a single background canopy that forks from an origin off the left edge. Text is the caption under the tree. Nothing else on the page is decorative.

## Mark
A trunk with one fork: `M9 20V3.6` + `M9 14.4C9 10 15.4 10.5 15.4 6.8`, a filled root dot, a hollow tip. It appears as the logo, the favicon, upstream's avatar, and — stretched — as the stroke under the question.

## Colour (dark first, light mirrored)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#090B0A` | `#F3F5F2` | page |
| `--bg-2` | `#0F1311` | `#FFFFFF` | cards |
| `--ink` / `--ink-2` / `--ink-3` | `#E7ECE9` / `#A2ACA7` / `#66706B` | `#0E1311` / `#4C5651` / `#8A938E` | text tiers |
| `--rule` / `--rule-2` | 9% / 17% ink | 10% / 18% ink | hairlines |
| `--acc` | `#6EE7B7` | `#0B8F62` | **the path** — traced lines, focus, origin, numbers that matter |
| `--warn` | `#E8B45A` | `#A66A00` | pending $FORK amounts |
| `--err` | `#FF7A6B` | `#C2412F` | errors |

Mint never decorates. If it's mint, it's on the line from your object to its origin.

## Type
- **Instrument Serif** — the question (clamp 46–104px, −0.025em), the full-tree title, *then / now*. Italic is reserved for the accent half of a line.
- **JetBrains Mono** — everything else: 14px body, 12–12.5px chips, 11px meta, 9.5–11px tree labels. Slashed zero on.

## Components
- **Input** — 18px radius, veil background with blur, mint focus ring (6px soft), `›` prompt, square send button in ink.
- **Chip** — pill, hairline, veil. Starters, follow-ups, commands.
- **Card** — 14px radius, `--bg-2` at 97%, header row `// kind · subject` in 11px meta with actions on the right, optional legend footer.
- **Stage** — 18px radius, about half the screen tall on wide screens. Points are repositories: name above the line, `year · ★ stars · what changed` under it; the line to the asked repo in mint, side branches in ink-3; the asked repo ringed. Phones: one row per repository, elbows like `git log --graph`.
- **Repository list** — under the result, folded to one 48px line: overlapping avatars of the line, `N repositories · line of n · m branches · ★ total`, *show*. Open: the line numbered in mint from the origin, then the branches; each row = avatar, `owner/` dim + `name`, description, language dot, since, how it came, stars; the asked repo outlined in mint.
- **Point card** — floating card (bottom sheet on phones): serif name, `★ stars · language · since year`, how it came from its parent in mint, description, links to GitHub / forks / network graph / homepage, then *trace from here*.
- **Pill** — top bar controls: new, sign in / your pending $FORK, GitHub, theme.
