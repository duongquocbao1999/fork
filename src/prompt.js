/* forks — upstream's brief, shared by the page (window.FORKS_PROMPT) and the /api/trace function.
   One model call per question: the model answers with a compact json tree, nothing else.
   Compact on purpose: short keys and arrays keep the answer around 250 tokens. */
(function (root) {
  const RELS = ['fork', 'port', 'rewrite', 'built on', 'inspired by', 'successor'];
  const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
  const MAX = 14;

  const SYSTEM = `You are upstream, the voice of forks.wiki: the family tree of open-source code. For what the user typed, return the tree of real public GitHub repositories it came from, as compact json and nothing else.

json: {"t": title, "f": focus index, "n": [[repo, parent, rel, note], ...], "l": lines}
- repo: "owner/name" exactly as on GitHub. Only repositories you are sure exist.
- parent: index of the node it came from, null for the first. rel: one of ${RELS.join(', ')}. note: what changed at that step, at most 5 words.
- n[0] is the earliest origin. The main line runs from it to the focus, the repository that answers the question.
- Make the tree rich, 8 to ${MAX} nodes: hang the interesting branches off the line — famous forks, ports to other languages, rewrites, successors, projects built on it, rivals forked from the same root.
- A word that isn't software: the repositories people built around it ("doge": bitcoin/bitcoin → litecoin-project/litecoin → dogecoin/dogecoin).
- "what did X become": X is n[0] and the focus; the rest are its descendants.
- Prefer names from the candidates when they fit.
- l: one or two short lines, the one thing worth knowing. lowercase, dry, no emoji, no hype, in the user's language.
example: {"t":"dogecoin","f":2,"n":[["bitcoin/bitcoin",null,"",""],["litecoin-project/litecoin",0,"fork","scrypt instead of sha-256"],["dogecoin/dogecoin",1,"fork","a joke that stuck"]],"l":"a joke coin, forked from a fork of bitcoin."}`;

  // what the question is about, for the github search and the cache key
  const subject = raw => String(raw || '').toLowerCase().replace(/^\/trace\s+/, '')
    .replace(/^(where did|where does|what did|what does|who forked|what is|the family tree of|the bloodline of|the ancestors of|the roots of|trace)\s+/, '')
    .replace(/\s+(come from|came from|become|built on|a fork of)\s*\??$/, '').replace(/[?"“”«»]/g, '').replace(/\s+/g, ' ').trim();
  const key = raw => String(raw || '').toLowerCase().replace(/\s+/g, ' ').replace(/[?.!\s]+$/, '').trim().slice(0, 160);

  const k = n => (n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
  function user(raw, candidates) {
    const c = (candidates || []).slice(0, 6).map(x => `- ${x.name} · ★${k(x.stars)} · ${String(x.created || '').slice(0, 4)}${x.lang ? ' · ' + x.lang : ''}${x.desc ? ' — ' + x.desc.slice(0, 70) : ''}`).join('\n');
    return `question: ${String(raw).slice(0, 160)}\n${c ? 'candidates (github search, most-starred first):\n' + c : 'no candidates: use the names you know.'}`;
  }

  function parse(text) {
    const s = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { return JSON.parse(s); } catch (_) { }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { } }
    return null;
  }

  // compact json → { title, focus, lines, nodes: [{ repo, parent, rel, note }] } (names unchecked), or null
  function shape(j) {
    if (!j || !Array.isArray(j.n) || j.n.length < 2) return null;
    const nodes = j.n.slice(0, MAX).map((x, i) => {
      const a = Array.isArray(x) ? x : [x && x.repo, x && x.parent, x && x.rel, x && x.note];
      const repo = String(a[0] || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, '');
      return { repo, parent: i ? (Number.isInteger(a[1]) && a[1] >= 0 && a[1] < i ? a[1] : i - 1) : null, rel: i ? (RELS.includes(a[2]) ? a[2] : 'inspired by') : '', note: a[3] ? String(a[3]).slice(0, 48) : '' };
    });
    const f = Number.isInteger(j.f) && j.f >= 0 && j.f < nodes.length ? j.f : nodes.length - 1;
    return prune({ title: String(j.t || nodes[f].repo).slice(0, 60), focus: f, lines: String(j.l || '').slice(0, 280), nodes }, x => NAME.test(x.repo));
  }

  // keep the nodes that pass, hang each survivor from its nearest surviving ancestor (or the new origin),
  // keep the focus on the nearest surviving node of its line; null if fewer than two survive
  function prune(tree, alive) {
    const L = tree.nodes.map(x => ({ ...x }));
    L.forEach(x => { x.up = x.parent == null ? null : L[x.parent]; });
    const ok = L.map((x, i) => !!alive(x, i));
    const live = x => ok[L.indexOf(x)];
    L.forEach(x => { let p = x.up; while (p && !live(p)) p = p.up; x.up = p; });
    const kept = L.filter(live);
    if (kept.length < 2) return null;
    kept.forEach((x, i) => { if (i && !x.up) x.up = kept[0]; }); kept[0].up = null;
    let f = L[tree.focus]; while (f && !live(f)) f = f.up; if (!f) f = kept[kept.length - 1];
    const nodes = kept.map(x => { const { up, ...rest } = x; return { ...rest, parent: up ? kept.indexOf(up) : null }; });
    return { ...tree, focus: kept.indexOf(f), nodes };
  }

  const P = { RELS, NAME, MAX, SYSTEM, subject, key, user, parse, shape, prune };
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.FORKS_PROMPT = P;
})(this);
