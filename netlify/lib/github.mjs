// GitHub for the functions: one GraphQL call checks up to 12 repositories (and brings each one's
// most-starred forks); REST search finds candidates. Token server-side; answers cached in memory.
const TTL = 6 * 3600e3;
const memo = new Map(); // key -> { at, v }
const remember = (k, v) => { if (memo.size > 4000) memo.clear(); memo.set(k, { at: Date.now(), v }); return v; };
const recall = k => { const e = memo.get(k); return e && Date.now() - e.at < TTL ? e.v : undefined; };

export const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const hasToken = () => !!process.env.GITHUB_TOKEN;

async function github(url, init = {}, ms = 8000) {
  const r = await fetch(url, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'forks.wiki', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(ms)
  });
  if (!r.ok) throw Object.assign(new Error(`github ${r.status}`), { status: r.status });
  if (r.status === 204) return null; // e.g. contributors of an empty repository
  return r.json();
}

const REPO = 'nameWithOwner url description stargazerCount forkCount createdAt isArchived homepageUrl primaryLanguage { name }';
const FIELDS = `${REPO} parent { nameWithOwner } forks(first: 3, orderBy: { field: STARGAZERS, direction: DESC }) { nodes { ${REPO} } }`;
const slim = x => ({
  name: x.nameWithOwner, url: x.url, desc: x.description || '', stars: x.stargazerCount, forks: x.forkCount,
  created: x.createdAt, lang: x.primaryLanguage ? x.primaryLanguage.name : null, archived: !!x.isArchived, home: x.homepageUrl || null
});
const fromGraph = x => x && ({ ...slim(x), fork: x.parent ? x.parent.nameWithOwner : null, topForks: ((x.forks && x.forks.nodes) || []).map(f => ({ ...slim(f), fork: x.nameWithOwner })) });
const fromSearch = x => ({
  name: x.full_name, url: x.html_url, desc: x.description || '', stars: x.stargazers_count, forks: x.forks_count,
  created: x.created_at, lang: x.language || null, fork: x.fork ? '?' : null, archived: !!x.archived, home: x.homepage || null
});

/** A cached REST GET: '/repos/o/r', '/repos/o/r/contributors?per_page=12', '/users/login'. null on 404. */
export async function rest(path, ms = 6000) {
  const k = 'g:' + path.toLowerCase(), hit = recall(k);
  if (hit !== undefined) return hit;
  try { return remember(k, await github('https://api.github.com' + path, {}, ms)); }
  catch (e) { if (e.status === 404 || e.status === 204) return remember(k, null); throw e; }
}

/** { "<asked name>": repo | null } — one GraphQL call for whatever isn't cached */
export async function lookup(names) {
  const out = {}, todo = [];
  for (const n of names) { const v = recall('r:' + n.toLowerCase()); if (v !== undefined) out[n] = v; else todo.push(n); }
  for (let s = 0; s < todo.length; s += 12) {
    const part = todo.slice(s, s + 12), vars = {};
    const fields = part.map((n, i) => { const [o, r] = n.split('/'); vars['o' + i] = o; vars['n' + i] = r; return `r${i}: repository(owner: $o${i}, name: $n${i}) { ${FIELDS} }`; });
    const q = `query(${part.map((_, i) => `$o${i}: String!, $n${i}: String!`).join(', ')}) { ${fields.join(' ')} }`;
    const res = await github('https://api.github.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: vars }) });
    if (!res.data && res.errors) throw new Error('github graphql: ' + (res.errors[0] && res.errors[0].message));
    part.forEach((n, i) => { out[n] = remember('r:' + n.toLowerCase(), fromGraph(res.data && res.data['r' + i])); });
  }
  return out;
}

export async function search(q, ms) {
  const k = 's:' + q.toLowerCase(), hit = recall(k);
  if (hit) return hit;
  const res = await github(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`, {}, ms);
  return remember(k, (res.items || []).map(fromSearch));
}
