# forks — Information Architecture

There is one screen. It has two states.

## 1 · Ask (empty)
- **Eyebrow** — `upstream · 81 objects · 10 origins · every link sourced`.
- **The question** — *where did it come from?* Set once, huge, never repeated.
- **Input** — accepts a name, `$TICKER`, `@handle`, URL or a sentence in any language. Placeholders rotate through real examples.
- **Six starters** — doge, chill guy, `$JEANPHIL`, jean philanthrope, forking now, surprise me.
- **Forking now** — three objects with the most forks in the last 30 days, each one tap away.
- **Fine print** — documented lineages only; model answers outside the archive are marked unverified; archive date.

## 2 · Conversation
The hero leaves. Messages stack in one 720px column; the input docks to the bottom.

- **You** — right-aligned bubble.
- **upstream** — avatar (the mark), a source tag (`archive` or `model`), two to five lines of text, then cards, then up to four follow-up chips.

### Cards
| Card | Triggered by | Shows |
|---|---|---|
| lineage | origin / became / trace / random | the whole family as an SVG tree, the traced line in mint; `open ↗`, `sources` |
| mutation | "what changed from A to B" | eight traits, then → now, mutated traits highlighted |
| sources | `/sources`, "proof" | every source on the object's line, deduplicated |
| forking now | `/hot`, "right now" | top six by forks in the last 30 days |
| archive | `/archive` | every origin with descendants and depth |
| unverified | model only, outside the archive | dotted red tree, "from the model's memory, not the archive" |

Every tree node is a button: it asks `/trace <id>` in the same conversation.

### Full tree
`open ↗` covers the screen with the full family: larger type, every node's type and date, legend. `Esc` or *close* returns.

## Global
- **Top bar** — mark (start over), `new` (in conversation), `archive`, AI status pill (`archive only` / `ai · on` / `ai · claude`), GitHub, theme.
- **Keys** — `/` focuses the input, `Enter` sends, `Esc` closes the full tree or stops the model.
- **Commands** — `/trace /became /changed /sources /hot /archive /random /help /clear`.
