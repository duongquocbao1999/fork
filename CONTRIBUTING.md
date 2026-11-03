# Contributing to FORK

Thanks for helping map where internet culture comes from. Most contributions are new lineages; code and design fixes are just as welcome.

## Run it

```bash
npm start           # http://localhost:5173
npm run validate    # checks every lineage
npm run build       # regenerates src/archive.js (the sourced subset the site ships) and netlify/lib/upstream.mjs
npm run charts      # rebuilds README charts and banner from the data
```

No install step: the scripts use only Node's standard library.

## Add a documented lineage

All data lives in `src/data.js`. Documented objects are written with `R(...)`; sample objects use `N(...)`.

### 1. Register your sources

```js
SRC.doge = ['Wikipedia — Doge (meme)', 'https://en.wikipedia.org/wiki/Doge_(meme)'];
```

### 2. Add the origin, then its forks

```js
R(id, name, type, platform, date, parentId, confidence, family, options)
```

| Field | Rules |
|---|---|
| `id` | kebab-case, unique |
| `type` | `POST` `MEME` `CHARACTER` `TOKEN` `COMMUNITY` `VIDEO` `SOUND` `FORMAT` `NARRATIVE` `EVENT` `GAME` |
| `platform` | a key of `PLATFORMS` — add one if needed |
| `date` | `YYYY-MM-DD`, first seen. A child can't be older than its parent. |
| `parentId` | `null` for an origin |
| `confidence` | 0–1. ≥ 0.85 shows as **verified**, ≥ 0.55 **likely**, below that **disputed** |
| `family` | one of the seven family ids |

Useful options:

```js
{
  src: ['doge'],                 // required for documented objects
  desc: 'One or two sentences, in your own words.',
  approx: 'month',               // or 'year' when the exact day isn't known
  reported: true,                // date is when a source first reported it
  handle: '@account', ticker: '$TICKER', aliases: ['search terms'],
  traits: { visual, format, audience, tone, symbols, token, character },  // only what changed vs the parent
  ev: [['reference', 'What links it to the parent']]                      // evidence lines
}
```

Evidence kinds: `reference`, `media`, `caption`, `crosslink`, `press`, `community`, `counter` (a counter-claim lowers trust and should lower `confidence`).

### 3. Check it

```bash
npm run validate
npm run build
npm run charts
```

## Rules for data

1. **Every documented date and every parent → child link needs a public source.**
2. **No follower counts, view counts, market caps or prices.** Fork Score is graph-only on purpose.
3. Write descriptions in your own words. Link, don't copy.
4. When a date is uncertain, say so with `approx` or `reported`; when a link is uncertain, lower `confidence` and add a `counter` line.
5. No private individuals and nothing whose only purpose is harassment. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Code

- Vanilla JS, no build step, no dependencies. Keep it that way unless there is a strong reason.
- Colours and type come from the CSS tokens at the top of `index.html`; the canvas graph reads them too.
- Test the homepage, an object page and the mobile layout (≈390 px) before opening a PR.
