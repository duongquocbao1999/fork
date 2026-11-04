# Contributing

Thanks for helping. Fixes, design work and better prompts for upstream are all welcome.

## Run it

```bash
npm start          # http://127.0.0.1:5173 — functions run locally; without env, /freeforks is a demo
npm run check      # every file parses
```

With `GITHUB_TOKEN` and `FORKS_LLM_KEY` (DeepSeek) set, upstream traces locally. See [SETUP.ru.md](SETUP.ru.md) for every variable.

## Where things live

- `src/prompt.js` — upstream's brief and its json; `src/brain.js` — routing and which brain the page has.
- `src/stage.js` — the growing tree.
- `src/app.js` — the page: input, messages, repository cards, full view.
- `src/quest.js`, `supabase/`, `netlify/functions/{auth-*,api}.mjs` — `/freeforks`.
- `netlify/functions/trace.mjs` (+ `netlify/lib/`) — the answer: candidates, one model call, the GitHub check, the cache; `repos.mjs` — GitHub for the fallback.

## Rules

- Vanilla JS, no build step, no dependencies. Keep it that way unless there is a strong reason.
- Every point on a tree is a real public repository. Don't add anything that makes up repos, stars or links.
- Keep the model's answer small: every extra output token is paid for on every new question.
- Test on a 320px-wide phone: no sideways scroll, nothing behind the input.
