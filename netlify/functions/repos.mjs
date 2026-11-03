// forks.wiki — real GitHub data for every point on a tree.
//   GET /api/repos?r=owner/name,owner/name   up to 12 repos in one GraphQL call → { repos: { "<asked>": repo | null } }
//   GET /api/repos/search?q=...              GitHub repository search, by stars   → { items: [repo] }
// repo = { name, url, desc, stars, forks, created, lang, fork (parent owner/name or null), archived, home }
// The token stays here; answers are cached by Netlify's CDN for a day and in memory per instance.
//
// Netlify → Environment variables: GITHUB_TOKEN (a fine-grained token with public read-only access is enough)

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const MAX = 12, TTL = 6 * 3600e3, WINDOW_MS = 60_000, PER_WINDOW = 90;
const memo = new Map(); // key -> { at, v }
const hits = new Map();

const json = (body, status = 200, cache = false) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': cache ? 'public, max-age=300' : 'no-store',
    ...(cache ? { 'netlify-cdn-cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800', 'netlify-vary': 'query' } : {})
  }
});
const remember = (k, v) => { if (memo.size > 3000) memo.clear(); memo.set(k, { at: Date.now(), v }); return v; };
const recall = k => { const e = memo.get(k); return e && Date.now() - e.at < TTL ? e.v : undefined; };
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_WINDOW;
}

async function github(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'forks.wiki', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw Object.assign(new Error(`github ${r.status}`), { status: r.status });
  return r.json();
}

const FIELDS = 'nameWithOwner url description stargazerCount forkCount createdAt isArchived homepageUrl primaryLanguage { name } parent { nameWithOwner }';
const fromGraph = x => x && ({
  name: x.nameWithOwner, url: x.url, desc: x.description || '', stars: x.stargazerCount, forks: x.forkCount,
  created: x.createdAt, lang: x.primaryLanguage ? x.primaryLanguage.name : null, fork: x.parent ? x.parent.nameWithOwner : null,
  archived: !!x.isArchived, home: x.homepageUrl || null
});
const fromSearch = x => ({
  name: x.full_name, url: x.html_url, desc: x.description || '', stars: x.stargazers_count, forks: x.forks_count,
  created: x.created_at, lang: x.language || null, fork: x.fork ? '?' : null, archived: !!x.archived, home: x.homepage || null
});

async function lookup(names) {
  const out = {}, todo = [];
  for (const n of names) { const v = recall('r:' + n.toLowerCase()); if (v !== undefined) out[n] = v; else todo.push(n); }
  if (todo.length) {
    const vars = {}, parts = todo.map((n, i) => {
      const [o, r] = n.split('/'); vars['o' + i] = o; vars['n' + i] = r;
      return `r${i}: repository(owner: $o${i}, name: $n${i}) { ${FIELDS} }`;
    });
    const q = `query(${todo.map((_, i) => `$o${i}: String!, $n${i}: String!`).join(', ')}) { ${parts.join(' ')} }`;
    const res = await github('https://api.github.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: vars }) });
    if (!res.data && res.errors) throw new Error('github graphql: ' + (res.errors[0] && res.errors[0].message));
    todo.forEach((n, i) => { out[n] = remember('r:' + n.toLowerCase(), fromGraph(res.data && res.data['r' + i])); });
  }
  return out;
}

async function search(q) {
  const k = 's:' + q.toLowerCase(), hit = recall(k);
  if (hit) return hit;
  const res = await github(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`);
  return remember(k, (res.items || []).map(fromSearch));
}

export default async (req, context) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  if (!process.env.GITHUB_TOKEN) return json({ error: 'not_configured' }, 503);
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
    return json({ repos: await lookup(names) }, 200, true);
  } catch (e) {
    console.error('repos', e.message);
    return json({ error: e.status === 403 || e.status === 429 ? 'github_limit' : 'github' }, 502);
  }
};

export const config = { path: ['/api/repos', '/api/repos/search'] };
