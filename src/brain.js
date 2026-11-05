/* forks — upstream's brain.
   Every point on a tree is a real public GitHub repository. On the site one request does it all:
   /api/trace finds candidates on GitHub, asks the model once for the tree (compact json), checks every
   repo with GitHub and grows the tree with real notable forks. In the Claude artifact, Claude answers
   with the same brief and the names are drawn as given (no GitHub there). Without a model: GitHub alone. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG || { quest: { command: '/freeforks', total: 5000 }, token: { ticker: '$FORK' } };
  const P = window.FORKS_PROMPT;
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const year = d => (d ? String(d).slice(0, 4) : '');

  /* ---------- commands: everything else is something to trace ---------- */
  function route(raw) {
    const t = norm(raw);
    const cmd = t.match(/^\/(\w+)\s*(.*)$/);
    if (cmd) {
      const k = { clear: 'clear', help: 'help', about: 'persona', freeforks: 'quest', logout: 'logout', signout: 'logout', invite: 'invite', ref: 'invite', refs: 'invite' }[cmd[1]];
      if (k === 'clear') return { clear: true };
      if (k === 'quest' || k === 'logout' || k === 'invite') return { quest: k };
      if (k) return { text: R[k]() };
      if (cmd[1] === 'trace' && cmd[2]) return { trace: raw.replace(/^\/trace\s+/i, '') };
      if (cmd[1] === 'coins') return { launch: 'coins' };
      if (cmd[1] === 'launch' || cmd[1] === 'coin') return { launch: raw.replace(/^\/\w+\s*/, '') };
    }
    if (/^\/?free ?forks\b|^get \+?\d+[ ,.]?000 \$?forks?\b/.test(t)) return { quest: 'quest' };
    if (/^(who are you|what are you|what is (this|forks|forks\.wiki)|how does (this|it) work|кто ты|ты кто|что это)\??$/.test(t)) return { text: R.persona() };
    return { trace: raw };
  }
  const R = {
    persona: () => ({ text: `i'm upstream. i keep the family tree of open-source code.\nevery repo on github came from something older — a fork, a port, a rewrite, a project it was built on.\ntype anything — a word, a project, a link — and i'll grow the line of repos it came from.${C.x.handle ? `\nnews of the line: @${C.x.handle} on x.` : ''}`, follow: ['where did llama.cpp come from?', 'what did bitcoin/bitcoin become?', C.quest.command] }),
    help: () => ({ text: `type anything: a word, an idea, a project, owner/name or a github link.\nevery point on the tree is a real repo — tap it for github, its forks and the network graph.\n\n/trace <thing>    same as typing it\n${C.quest.command}        sign in with x for ${C.token.ticker}, pending · then six trials, +${C.quest.total.toLocaleString('en-US')}\n/invite           your invite link · +2,000 ${C.token.ticker} a friend\n/launch <repo>    the coin on a repository, or launch it on pump.fun\n/coins            the newest coins on repositories\n/clear            start over${C.x.handle ? `\n\nforks on x: @${C.x.handle}` : ''}`, follow: ['where did neovim come from?', C.quest.command] })
  };

  async function api(path, signal) {
    const r = await fetch(path, { signal });
    if (r.status === 429) throw { code: 'rate_limited' };
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw { code: 'upstream_error', status: r.status };
    return r.json();
  }

  // which brain this page has: our /api/trace on the site, Claude in the artifact viewer
  // (claude.use() answers a moment after the first script run, null after ~10 s with no viewer)
  const AI = { kind: null, sample: null, ready: null };
  AI.ready = (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const site = (typeof fetch === 'function' ? fetch('/api/trace') : Promise.reject(new Error('no fetch')))
      .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null)).then(j => !!(j && j.ok)).catch(() => false);
    const viewer = (async () => {
      for (let i = 0; i < 30 && !(window.claude && window.claude.use); i++) await sleep(100);
      if (!(window.claude && window.claude.use)) return null;
      try { return await window.claude.use('sample'); } catch (_) { return null; }
    })();
    if (await site) AI.kind = 'site';
    else { const s = await viewer; if (s) { AI.sample = s; AI.kind = 'claude'; } }
    window.dispatchEvent(new Event('forks-ai'));
    return AI.kind;
  })();

  // → the lines to show under the tree; draws the tree through ui.card({ type: 'repos', … })
  async function modelAnswer(raw, ui, signal) {
    if (AI.ready) await AI.ready;
    if (AI.kind === 'site') {
      const t = await api(`/api/trace?q=${encodeURIComponent(raw)}`, signal);
      ui.card({ type: 'repos', title: t.title, nodes: t.nodes, focus: t.focus, verified: true });
      return t.lines || '';
    }
    if (AI.kind === 'claude') {
      let tree = null;
      for (let attempt = 0; attempt < 2 && !tree && !signal.aborted; attempt++) {
        const { text } = await AI.sample([{ role: 'user', content: `${P.SYSTEM}\n\n---\n\n${P.user(raw, [])}${attempt ? '\n\nanswer with the json only.' : ''}` }], { modelTier: 'quick', cache: false, signal });
        tree = P.shape(P.parse(text));
      }
      if (!tree) throw { code: 'no_tree' };
      ui.card({ type: 'repos', title: tree.title, nodes: tree.nodes.map(x => ({ ...x, data: null })), focus: tree.focus, verified: false });
      return tree.lines;
    }
    throw { code: 'no_model' };
  }

  // Without a model: the most-starred match and the forks GitHub itself records above it.
  async function githubOnly(raw, ui) {
    const q = P.subject(raw);
    const direct = P.NAME.test(q.replace(/^https?:\/\/github\.com\//, '')) ? q.replace(/^https?:\/\/github\.com\//, '') : null;
    let top;
    if (direct) top = (await api(`/api/repos?r=${encodeURIComponent(direct)}`)).repos[direct];
    else { const { items } = await api(`/api/repos/search?q=${encodeURIComponent(q.slice(0, 100))}`); top = items[0] && (await api(`/api/repos?r=${encodeURIComponent(items[0].name)}`)).repos[items[0].name]; }
    if (!top) return false;
    const line = [top];
    for (let i = 0; i < 4 && line[0].fork && line[0].fork !== '?'; i++) {
      const p = (await api(`/api/repos?r=${encodeURIComponent(line[0].fork)}`)).repos[line[0].fork];
      if (!p) break; line.unshift(p);
    }
    const nodes = line.map((d, i) => ({ repo: d.name, parent: i ? i - 1 : null, rel: i ? 'fork' : '', note: '', data: d }));
    ui.card({ type: 'repos', title: top.name, nodes, focus: nodes.length - 1, verified: true });
    return true;
  }

  window.ForksBrain = { route, modelAnswer, githubOnly, AI, R, year };
})();
