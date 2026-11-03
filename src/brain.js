/* forks — upstream's brain.
   Every point on a tree is a real public GitHub repository. You type anything — a word, an idea,
   a product, a repo, a link — and upstream traces the line of repositories it came from: forks,
   ports, rewrites, projects built on or inspired by the one before. The model proposes the line;
   /api/repos checks every repo on GitHub, fills in the real stars, dates and links, drops the ones
   that don't exist and marks the links GitHub itself knows as forks. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG || { quest: { command: '/freeforks', total: 5000 }, token: { ticker: '$FORK' } };
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
  const RELS = ['fork', 'port', 'rewrite', 'built on', 'inspired by', 'successor'];

  /* ---------- commands: everything else is something to trace ---------- */
  function route(raw) {
    const t = norm(raw);
    const cmd = t.match(/^\/(\w+)\s*(.*)$/);
    if (cmd) {
      const k = { clear: 'clear', help: 'help', about: 'persona', freeforks: 'quest', logout: 'logout', signout: 'logout' }[cmd[1]];
      if (k === 'clear') return { clear: true };
      if (k === 'quest' || k === 'logout') return { quest: k };
      if (k) return { text: R[k]() };
      if (cmd[1] === 'trace' && cmd[2]) return { trace: cmd[2] };
    }
    if (/^\/?free ?forks\b|^get \+?5[ ,.]?000 \$?forks?\b/.test(t)) return { quest: 'quest' };
    if (/^(who are you|what are you|what is (this|forks|forks\.wiki)|how does (this|it) work|кто ты|ты кто|что это)\??$/.test(t)) return { text: R.persona() };
    return { trace: raw };
  }
  const R = {
    persona: () => ({ text: `i'm upstream. i keep the family tree of open-source code.\nevery repo on github came from something older — a fork, a port, a rewrite, a project it was built on.\ntype anything — a word, a project, a link — and i'll grow the line of repos it came from.`, follow: ['where did llama.cpp come from?', 'what did bitcoin become?', C.quest.command] }),
    help: () => ({ text: `type anything: a word, an idea, a project, owner/name or a github link.\nevery point on the tree is a real repo — tap it for github, its forks and the network graph.\n\n/trace <thing>    same as typing it\n${C.quest.command}        four trials on x · +${C.quest.total.toLocaleString('en-US')} ${C.token.ticker}, pending\n/clear            start over`, follow: ['where did neovim come from?', C.quest.command] })
  };

  /* ---------- github data, through our own function ---------- */
  async function api(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('github unavailable');
    return r.json();
  }
  const year = d => (d ? String(d).slice(0, 4) : '');

  /* ---------- the model layer ---------- */
  const RULES = `You are "upstream", the voice of forks.wiki: the family tree of open-source code. Every repository on GitHub came from something earlier — a fork, a port, a rewrite, a project it was built on, or one that inspired it. Whatever the user types — a word, an idea, a product, a repo name, a github link, a whole sentence — you show the line of real public GitHub repositories it came from and how it got to what they asked about.

Voice: lowercase, short, dry, a little aloof, sure of yourself. No emoji. No hype. Reply in the language the user writes in.

How to answer — every message gets exactly one tree of repositories, no exceptions:
1. Call search_repos once or twice with the best search for what the user means, to find the real repositories and their exact owner/name.
2. Call trace_repos: the line from the earliest repository to the one that answers the question. 3 to 9 repositories, each written as "owner/name" exactly as on GitHub. nodes[0] is the origin; mark the one the user asked about with "query": true. rel says how each came from its parent: ${RELS.join(', ')}. note says what changed, a few words ("rewritten in rust", "+ gpu offload", "renamed"). Add one to three side branches that grew from the same line when they exist.
3. Only real public repositories. If a project's code isn't on GitHub, use its official mirror or its best-known reimplementation, or leave it out. If trace_repos fails because too few of the repositories exist, fix the names and call it again; if it draws the tree and lists a few as not on GitHub, don't draw it again.
4. Anything counts. A word that isn't software (a meme, an animal, a feeling): trace the repositories people built around it — "doge" → bitcoin/bitcoin → litecoin-project/litecoin → dogecoin/dogecoin. A whole sentence: trace the project it is about.
5. "what did X become" / "forks of X": X is nodes[0] and the query; its forks and successors are the branches.
6. After the tree, write one to three short lines: the one thing worth knowing about the line. State it plainly; don't hedge.
7. Never invent links. Never give financial advice. Never ask for keys or personal data. ${C.token.ticker} rewards: tell the user to type ${C.quest.command}.`;

  function toolsFor(ui) {
    return [
      { name: 'search_repos', description: 'Search public GitHub repositories, most-starred first. Returns up to 8 with exact owner/name, stars, year, language and description. Use it to find the real names before trace_repos.',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'a GitHub search query, e.g. "llama inference c++" or "neovim"' } }, required: ['query'] },
        execute: async ({ query }) => {
          try {
            const { items } = await api(`/api/repos/search?q=${encodeURIComponent(String(query || '').slice(0, 100))}`);
            return items.length ? items.map(x => ({ repo: x.name, stars: x.stars, year: year(x.created), lang: x.lang, fork: !!x.fork, about: x.desc.slice(0, 110) })) : 'no repositories found; try other words';
          } catch (_) { return 'search is unavailable here; use the exact owner/name you know'; }
        } },
      { name: 'trace_repos', description: 'Draw the tree of repositories for the user. nodes[0] is the origin; every later node names its parent by index (an earlier node). Mark the repository the user asked about with query: true. The page checks every repository on GitHub and drops the ones that do not exist.',
        inputSchema: { type: 'object', properties: {
          title: { type: 'string', description: 'what the user asked about, a few words' },
          nodes: { type: 'array', minItems: 2, maxItems: 9, items: { type: 'object', properties: {
            repo: { type: 'string', description: 'owner/name exactly as on GitHub' },
            parent: { type: 'integer', description: 'index of the parent node; omit for nodes[0]' },
            rel: { type: 'string', enum: RELS, description: 'how it came from its parent' },
            note: { type: 'string', description: 'what changed, a few words' },
            query: { type: 'boolean' } }, required: ['repo'] } } }, required: ['title', 'nodes'] },
        execute: async ({ title, nodes }) => {
          let list = (Array.isArray(nodes) ? nodes : []).slice(0, 9).map((x, i) => ({
            repo: String((x && x.repo) || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, ''),
            parent: i === 0 ? null : (Number.isInteger(x && x.parent) && x.parent >= 0 && x.parent < i ? x.parent : i - 1),
            rel: RELS.includes(x && x.rel) ? x.rel : (i ? 'inspired by' : ''), note: x && x.note ? String(x.note).slice(0, 60) : '', query: !!(x && x.query), data: null
          }));
          const bad = list.filter(x => !NAME.test(x.repo)).map(x => x.repo || '(empty)');
          let verified = false, missing = [];
          try {
            const { repos } = await api(`/api/repos?r=${encodeURIComponent(list.filter(x => NAME.test(x.repo)).map(x => x.repo).join(','))}`);
            verified = true;
            list.forEach(x => { x.data = repos[x.repo] || null; if (!x.data) missing.push(x.repo); else x.repo = x.data.name; });
          } catch (_) { /* no github here (preview): keep the names as given */ }
          // drop what isn't on github, hand its children to its parent
          const keep = list.map(x => NAME.test(x.repo) && (!verified || !!x.data));
          const at = []; let k = 0; list.forEach((x, i) => { at[i] = keep[i] ? k++ : -1; });
          const up = i => { let p = list[i].parent; while (p != null && !keep[p]) p = list[p].parent; return p; };
          // (if the origin itself was dropped, the first surviving repo becomes the origin and orphans hang from it)
          let out = list.map((x, i) => (keep[i] ? { ...x, parent: at[i] === 0 ? null : (up(i) == null ? 0 : at[up(i)]) } : null)).filter(Boolean);
          if (out.length < 2) throw new Error(`not on github: ${missing.concat(bad).join(', ') || 'nothing left'}. search_repos for the real names and call trace_repos again.`);
          // what github itself knows: a real fork of its parent, or a fork of something above the origin
          out.forEach(x => { if (x.data && x.data.fork && x.parent != null && out[x.parent].repo.toLowerCase() === x.data.fork.toLowerCase()) x.rel = 'fork'; });
          if (verified && out[0].data && out[0].data.fork && out[0].data.fork !== '?') {
            try {
              const { repos } = await api(`/api/repos?r=${encodeURIComponent(out[0].data.fork)}`);
              const p = repos[out[0].data.fork];
              if (p) { out = [{ repo: p.name, parent: null, rel: '', note: '', query: false, data: p }].concat(out.map(x => ({ ...x, parent: x.parent == null ? 0 : x.parent + 1 }))); out[1].rel = 'fork'; }
            } catch (_) { }
          }
          let focus = out.findIndex(x => x.query); if (focus < 0) focus = out.length - 1;
          ui.card({ type: 'repos', title: String(title || out[focus].repo).slice(0, 60), nodes: out, focus, verified });
          if (ui.light) ui.light();
          return { drawn: out.map(x => ({ repo: x.repo, stars: x.data ? x.data.stars : undefined, year: x.data ? year(x.data.created) : undefined, rel: x.rel })), not_on_github: missing.concat(bad) };
        } }
    ];
  }

  // claude.use() answers a moment after the page's first script run (null after ~10 s with no viewer),
  // so wait for it whatever the host is; on our own site /api/ask answers first.
  const AI = { kind: null, sample: null, ready: null };
  AI.ready = (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const endpoint = (typeof fetch === 'function' ? fetch('/api/ask', { method: 'GET', cache: 'no-store' }) : Promise.reject(new Error('no fetch')))
      .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null)).then(j => !!(j && j.ok)).catch(() => false);
    const viewer = (async () => {
      for (let i = 0; i < 30 && !(window.claude && window.claude.use); i++) await sleep(100);
      if (!(window.claude && window.claude.use)) return null;
      try { return await window.claude.use('sample'); } catch (_) { return null; }
    })();
    if (await endpoint) AI.kind = 'endpoint';
    else { const s = await viewer; if (s) { AI.sample = s; AI.kind = 'claude'; } }
    window.dispatchEvent(new Event('forks-ai'));
    return AI.kind;
  })();

  const INSIST = 'draw the tree now with trace_repos: real owner/name repositories only.';
  async function claudeRound(turns, tools, ui, signal) {
    const { text } = await AI.sample(turns, { tools, modelTier: 'quick', cache: false, signal, onText: ({ text }) => ui.stream(text) });
    return text || '';
  }
  async function endpointRound(msgs, tools, ui, signal, force) {
    for (let round = 0; round < 6; round++) {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(force && round === 0 ? { messages: msgs, force } : { messages: msgs }), signal });
      if (!r.ok) throw { code: r.status === 429 ? 'rate_limited' : 'upstream_error' };
      const m = (await r.json()).message;
      msgs.push(m);
      if (!m.tool_calls || !m.tool_calls.length) { ui.stream(m.content || ''); return m.content || ''; }
      for (const c of m.tool_calls) {
        const t = tools.find(x => x.name === c.function.name); let out;
        try { out = t ? await t.execute(JSON.parse(c.function.arguments || '{}'), { signal }) : 'unknown tool'; } catch (e) { out = 'Error: ' + (e.message || e); }
        msgs.push({ role: 'tool', tool_call_id: c.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      }
    }
    return '';
  }

  async function modelAnswer(history, ui, signal) {
    if (AI.ready) await AI.ready;
    let drew = false;
    const card = ui.card;
    const tools = toolsFor({ ...ui, card: c => { if (c.type === 'repos') drew = true; card(c); } });
    if (AI.kind === 'claude') {
      const turns = history.map(h => ({ role: h.role, content: String(h.content || '') })).filter(h => h.content);
      while (turns.length && turns[0].role !== 'user') turns.shift();
      if (!turns.length) throw { code: 'no_model' };
      turns[0] = { role: 'user', content: RULES + '\n\n---\n\n' + turns[0].content };
      let text = await claudeRound(turns, tools, ui, signal);
      if (!drew && !signal.aborted) {
        const again = turns.slice(); again[again.length - 1] = { role: 'user', content: again[again.length - 1].content + '\n\n(' + INSIST + ')' };
        text = (await claudeRound(again, tools, ui, signal)) || text;
      }
      return text;
    }
    if (AI.kind === 'endpoint') {
      // The server adds RULES and the tool list itself (netlify/lib/upstream.mjs, generated from this file).
      const base = history.map(h => ({ role: h.role, content: String(h.content || '') })).filter(h => h.content);
      let text = await endpointRound(base.slice(), tools, ui, signal);
      if (!drew && !signal.aborted) text = (await endpointRound(base.slice(), tools, ui, signal, 'trace_repos')) || text;
      return text;
    }
    throw { code: 'no_model' };
  }

  // Without a model: the most-starred match and the forks GitHub itself records above it.
  async function githubOnly(raw, ui) {
    const q = norm(raw).replace(/^\/trace\s+/, '').replace(/^(where did|what did|who forked|the family tree of|trace)\s+/, '').replace(/\s+(come from|become)\??$/, '').replace(/[?"“”]/g, '').trim();
    const direct = NAME.test(q.replace(/^https?:\/\/github\.com\//, '')) ? q.replace(/^https?:\/\/github\.com\//, '') : null;
    let top;
    if (direct) top = (await api(`/api/repos?r=${encodeURIComponent(direct)}`)).repos[direct];
    else { const { items } = await api(`/api/repos/search?q=${encodeURIComponent(q.slice(0, 100))}`); top = items[0] && (await api(`/api/repos?r=${encodeURIComponent(items[0].name)}`)).repos[items[0].name]; }
    if (!top) return false;
    const line = [top];
    for (let i = 0; i < 4 && line[0].fork && line[0].fork !== '?'; i++) {
      const p = (await api(`/api/repos?r=${encodeURIComponent(line[0].fork)}`)).repos[line[0].fork];
      if (!p) break; line.unshift(p);
    }
    const nodes = line.map((d, i) => ({ repo: d.name, parent: i ? i - 1 : null, rel: i ? 'fork' : '', note: '', query: i === line.length - 1, data: d }));
    ui.card({ type: 'repos', title: top.name, nodes, focus: nodes.length - 1, verified: true });
    return true;
  }

  // RULES and toolSpecs are read by scripts/build-upstream.cjs, so the hosted endpoint sends the model exactly this.
  const toolSpecs = () => toolsFor(null).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  window.ForksBrain = { route, modelAnswer, githubOnly, AI, R, RULES, toolSpecs, year };
})();
