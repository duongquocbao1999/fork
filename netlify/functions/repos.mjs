// forks.wiki — real GitHub data, for the GitHub-only fallback and anything else on the page.
//   GET /api/repos?r=owner/name,owner/name   up to 12 repos → { repos: { "<asked>": repo | null } }
//   GET /api/repos/search?q=...              repository search, by stars → { items: [repo] }
// Needs GITHUB_TOKEN. Cached by Netlify's CDN for a day and in memory per instance.
import { NAME, hasToken, lookup, search } from '../lib/github.mjs';

const MAX = 12, PER_MIN = 90;
const hits = new Map();
const json = (body, status = 200, cache = false) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': cache ? 'public, max-age=300' : 'no-store',
    ...(cache ? { 'netlify-cdn-cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800', 'netlify-vary': 'query' } : {})
  }
});
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_MIN;
}

export default async (req, context) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  if (!hasToken()) return json({ error: 'not_configured' }, 503);
  if (limited(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon')) return json({ error: 'rate_limited' }, 429);
  const url = new URL(req.url);
  try {
    if (url.pathname.replace(/\/$/, '') === '/api/repos/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
      if (!q) return json({ error: 'no query' }, 400);
      return json({ items: await search(q) }, 200, true);
    }
    const names = [...new Set((url.searchParams.get('r') || '').split(',').map(s => s.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, '')).filter(Boolean))];
    if (!names.length || names.length > MAX || names.some(n => !NAME.test(n))) return json({ error: 'bad repos' }, 400);
    const repos = await lookup(names);
    for (const k in repos) if (repos[k]) repos[k] = { ...repos[k], topForks: undefined };
    return json({ repos }, 200, true);
  } catch (e) {
    console.error('repos', e.message);
    return json({ error: e.status === 403 || e.status === 429 ? 'github_limit' : 'github' }, 502);
  }
};

export const config = { path: ['/api/repos', '/api/repos/search'] };
