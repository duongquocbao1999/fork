// Who a coin's creator fees go to. Decided on the server, from GitHub and the traced line — never from the
// browser — and locked on-chain once the coin is created (pump.fun lets a split be set exactly once).
//
//   owner          the repository's owner, if a person; an organization can't claim on pump.fun, so its part
//                  goes to its top contributors (people) instead
//   contributors   the top contributors besides the owner
//   ancestors      up the line: the repo it was forked from (GitHub's record first), then the traced line
//   forks          the forks treasury (src/config.js launch.treasury)
//
// GitHub recipients are paid to pump.fun's GitHub fee account for their numeric user id and claimed by
// signing in with GitHub on pump.fun. Bots, organizations and anonymous contributors are never recipients.
import { NAME, rest } from './github.mjs';

const MAX = 10;
const person = u => u && u.type === 'User' && !/\[bot\]$/i.test(u.login || '');
const slimUser = u => ({ id: String(u.id), login: u.login, avatar: u.avatar_url ? `${u.avatar_url}${u.avatar_url.includes('?') ? '&' : '?'}s=64` : null });

async function repo(full) {
  if (!NAME.test(full)) return null;
  const r = await rest(`/repos/${full}`);
  return r && !r.private ? r : null;
}
async function people(full, n, skip = new Set()) {
  const list = (await rest(`/repos/${full}/contributors?per_page=20`)) || [];
  return list.filter(u => person(u) && !skip.has(String(u.id))).slice(0, n).map(slimUser);
}
// the person who stands for a repository: its owner if a person, else its top contributor
async function face(r) {
  if (person(r.owner)) return slimUser(r.owner);
  return (await people(r.full_name, 1))[0] || null;
}

/** The line above a repository, nearest first: GitHub's own fork record, else the traced line. */
export async function ancestors(r, traced = []) {
  const out = [], seen = new Set([r.full_name.toLowerCase()]);
  let cur = r;
  while (cur && cur.fork && cur.parent && out.length < 3) {
    const up = await repo(cur.parent.full_name);
    if (!up || seen.has(up.full_name.toLowerCase())) break;
    seen.add(up.full_name.toLowerCase()); out.push({ repo: up.full_name, via: 'github fork', r: up }); cur = up;
  }
  for (const name of traced) {
    if (out.length >= 3) break;
    if (!name || seen.has(String(name).toLowerCase())) continue;
    const up = await repo(name);
    if (!up || seen.has(up.full_name.toLowerCase())) continue;
    seen.add(up.full_name.toLowerCase()); out.push({ repo: up.full_name, via: 'traced line', r: up });
  }
  return out;
}

/**
 * plan(full, { traced, treasury, split }) → { repo, owner, holders: [{ kind, id|address, login, role, bps }], notes }
 * traced: the line above the repo from upstream's tree, nearest first (repo names).
 */
export async function plan(full, { traced = [], treasury, split, orgContributors = 5, contributors = 2 }) {
  const r = await repo(full);
  if (!r) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (r.archived && r.disabled) throw Object.assign(new Error('disabled'), { code: 'disabled' });
  const buckets = [];
  const isOrg = !person(r.owner);
  const ownerPeople = isOrg ? await people(r.full_name, orgContributors) : [slimUser(r.owner)];
  if (!ownerPeople.length) throw Object.assign(new Error('no_people'), { code: 'no_people' });
  buckets.push({ role: isOrg ? 'maintainer' : 'owner', bps: split.owner, who: ownerPeople, repo: r.full_name });
  const skip = new Set(ownerPeople.map(u => u.id));
  const helpers = isOrg ? [] : await people(r.full_name, contributors, skip);
  buckets.push({ role: 'contributor', bps: split.contributors, who: helpers, repo: r.full_name });
  const line = await ancestors(r, traced);
  for (let i = 0; i < split.ancestors.length; i++) {
    const a = line[i], who = a ? await face(a.r) : null;
    buckets.push({ role: i === 0 ? 'parent' : i === 1 ? 'grandparent' : 'ancestor', bps: split.ancestors[i], who: who ? [who] : [], repo: a ? a.repo : null, via: a ? a.via : null });
  }

  // anything a bucket can't place goes to the owner's part
  let spill = 0;
  for (const b of buckets.slice(1)) if (!b.who.length) { spill += b.bps; b.bps = 0; }
  buckets[0].bps += spill;

  // people, one entry each (someone in two buckets gets both parts)
  const byId = new Map();
  for (const b of buckets) {
    if (!b.bps || !b.who.length) continue;
    const each = Math.floor(b.bps / b.who.length), rest = b.bps - each * b.who.length;
    b.who.forEach((u, i) => {
      const add = each + (i === 0 ? rest : 0);
      const e = byId.get(u.id);
      if (e) { e.bps += add; if (!e.roles.includes(b.role)) e.roles.push(b.role); }
      else byId.set(u.id, { kind: 'github', id: u.id, login: u.login, avatar: u.avatar, roles: [b.role], repo: b.repo, via: b.via || null, bps: add });
    });
  }
  const holders = [...byId.values()];
  if (split.forks) {
    if (!treasury) throw Object.assign(new Error('no_treasury'), { code: 'no_treasury' });
    holders.push({ kind: 'wallet', address: treasury, login: 'forks', roles: ['forks'], bps: split.forks });
  }
  // pump.fun takes at most 10; the smallest parts fold into the owner's
  holders.sort((a, b) => b.bps - a.bps);
  while (holders.length > MAX) { const x = holders.pop(); (holders.find(h => h.kind === 'github') || holders[0]).bps += x.bps; }
  const total = holders.reduce((s, h) => s + h.bps, 0);
  if (total !== 10000) holders.find(h => h.kind === 'github').bps += 10000 - total;
  if (holders.some(h => h.bps <= 0)) throw Object.assign(new Error('bad_split'), { code: 'bad_split' });
  return {
    repo: r.full_name, owner: { login: r.owner.login, type: r.owner.type }, stars: r.stargazers_count, desc: r.description || '',
    holders, line: line.map(a => ({ repo: a.repo, via: a.via }))
  };
}
