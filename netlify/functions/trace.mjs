// GET /api/trace?q=… — the whole answer in one request, built to be cheap:
//   1. GitHub search for candidates (free, cached)
//   2. ONE model call — deepseek-flash, thinking off, json out, ~250 tokens
//   3. one GraphQL call checks every repo and grows the tree with real notable forks (free)
//   4. cached: the same question never reaches the model twice (CDN for a week + memory)
// GET /api/trace (no q) → { ok } says whether tracing is set up.
//
// Netlify → Environment variables:
//   FORKS_LLM_KEY    DeepSeek API key (any OpenAI-compatible key works)
//   FORKS_LLM_URL    default https://api.deepseek.com/chat/completions
//   FORKS_LLM_MODEL  default deepseek-flash
//   GITHUB_TOKEN     fine-grained, public repositories read-only
//   FORKS_TRACES_PER_MIN  new (uncached) traces per IP per minute, default 8
import P from '../../src/prompt.js';
import { hasToken, search } from '../lib/github.mjs';
import { verify } from '../lib/lineage.mjs';

const URL_ = process.env.FORKS_LLM_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.FORKS_LLM_MODEL || 'deepseek-flash';
const PER_MIN = Number(process.env.FORKS_TRACES_PER_MIN) || 8;
const MODEL_MS = 8000; // Netlify cuts synchronous functions at 10 s
const memo = new Map(), hits = new Map();

const json = (body, status = 200, cache = false) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': cache ? 'public, max-age=600' : 'no-store',
    ...(cache ? { 'netlify-cdn-cache-control': 'public, s-maxage=604800, stale-while-revalidate=2592000', 'netlify-vary': 'query=q' } : {})
  }
});
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_MIN;
}

async function ask(raw, candidates) {
  const body = {
    model: MODEL, temperature: 0.6, max_tokens: 700, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: P.SYSTEM }, { role: 'user', content: P.user(raw, candidates) }]
  };
  if (/deepseek\.com/.test(URL_)) body.thinking = { type: 'disabled' }; // thinking tokens are billed; we don't need them
  const r = await fetch(URL_, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.FORKS_LLM_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(MODEL_MS)
  });
  if (!r.ok) throw Object.assign(new Error(`model ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`), { status: r.status });
  const data = await r.json();
  return { text: data?.choices?.[0]?.message?.content || '', usage: data.usage };
}

export default async (req, context) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  const ready = !!process.env.FORKS_LLM_KEY && hasToken();
  const raw = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 160);
  if (!raw) return json({ ok: ready });
  if (!ready) return json({ error: 'not_configured' }, 503);
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'origin' }, 403);

  const key = P.key(raw);
  const hit = memo.get(key);
  if (hit) return json(hit, 200, true);
  if (limited(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon')) return json({ error: 'rate_limited' }, 429);

  try {
    let candidates = [];
    try { candidates = (await search(P.subject(raw) || raw, 2500)).slice(0, 6); } catch (_) { }
    let tree = null, usage = null;
    for (let attempt = 0; attempt < 2 && !tree; attempt++) { // a second try only if the answer wasn't usable json
      const a = await ask(raw, candidates); usage = a.usage;
      tree = P.shape(P.parse(a.text));
    }
    if (!tree) return json({ error: 'no_tree' }, 502);
    const out = await verify(tree);
    if (!out) return json({ error: 'not_on_github' }, 422);
    if (usage) console.log('trace', JSON.stringify({ q: key, in: usage.prompt_tokens, cached: usage.prompt_cache_hit_tokens, out: usage.completion_tokens, nodes: out.nodes.length }));
    if (memo.size > 2000) memo.clear();
    memo.set(key, out);
    return json(out, 200, true);
  } catch (e) {
    console.error('trace', e.message);
    if (e.name === 'TimeoutError') return json({ error: 'timeout' }, 504);
    return json({ error: e.status === 429 ? 'rate_limited' : 'upstream' }, e.status === 429 ? 429 : 502);
  }
};

export const config = { path: '/api/trace' };
