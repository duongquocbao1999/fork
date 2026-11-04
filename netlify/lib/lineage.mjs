// Turn the model's proposal into a tree of real repositories:
// drop what isn't on GitHub, take canonical names, mark GitHub's own forks, add the origin's real parent,
// then grow it for free with the most-starred real forks of the repos already on the tree.
import P from '../../src/prompt.js';
import { lookup } from './github.mjs';

export const MAX_NODES = 16;

export async function verify(tree) {
  const names = [...new Set(tree.nodes.map(x => x.repo))];
  const data = await lookup(names);
  let t = P.prune(tree, x => !!data[x.repo]);
  if (!t) return null;
  let nodes = t.nodes.map(x => ({ ...x, data: data[x.repo], repo: data[x.repo].name }));

  // the same repo proposed twice (e.g. old and new name): keep the first, hang the other's children on it
  const first = new Map();
  nodes.forEach((x, i) => { const k = x.repo.toLowerCase(); if (!first.has(k)) first.set(k, i); });
  if (first.size < nodes.length) {
    const same = nodes.map((x, i) => first.get(x.repo.toLowerCase()) === i);
    nodes = nodes.map(x => ({ ...x, parent: x.parent == null ? null : first.get(nodes[x.parent].repo.toLowerCase()) }));
    t = P.prune({ ...t, focus: first.get(nodes[t.focus].repo.toLowerCase()), nodes }, (x, i) => same[i]);
    if (!t) return null;
    nodes = t.nodes;
  }

  // what GitHub itself records
  nodes.forEach(x => { if (x.parent != null && x.data.fork && x.data.fork.toLowerCase() === nodes[x.parent].repo.toLowerCase()) x.rel = 'fork'; });
  let focus = t.focus;
  const origin = nodes[0];
  if (origin.data.fork && !nodes.some(x => x.repo.toLowerCase() === origin.data.fork.toLowerCase())) {
    const up = (await lookup([origin.data.fork]))[origin.data.fork];
    if (up) {
      nodes = [{ repo: up.name, parent: null, rel: '', note: '', data: up }].concat(nodes.map(x => ({ ...x, parent: x.parent == null ? 0 : x.parent + 1 })));
      nodes[1].rel = 'fork'; focus += 1;
    }
  }

  // free growth: the most-starred real forks, where they matter (≥ 100 stars and ≥ 0.5% of the parent)
  const have = new Set(nodes.map(x => x.repo.toLowerCase()));
  const base = nodes.length;
  for (let i = 0; i < base && nodes.length < MAX_NODES; i++) {
    let added = 0;
    for (const f of nodes[i].data.topForks || []) {
      if (nodes.length >= MAX_NODES || added >= 2) break;
      if (have.has(f.name.toLowerCase()) || f.stars < Math.max(100, nodes[i].data.stars * 0.005)) continue;
      nodes.push({ repo: f.name, parent: i, rel: 'fork', note: 'notable fork', auto: true, data: { ...f, topForks: undefined } });
      have.add(f.name.toLowerCase()); added++;
    }
  }
  return { title: t.title, lines: t.lines, focus, nodes: nodes.map(x => ({ ...x, data: { ...x.data, topForks: undefined } })) };
}
