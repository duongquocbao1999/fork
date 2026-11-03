# Contributing

Thanks for helping. Fixes, design work and better prompts for upstream are all welcome.

## Run it

```bash
npm start          # http://127.0.0.1:5173 — functions run locally; without env, /freeforks is a demo
npm run build      # regenerates netlify/lib/upstream.mjs from src/brain.js (commit it)
```

With `GITHUB_TOKEN` set, `/api/repos` answers locally; with `FORKS_LLM_KEY` too, upstream traces. See [SETUP.ru.md](SETUP.ru.md) for every variable.

## Where things live

- `src/brain.js` — routing, upstream's rules and its two tools (`search_repos`, `trace_repos`), the model backends.
- `src/stage.js` — the growing tree.
- `src/app.js` — the page: input, messages, repository cards, full view.
- `src/quest.js`, `supabase/`, `netlify/functions/{auth-*,api}.mjs` — `/freeforks`.
- `netlify/functions/repos.mjs` — GitHub data; `ask.mjs` — the model proxy.

## Rules

- Vanilla JS, no build step, no dependencies. Keep it that way unless there is a strong reason.
- Every point on a tree is a real public repository. Don't add anything that makes up repos, stars or links.
- Change `brain.js` → run `npm run build` and commit `netlify/lib/upstream.mjs`; CI checks it.
- Test on a 320px-wide phone: no sideways scroll, nothing behind the input.
