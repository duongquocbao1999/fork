/* forks — the page: one question, a stage where the line of repositories grows, a card for every point. */
(function () {
  'use strict';
  const B = window.ForksBrain;
  const $ = s => document.querySelector(s);
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const kfmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
  const MARK = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20V3.6"/><path d="M9 14.4C9 10 15.4 10.5 15.4 6.8"/><circle class="d" cx="9" cy="20" r="2.4"/><circle class="e" cx="15.4" cy="5.1" r="1.8"/></svg>';

  const C = window.FORKS_CONFIG, SH = window.ForksShell;

  /* ---------- a small burst where something lands (the old canvas field is gone) ---------- */
  const field = {
    setFocus() { }, setMode() { }, setDim() { }, light() { }, tap() { },
    burst(x, y) {
      if (RM.matches) return;
      for (let i = 0; i < 10; i++) {
        const d = document.createElement('i'), a = (i / 10) * Math.PI * 2, r = 26 + Math.random() * 18;
        d.style.cssText = `position:fixed;z-index:60;left:${x}px;top:${y}px;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--acc);pointer-events:none`;
        document.body.appendChild(d);
        d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.4)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => d.remove();
      }
    }
  };

  /* ---------- starters ---------- */
  const STARTS = [
    ['who forked bitcoin?', 'what did bitcoin/bitcoin become?'],
    ['the bloodline of llama.cpp', 'where did llama.cpp come from?'],
    ['neovim, from the root', 'where did neovim come from?'],
    ['what is ollama built on?', 'where did ollama come from?'],
    ['the family tree of doge', 'where did dogecoin come from?'],
    ['who came before bun?', 'where did bun come from?'],
    ['everything vscode forked into', 'what did microsoft/vscode become?'],
    ['where did zed come from?', 'where did zed come from?'],
    ['how linux forked', 'what did torvalds/linux become?'],
    ['the roots of ethereum', 'where did go-ethereum come from?']
  ];
  const starts = STARTS.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, 4).map(x => x[1]);
  $('#chips').innerHTML = starts.map(([label, q]) => `<button class="chip" type="button" data-q="${esc(q)}">${esc(label)}</button>`).join('') + '<button class="chip" type="button" data-q="/info">what is this?</button>';
  $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) send(b.dataset.q); });

  /* ---------- input ---------- */
  const inp = $('#inp'), sendBtn = $('#sendBtn'), form = $('#ask');
  $('#askSlot').appendChild(form);
  const SMALL = () => innerWidth < 640;
  const PH = [SMALL() ? 'Trace anything' : 'Trace anything — a repo, a project, a word', 'llama.cpp', 'bitcoin', 'github.com/neovim/neovim', 'doge', 'why is everything a fork of chromium?'];
  let phI = 0; inp.placeholder = PH[0];
  setInterval(() => { if (document.activeElement !== inp && !inp.value && !document.body.classList.contains('chat')) { phI = (phI + 1) % PH.length; inp.placeholder = PH[phI]; } }, 3200);
  inp.addEventListener('input', () => { sendBtn.disabled = !inp.value.trim(); });
  form.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (v) send(v); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#full').hidden) closeFull(); else if (busy && ctl) ctl.abort(); }
  });

  /* ---------- modes ---------- */
  const thread = $('#thread');
  let history = [], busy = false, ctl = null, queued = null;
  function toChat() {
    if (document.body.classList.contains('chat')) return;
    document.body.classList.add('chat');
    $('#dock').appendChild(form);
    inp.placeholder = SMALL() ? 'Trace something else' : 'Trace something else — a repo, a project, a word';
  }
  function reset() {
    if (ctl) ctl.abort();
    [...thread.children].forEach(li => { if (!li.classList.contains('showcase')) li.remove(); });
    history = []; busy = false;
    document.body.classList.remove('chat');
    $('#askSlot').appendChild(form);
    inp.placeholder = PH[0]; inp.value = ''; sendBtn.disabled = true;
    scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' });
  }

  /* ---------- messages ---------- */
  function addYou(text) {
    const li = document.createElement('li'); li.className = 'msg you';
    li.innerHTML = `<span>you asked <b>${esc(text)}</b></span>`;
    thread.appendChild(li); scrollDown();
  }
  function addUp() {
    const li = document.createElement('li'); li.className = 'msg up';
    li.innerHTML = `<div class="av">${MARK}</div><div class="body"><div class="who">upstream<span class="src" hidden></span></div><div class="txt"><span class="thinking"><i></i><i></i><i></i> tracing</span></div><div class="cards"></div></div>`;
    thread.appendChild(li); scrollDown();
    return { li, txt: li.querySelector('.txt'), cards: li.querySelector('.cards'), src: li.querySelector('.src'), body: li.querySelector('.body') };
  }
  let quiet = true; // the showcase grows where it is: no scrolling until someone asks something
  function scrollDown() { if (quiet) return; requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: RM.matches ? 'auto' : 'smooth' })); }
  function type(el, text, instant) {
    return new Promise(res => {
      if (RM.matches || instant) { el.textContent = text; return res(); }
      el.textContent = ''; const caret = document.createElement('span'); caret.className = 'caret';
      const node = document.createTextNode(''); el.append(node, caret);
      let i = 0; const step = () => {
        i = Math.min(text.length, i + Math.max(2, Math.round(text.length / 90)));
        node.data = text.slice(0, i);
        if (i < text.length) setTimeout(step, 14); else { caret.remove(); res(); }
      };
      step();
    });
  }
  function follow(m, list) {
    if (!list || !list.length) return;
    const d = document.createElement('div'); d.className = 'follow';
    d.innerHTML = list.slice(0, 5).map(f => (typeof f === 'object' ? `<a class="chip" href="${esc(f.href)}">${esc(f.label)}</a>` : `<button class="chip" type="button">${esc(f)}</button>`)).join('');
    d.addEventListener('click', e => { const b = e.target.closest('button.chip'); if (b) send(b.textContent); });
    m.body.appendChild(d);
  }

  /* ---------- repositories on the stage ---------- */
  const wait = ms => new Promise(r => setTimeout(r, RM.matches ? 0 : ms));
  const relOf = (x, parent) => {
    if (!parent) return '';
    const p = parent.repo;
    return { fork: `a fork of ${p}`, port: `a port of ${p}`, rewrite: `a rewrite of ${p}`, 'built on': `built on ${p}`, 'inspired by': `inspired by ${p}`, successor: `the successor of ${p}` }[x.rel] || `came from ${p}`;
  };
  const nodeMeta = x => [x.data ? B.year(x.data.created) : '', x.data ? '★ ' + kfmt(x.data.stars) : '', x.note || x.rel].filter(Boolean).join(' · ');
  function addTrace() {
    const li = document.createElement('li'); li.className = 'msg trace';
    li.innerHTML = '<div class="who">upstream <span class="src">graph</span></div><div class="stage-host"></div><div class="result"><div class="r-head" hidden></div><div class="r-sub" hidden></div><div class="txt"></div><div class="cards"></div></div>';
    thread.appendChild(li);
    const m = { li, txt: li.querySelector('.txt'), cards: li.querySelector('.cards'), body: li.querySelector('.result'), head: li.querySelector('.r-head'), sub: li.querySelector('.r-sub') };
    m.stage = window.ForksStage.create(li.querySelector('.stage-host'), {
      onPick: (id, rect) => m.pick && m.pick(id, rect),
      onFull: () => m.full && m.full(),
      onPoint: () => { }
    });
    scrollDown();
    return m;
  }
  const trees = []; // every tree on the page, so a coin that lands can show up on it
  // the tokens on a tree: a project's own token (blue, by GitHub owner) and a coin launched here (amber)
  let prices = {};
  const logos = {}; // project token logos, from the market
  const usd = n => (n == null ? '' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : n > 0 ? `$${SH.tiny(n)}` : '$0');
  const pct = c => (c == null ? '' : `${c >= 0 ? '+' : ''}${Number(c).toFixed(1)}%`);
  function tokensOf(repo, map) {
    const out = [], p = C.projectOf(repo), f = map && map.get(String(repo).toLowerCase());
    if (p) out.push({ kind: 'project', symbol: p.symbol, mint: p.mint, name: p.name });
    if (f) out.push({ kind: 'forks', symbol: f.symbol, mint: f.mint, name: f.name });
    return out;
  }
  function tagCoins(m, map) {
    m.coins = map;
    m.tree.nodes.forEach((x, i) => tokensOf(x.repo, map).forEach(t => m.stage.tag(String(i), '$' + t.symbol, t.kind)));
    m.body.querySelectorAll('.rp[data-repo]').forEach(a => {
      for (const t of tokensOf(a.dataset.repo, map)) {
        if (a.querySelector(`.rp-coin[data-mint="${t.mint}"]`)) continue;
        const b = document.createElement('a'); b.className = 'rp-coin' + (t.kind === 'project' ? ' project' : ''); b.dataset.mint = t.mint;
        b.href = '/coin/' + t.mint; b.title = t.kind === 'project' ? `${t.name}: the project's token — open the terminal` : `${t.name}: a coin launched on forks — open the terminal`;
        const mk = prices[t.mint];
        b.innerHTML = `$${esc(t.symbol)}${mk && mk.price != null ? `<small>${usd(mk.price)}${mk.change24 != null ? ' ' + pct(mk.change24) : ''}</small>` : ''}`;
        b.addEventListener('click', e => e.stopPropagation());
        a.querySelector('.rp-name').appendChild(b);
      }
    });
  }
  async function priceTree(m) {
    const mints = [];
    m.tree.nodes.forEach(x => tokensOf(x.repo, m.coins).forEach(t => mints.push(t.mint)));
    const todo = [...new Set(mints)].filter(x => !(x in prices));
    if (todo.length) {
      try { const j = await fetch('/api/prices?mints=' + todo.join(',')).then(r => r.json()); if (j.ok) Object.assign(prices, j.prices); } catch (_) { }
    }
    m.body.querySelectorAll('.rp-coin[data-mint]').forEach(b => {
      const mk = prices[b.dataset.mint]; if (!mk || mk.price == null || b.querySelector('small')) return;
      b.insertAdjacentHTML('beforeend', `<small>${usd(mk.price)}${mk.change24 != null ? ' ' + pct(mk.change24) : ''}</small>`);
    });
  }
  function growRepos(m, c, instant) {
    m.tree = c; trees.push(m);
    m.pick = (id, rect) => pointRepo(c, Number(id), rect);
    m.full = () => showFull(c.title.toLowerCase(), `${c.nodes.length} repositories · origin ${c.nodes[0].repo}${c.nodes[0].data ? ', ' + B.year(c.nodes[0].data.created) : ''} · traced to ${c.nodes[c.focus].repo}`, repoTree(c, 'full'), (id, rect) => pointRepo(c, Number(id), rect), '<span><i class="p"></i>the traced line</span><span>tap any repository for github</span>');
    return m.stage.grow({
      root: '0', focus: String(c.focus), instant: !!instant,
      nodes: c.nodes.map((x, i) => ({ id: String(i), name: x.repo, when: x.data ? B.year(x.data.created) : '', meta: nodeMeta(x), parent: x.parent == null ? null : String(x.parent), size: x.data ? Math.min(1, Math.log10(x.data.stars + 1) / 5.2) : null }))
    }).then(r => {
      const root = c.nodes[0], focus = c.nodes[c.focus];
      m.head.hidden = false; m.head.innerHTML = `<span class="o">${esc(focus.repo.split('/')[0])} / </span>${esc(focus.repo.split('/').slice(1).join('/'))}`;
      m.sub.hidden = false;
      const y = root.data ? ' · ' + B.year(root.data.created) : '';
      m.sub.innerHTML = (r.forks ? `${r.forks} fork${r.forks > 1 ? 's' : ''} from <b>${esc(root.repo)}</b>${y}` : `the origin${y}`) +
        (focus.data ? ` · ★ ${fmt(focus.data.stars)}` : '') + ' · <span class="hint">tap any point for github</span>';
      scrollDown();
      return r;
    });
  }

  /* ---------- the repositories under the tree: the line, then the branches ---------- */
  const LANG = { 'C++': '#f34b7d', C: '#555555', Go: '#00ADD8', Rust: '#dea584', Python: '#3572A5', TypeScript: '#3178c6', JavaScript: '#f1e05a', Java: '#b07219', Kotlin: '#A97BFF', Swift: '#F05138', Ruby: '#701516', PHP: '#4F5D95', 'C#': '#178600', Shell: '#89e051', Lua: '#000080', 'Vim Script': '#199f4b', Zig: '#ec915c', Haskell: '#5e5086', Elixir: '#6e4a7e', Dart: '#00B4AB', Solidity: '#AA6746', 'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', CSS: '#563d7c', Scala: '#c22d40', OCaml: '#ef7a08', Nix: '#7e7eff', 'Objective-C': '#438eff', Clojure: '#db5855', Vue: '#41b883', Svelte: '#ff3e00', Julia: '#a270ba', R: '#198CE7', Perl: '#0298c3', Erlang: '#B83998', Nim: '#ffc200', Crystal: '#000100', Assembly: '#6E4C13', Makefile: '#427819', Dockerfile: '#384d54', 'Emacs Lisp': '#c065db', TeX: '#3D6117', MDX: '#fcb32c', Move: '#4a137a', Cairo: '#ff4a48' };
  function renderLine(m, c) {
    if (!c) return;
    const path = []; for (let i = c.focus; i != null; i = c.nodes[i].parent) path.unshift(i);
    const onPath = new Set(path);
    const branches = c.nodes.map((x, i) => i).filter(i => !onPath.has(i));
    const row = (i, n) => {
      const x = c.nodes[i], d = x.data, parent = x.parent == null ? null : c.nodes[x.parent];
      const [owner, name] = x.repo.split('/');
      const how = i === path[0] ? 'the origin' : [relOf(x, parent), x.note].filter(Boolean).join(' · ');
      return `<a class="rp${onPath.has(i) ? ' main' : ''}${i === c.focus ? ' focus' : ''}" data-repo="${esc(x.repo)}" href="${esc(d ? d.url : 'https://github.com/' + x.repo)}" target="_blank" rel="noopener">` +
        (n ? `<span class="rp-i">${n}</span>` : '') +
        `<span class="rp-av" data-owner="${esc(owner)}"><b>${esc(owner[0] || '?')}</b></span>` +
        `<span class="rp-b"><span class="rp-name"><span class="rp-o">${esc(owner)}/</span>${esc(name)}</span>` +
        (d && d.desc ? `<span class="rp-desc">${esc(d.desc)}</span>` : '') +
        `<span class="rp-meta">${d && d.lang ? `<i style="background:${LANG[d.lang] || 'var(--ink-3)'}"></i>${esc(d.lang)} · ` : ''}${d ? 'since ' + B.year(d.created) + ' · ' : ''}${esc(how)}</span></span>` +
        (d ? `<span class="rp-s">★ ${kfmt(d.stars)}</span>` : '') + '</a>';
    };
    // folded by default: one line with the faces of the line; the full list opens on tap
    const el = document.createElement('div'); el.className = 'line';
    const total = c.nodes.length, stars = c.nodes.reduce((s, x) => s + (x.data ? x.data.stars : 0), 0);
    el.innerHTML = `<button class="line-t" type="button" aria-expanded="false">` +
        `<span class="line-avs">${path.slice(0, 5).map(i => { const o = c.nodes[i].repo.split('/')[0]; return `<span class="rp-av sm" data-owner="${esc(o)}"><b>${esc(o[0] || '?')}</b></span>`; }).join('')}</span>` +
        `<span class="line-s"><b>${total} repositories</b> · line of ${path.length}${branches.length ? ` · ${branches.length} branch${branches.length > 1 ? 'es' : ''}` : ''}${stars ? ` · ★ ${kfmt(stars)}` : ''}</span>` +
        `<span class="line-x">show</span></button>` +
      `<div class="line-body" hidden><div class="line-k">the line</div>${path.map((i, k) => row(i, k + 1)).join('')}` +
      (branches.length ? `<div class="line-k">branches</div>${branches.map(i => row(i, 0)).join('')}` : '') + '</div>';
    const t = el.querySelector('.line-t'), body = el.querySelector('.line-body');
    t.addEventListener('click', () => {
      const open = body.hidden; body.hidden = !open; el.classList.toggle('open', open);
      t.setAttribute('aria-expanded', String(open)); t.querySelector('.line-x').textContent = open ? 'hide' : 'show';
      if (open) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' }));
    });
    // owners' avatars from github, initials where they can't load
    el.querySelectorAll('.rp-av').forEach(a => {
      const img = new Image(); img.alt = ''; img.width = 28; img.height = 28; img.decoding = 'async';
      img.onload = () => { a.textContent = ''; a.appendChild(img); a.classList.add('img'); };
      img.src = `https://github.com/${encodeURIComponent(a.dataset.owner)}.png?size=64`;
    });
    m.body.insertBefore(el, m.cards);
  }

  /* ---------- send ---------- */
  async function send(raw) {
    raw = String(raw || '').trim(); if (!raw) return;
    quiet = false;
    if (busy) { queued = raw; inp.value = ''; sendBtn.disabled = true; return; } // goes out as soon as this answer lands
    const r = B.route(raw);
    if (r.clear) { reset(); return; }
    toChat(); inp.value = ''; sendBtn.disabled = true; addYou(raw);
    busy = true;
    try {
      if (r.quest) { await QUEST.run(r.quest); return; } // /freeforks and /logout run in the page, never through the model
      if (r.launch != null) { await LAUNCH.run(r.launch); return; } // coins on repositories: /launch owner/name, /coins
      if (r.info) { const m = addUp(); m.src.hidden = false; m.src.textContent = 'info'; await wait(300); await type(m.txt, r.info.text); follow(m, r.info.follow); return; }
      if (r.text) { const m = addUp(); await wait(420); await type(m.txt, r.text.text); follow(m, r.text.follow); return; }

      history.push({ role: 'user', content: r.trace });
      const m = addTrace();
      const ui = {
        card: c => {
          if (c.type !== 'repos') return;
          if (!m.growP) m.growP = growRepos(m, c); else { renderRepos(m, c); scrollDown(); }
        },
        light: () => {},
        stream: t => { streamed = t; }
      };
      let streamed = '', text = '', err = null;
      await B.AI.ready;
      if (B.AI.kind) {
        ctl = new AbortController();
        const acts = m.stage.el.querySelector('.st-acts');
        acts.innerHTML = '<button type="button">stop</button>'; acts.querySelector('button').onclick = () => ctl && ctl.abort();
        try { text = await B.modelAnswer(r.trace, ui, ctl.signal); } catch (e) { err = e; }
        if (!m.growP && err && (err.code === 'cancelled' || (ctl && ctl.signal.aborted))) { m.stage.remove(); await type(m.txt, 'stopped.'); return; }
      }
      // no model, or it drew nothing: the most-starred match and the forks github records above it
      let note = '';
      if (!m.growP) {
        try { if (await B.githubOnly(r.trace, ui)) note = 'upstream is offline, so this is github alone: the closest repository and the forks above it.'; } catch (_) { }
      }
      if (m.growP) {
        const g = await m.growP;
        const tokP = LAUNCH.tokens(m.tree.nodes.map(x => x.repo)).catch(() => new Map());
        tokP.then(map => tagCoins(m, map));
        const t = String(note || text || streamed || '').trim();
        if (t) await type(m.txt, t);
        renderLine(m, m.tree);
        const root = g.root.name, focus = g.focus.name;
        tokP.then(map => { tagCoins(m, map); priceTree(m); });
        follow(m, [g.forks ? `where did ${root} come from?` : `what did ${focus} become?`, g.forks ? `what did ${focus} become?` : `where did ${focus} come from?`].concat(C.launch.treasury && LAUNCH.repoOf(focus) ? [`/launch ${focus}`] : []));
        QUEST.noteTrace(m.tree.nodes.length); // your fork card: trees grown, repositories seen; and the chat trial
        history.push({ role: 'assistant', content: t || `${focus}: ${g.forks} forks from ${root}` });
        return;
      }
      m.stage.remove();
      const why = err && err.code === 'rate_limited' ? 'too many traces at once. give it a minute.' : err && err.code === 'not_granted' ? 'the model is switched off for this page.' : 'couldn’t reach a model or github just now. try again in a minute.';
      await type(m.txt, why);
      history.push({ role: 'assistant', content: why });
    } finally {
      busy = false; ctl = null; scrollDown();
      if (queued) { const q = queued; queued = null; setTimeout(() => send(q), 0); }
      if (matchMedia('(pointer: fine)').matches) inp.focus();
    }
  }

  /* ---------- static trees (full view, extra trees) ---------- */
  function layout(rootId, kids) {
    let leaf = 0; const pos = new Map(); let maxD = 0;
    const place = (id, d) => {
      maxD = Math.max(maxD, d); const ks = kids(id); let y;
      if (!ks.length) y = leaf++; else { const ys = ks.map(k => place(k, d + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(id, { d, y }); return y;
    };
    place(rootId, 0); return { pos, leaves: leaf, maxD };
  }
  function treeSVG(o) {
    // o: { root, kids(id), get(id) -> {name, meta}, path:Set, sub:Set, focus, colW, rowH, chars, grow, full }
    const L = layout(o.root, o.kids), colW = o.colW, rowH = o.rowH, pad = 14;
    const rg = o.get(o.root), rootW = Math.max(Math.min(rg.name.length, o.chars) * (o.full ? 7.6 : 6.7), (rg.meta || '').length * (o.full ? 6.4 : 5.8)) + 16;
    const W = rootW + L.maxD * colW + Math.max(colW, o.chars * 7) + 20, Hh = Math.max(1, L.leaves) * rowH + pad * 2 + 18;
    const X = d => rootW + d * colW, Y = y => pad + 18 + y * rowH + rowH / 2;
    let edges = '', nodes = '';
    for (const [id, p] of L.pos) {
      for (const k of o.kids(id)) {
        const c = L.pos.get(k), x0 = X(p.d), y0 = Y(p.y), x1 = X(c.d), y1 = Y(c.y), dx = x1 - x0;
        const cls = o.path.has(k) && o.path.has(id) ? 'path' : (o.sub.has(k) ? 'sub' : '');
        edges += `<path class="e ${cls}${o.grow ? ' grow' : ''}" style="animation-delay:${c.d * 140}ms" d="M${x0} ${y0}C${x0 + dx * .6} ${y0} ${x0 + dx * .4} ${y1} ${x1} ${y1}"/>`;
      }
    }
    for (const [id, p] of L.pos) {
      const g = o.get(id), x = X(p.d), y = Y(p.y), isP = o.path.has(id), isF = id === o.focus, isR = id === o.root;
      const showMeta = isP || isF || o.full;
      const max = o.chars, nm = g.name.length > max ? g.name.slice(0, max - 1) + '…' : g.name;
      const leaf = !o.kids(id).length;
      const cls = ['n', isP ? 'path' : '', isF ? 'focus' : '', isR ? 'root' : '', o.sub.has(id) ? 'sub' : '', o.grow ? 'grow' : ''].join(' ');
      let label;
      if (!leaf && o.kids(id).length === 1 && !isR) label = `<text x="${x + 8}" y="${y - 7}">${esc(nm)}</text>` + (showMeta && g.meta ? `<text class="meta" x="${x + 8}" y="${y + 14}">${esc(g.meta)}</text>` : '');
      else if (leaf) label = `<text x="${x + 10}" y="${showMeta && g.meta ? y - 1 : y + 4}">${esc(nm)}</text>` + (showMeta && g.meta ? `<text class="meta" x="${x + 10}" y="${y + 11}">${esc(g.meta)}</text>` : '');
      else {
        const m2 = showMeta && g.meta;
        if (isR) label = `<text x="${x - 14}" y="${m2 ? y - 1 : y + 4}" text-anchor="end">${esc(nm)}</text>` + (m2 ? `<text class="meta" x="${x - 14}" y="${y + 11}" text-anchor="end">${esc(g.meta)}</text>` : '');
        // a fork point: label up and to the right, so it never runs back over the previous node's label
        else label = `<text x="${x + 8}" y="${m2 ? y - 21 : y - 9}">${esc(nm)}</text>` + (m2 ? `<text class="meta" x="${x + 8}" y="${y - 9}">${esc(g.meta)}</text>` : '');
      }
      nodes += `<g class="${cls}" data-id="${esc(id)}" style="animation-delay:${p.d * 140 + 200}ms" tabindex="0" role="button" aria-label="${esc(g.name)}">` +
        `<title>${esc(g.name)}${g.meta ? ' · ' + esc(g.meta) : ''}</title>` +
        (isF ? `<circle class="ring" cx="${x}" cy="${y}" r="9"/>` : '') +
        `<circle cx="${x}" cy="${y}" r="${isR ? 5 : isP || isF ? 4 : 3.2}"/>` + label + `</g>`;
    }
    return `<svg class="tree" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(o.label || 'lineage')}">${edges}${nodes}</svg>`;
  }
  function repoTree(c, size) {
    const full = size === 'full', small = innerWidth < 640;
    const kids = id => c.nodes.map((x, j) => j).filter(j => j > 0 && c.nodes[j].parent === Number(id)).map(String);
    const path = new Set(), sub = new Set();
    for (let i = c.focus; i != null; i = c.nodes[i].parent) path.add(String(i));
    const walk = i => kids(i).forEach(k => { sub.add(k); walk(k); }); walk(c.focus);
    return treeSVG({
      root: '0', kids, focus: String(c.focus), path, sub, full,
      get: id => { const x = c.nodes[Number(id)]; return { name: x.repo, meta: nodeMeta(x) }; },
      colW: full ? 260 : small ? 120 : 150, rowH: full ? 40 : 30, chars: full ? 32 : small ? 16 : 21, grow: !full, label: `repositories behind ${c.title}`
    });
  }
  function bindTree(el, pick) {
    const at = g => (g.querySelector('circle:not(.ring)') || g).getBoundingClientRect();
    el.addEventListener('click', e => { const g = e.target.closest('.n'); if (g) pick(g.dataset.id, at(g)); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('.n'); if (g) { e.preventDefault(); pick(g.dataset.id, at(g)); } } });
  }
  function renderRepos(m, c) {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div class="card-h"><span>// <b>${esc(c.title.toLowerCase())}</b> · ${c.nodes.length} repositories</span><span class="acts"><button type="button" data-a="full">open ↗</button></span></div><div class="tree-wrap">${repoTree(c)}</div>`;
    bindTree(el.querySelector('.tree-wrap'), (id, rect) => pointRepo(c, Number(id), rect));
    el.querySelector('[data-a="full"]').onclick = () => showFull(c.title.toLowerCase(), `${c.nodes.length} repositories`, repoTree(c, 'full'), (id, rect) => pointRepo(c, Number(id), rect), '<span><i class="p"></i>the traced line</span><span>tap any repository for github</span>');
    m.cards.appendChild(el);
  }

  /* ---------- a repository's card ---------- */
  const point = $('#point');
  function openPoint(o, rect) {
    point.innerHTML = `<div class="pt-h"><div class="pt-name">${esc(o.name)}</div>${o.meta ? `<div class="pt-meta">${esc(o.meta)}</div>` : ''}</div>` +
      (o.how ? `<div class="pt-how">${esc(o.how)}</div>` : '') +
      (o.desc ? `<p class="pt-desc">${esc(o.desc)}</p>` : '') +
      (o.coin || '') +
      `<div class="pt-k">on github</div><ul class="pt-links">${o.links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>` +
      `<div class="pt-acts">${o.acts.map(([t], i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join('')}</div>` +
      '<button class="pt-x" type="button" aria-label="Close">×</button>';
    point.querySelectorAll('.pt-acts button').forEach(b => { b.onclick = () => { closePoint(); closeFull(); o.acts[Number(b.dataset.i)][1](); }; });
    point.querySelector('.pt-x').onclick = closePoint;
    point.hidden = false; point.classList.toggle('sheet', SMALL());
    if (!SMALL() && rect) {
      const w = point.offsetWidth, h = point.offsetHeight;
      let x = rect.left + rect.width / 2 - 24, y = rect.bottom + 10;
      if (y + h > innerHeight - 12) y = Math.max(12, rect.top - h - 10);
      x = Math.max(12, Math.min(innerWidth - w - 12, x));
      // in page coordinates, so the card stays by its point while the page scrolls (over the full view it is fixed)
      const fixed = !$('#full').hidden; point.classList.toggle('fixed', fixed);
      point.style.left = (x + (fixed ? 0 : scrollX)) + 'px'; point.style.top = (y + (fixed ? 0 : scrollY)) + 'px';
    } else { point.style.left = ''; point.style.top = ''; }
    const first = point.querySelector('a'); if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }
  function closePoint() { point.hidden = true; }
  addEventListener('pointerdown', e => { if (!point.hidden && !point.contains(e.target) && !e.target.closest('.st-n, .tree .n')) closePoint(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !point.hidden) { e.stopPropagation(); closePoint(); } }, true);

  function pointRepo(c, i, rect) {
    const x = c.nodes[i], d = x.data, parent = x.parent == null ? null : c.nodes[x.parent];
    const url = d ? d.url : `https://github.com/${x.repo}`;
    const how = [relOf(x, parent), x.note].filter(Boolean).join(' · ') || (i === 0 ? 'the origin of this line' : '');
    const links = [['open on github', url], [`forks${d ? ' · ' + fmt(d.forks) : ''}`, url + '/forks'], ['network graph', url + '/network']];
    if (d && d.home && /^https?:\/\//.test(d.home)) links.push(['homepage', d.home]);
    if (!d) links.push(['search on github', `https://github.com/search?q=${enc(x.repo.split('/')[1] || x.repo)}&type=repositories`]);
    const coin = LAUNCH.known(x.repo), proj = C.projectOf(x.repo), canCoin = !!LAUNCH.repoOf(x.repo) && (x.data || coin);
    const tokBlock = t => { const mk = prices[t.mint]; return `<div class="pt-coin${t.kind === 'project' ? ' project' : ''}"><span class="pt-i">${SH.logo(logos[t.mint] || t.image || (mk && mk.image), t.symbol)}</span><span class="pt-k">${t.kind === 'project' ? 'project token' : 'coin on forks'}</span><b>$${esc(t.symbol)}</b>${mk && mk.price != null ? `<span class="mono">${usd(mk.price)}</span>${mk.change24 != null ? `<span class="mono ${mk.change24 >= 0 ? 'up' : 'dn'}">${pct(mk.change24)}</span>` : ''}` : ''}<a href="/coin/${esc(t.mint)}">trade →</a></div>`; };
    openPoint({
      name: x.repo, coin: (proj ? tokBlock({ kind: 'project', ...proj }) : '') + (coin ? tokBlock({ kind: 'forks', ...coin }) : ''),
      meta: d ? [`★ ${fmt(d.stars)}`, d.lang, `since ${B.year(d.created)}`, d.archived ? 'archived' : '', d.fork && d.fork !== '?' ? `github fork of ${d.fork}` : ''].filter(Boolean).join(' · ') : '',
      how, desc: d ? d.desc : '', links,
      acts: [['trace from here', () => send(`where did ${x.repo} come from?`)], ['what did it become?', () => send(`what did ${x.repo} become?`)]]
        .concat(coin ? [[`trade $${coin.symbol}`, () => { location.href = '/coin/' + coin.mint; }]] : canCoin ? [['launch a coin', () => { location.href = '/launch?repo=' + x.repo; }]] : [])
    }, rect);
  }

  /* ---------- full view ---------- */
  let fullPick = () => {};
  function showFull(title, sub, svg, pick, legend) {
    $('#fullTitle').textContent = title; $('#fullSub').textContent = sub; $('#fullB').innerHTML = svg; $('#fullLegend').innerHTML = legend;
    fullPick = pick; $('#full').hidden = false; $('#fullX').focus();
  }
  function closeFull() { $('#full').hidden = true; }
  $('#fullX').addEventListener('click', closeFull);
  bindTree($('#fullB'), (id, rect) => fullPick(id, rect));

  /* ---------- toast ---------- */
  const toast = msg => SH.toast(msg);

  /* ---------- $FORK: /freeforks ---------- */
  const meBtn = $('#meBtn');
  const QUEST = window.ForksQuest.mount({
    addUp, type, send, scrollDown, toast, esc, burst: (x, y) => field.burst(x, y),
    meEl: () => meBtn,
    // a scan token landed in the header: the number ticks up and the pill bumps
    meTick: n => {
      const a = meBtn.querySelector('.amt'); if (a && a.firstChild) a.firstChild.nodeValue = fmt(n);
      meBtn.classList.remove('bump'); void meBtn.offsetWidth; meBtn.classList.add('bump');
    }
  });
  const LAUNCH = window.ForksLaunch.mount({ addUp, type, send, scrollDown, toast, esc, burst: (x, y) => field.burst(x, y) });
  // a coin that just landed shows up on every tree that has its repository
  LAUNCH.onCoin(coin => trees.forEach(m => { if (m.tree.nodes.some(x => String(x.repo).toLowerCase() === coin.repo.toLowerCase())) tagCoins(m, new Map([[coin.repo.toLowerCase(), coin]])); }));
  {
    const p = new URLSearchParams(location.search), l = p.get('launch') || p.get('coin');
    if (l !== null) {
      p.delete('launch'); p.delete('coin');
      window.history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash); // (history here is the chat's)
      const repo = LAUNCH.repoOf(l);
      setTimeout(() => send(repo ? `/launch ${repo}` : '/coins'), 300);
    }
  }
  meBtn.addEventListener('click', () => send(C.quest.command));
  QUEST.onChange(({ mode, me, shown }) => {
    const T = C.token.ticker;
    meBtn.hidden = mode === 'loading' || mode === 'down';
    meBtn.innerHTML = me
      ? (me.user.avatar ? `<img src="${esc(me.user.avatar)}" alt="" width="18" height="18">` : `<span class="ini">${esc((me.user.username || '?')[0])}</span>`) + `<span class="amt">${fmt(shown)}<span class="tk"> ${T}</span></span>${mode === 'demo' ? '<span class="demo">demo</span>' : ''}`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg><span class="lbl">sign in</span>${mode === 'demo' ? '<span class="demo">demo</span>' : ''}`;
    meBtn.setAttribute('aria-label', me ? `@${me.user.username}: ${fmt(shown)} ${T} pending` : 'Sign in with X for /freeforks');
  });

  /* ---------- $FORK on the home page: what there is to earn, and where you stand ---------- */
  const XI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>';
  const GHI = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
  // (painted through QUEST.onChange, which fires once before this point: the element is looked up each time)
  const earnEl = () => document.getElementById('earn');
  if (earnEl()) earnEl().addEventListener('click', e => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const d = b.dataset.do;
    if (d === 'github') QUEST.github(); else send(d === 'invite' ? '/invite' : C.quest.command);
  });
  function paintEarn({ mode, me, shown }) {
    const earn = earnEl(); if (!earn) return;
    const T = C.token.ticker, Q = C.quest, demo = mode === 'demo';
    const open = demo || (C.questOpen() && mode !== 'down');
    const core = me ? me.tasks.filter(t => !t.optional) : [], gh = me ? me.tasks.find(t => t.type === 'github') : null;
    const done = core.filter(t => t.completedAt), all = core.length || 6;
    const ghReward = gh ? gh.reward : Q.github, refReward = (me && me.ref && me.ref.reward) || Q.invite;
    const tile = (d, b, t, small, ok, opt) => `<button class="earn-s${ok ? ' ok' : ''}" type="button" data-do="${d}">${opt ? '<span class="opt">optional</span>' : ''}<b>${b}</b><span class="t">${t}</span><small>${small}</small></button>`;
    let top, tiles;
    if (!me) {
      top = `<div><p class="earn-k">${MARK} ${T} <span class="label amber">pending allocation</span>${demo ? ' <span class="label">demo</span>' : ''}</p>
        <div class="earn-big"><span class="pre">up to</span>${fmt(Q.scan[1] + Q.total + ghReward)}<span class="tk">${T}</span></div>
        <p class="earn-sub">${open ? `Sign in with X: upstream reads your account and forks you an allocation. Then six trials, an optional GitHub bonus, and +${fmt(refReward)} for every friend you bring.` : mode === 'down' ? 'The ledger isn’t answering right now. Try again in a minute.' : 'The trials open soon.'}</p></div>
        <div class="earn-cta"><button class="btn primary" type="button" data-do="quest">${XI}Sign in with X</button><small>read-only · we never post for you</small></div>`;
      tiles = tile('quest', `${fmt(Q.scan[0])}–${fmt(Q.scan[1])}`, 'X scan', 'your account, read once at sign-in')
        + tile('quest', `+${fmt(Q.total)}`, `${all} trials`, 'follow, like, retweet, comment, ask, quote')
        + tile('invite', `+${fmt(refReward)}`, 'per friend', 'who signs in and finishes 3 trials')
        + tile('github', `+${fmt(ghReward)}`, 'GitHub', 'connect your account', false, true);
    } else {
      const u = me.user, left = core.filter(t => !t.completedAt).reduce((a, t) => a + t.reward, 0);
      const trialsAmt = done.reduce((a, t) => a + t.reward, 0), R = me.ref || {};
      const cta = me.scan && !me.scanSeen ? ['quest', 'See your X scan'] : done.length < all ? ['quest', done.length ? 'Continue the trials' : 'Start the trials']
        : gh && !gh.completedAt ? ['github', `Connect GitHub · +${fmt(ghReward)}`] : ['invite', `Invite friends · +${fmt(refReward)} each`];
      top = `<div><p class="earn-k"><span class="earn-who">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : `<span class="ini">${esc((u.username || '?')[0])}</span>`}@${esc(u.username)}</span> · your ${T}${demo ? ' <span class="label">demo</span>' : ''}</p>
        <div class="earn-big">${fmt(shown)}<span class="tk">${T}</span></div>
        <p class="earn-sub">Pending, not a balance${me.wallet ? '' : ' · add a Solana wallet in your fork so the airdrop knows where to land'}.</p>
        <div class="earn-prog"><span class="bar"><i style="width:${Math.round(done.length / all * 100)}%"></i></span>${done.length} / ${all} trials</div></div>
        <div class="earn-cta"><button class="btn primary" type="button" data-do="${cta[0]}">${cta[0] === 'github' ? GHI : ''}${cta[1]} →</button><small>${left ? `+${fmt(left)} ${T} left in the trials` : 'all trials done'}</small></div>`;
      tiles = tile('quest', me.scanSeen ? fmt(me.scanTotal || 0) : 'ready', 'X scan', me.scanSeen ? 'read once, counted' : 'tap to see what your X forks into', me.scanSeen)
        + tile('quest', done.length === all ? `+${fmt(trialsAmt)}` : `${done.length} / ${all}`, `${all} trials`, done.length === all ? 'all done' : `+${fmt(left)} left`, done.length === all)
        + tile('invite', R.earned ? `+${fmt(R.earned)}` : `+${fmt(refReward)}`, R.earned ? `${fmt(R.counted)} ${R.counted === 1 ? 'friend' : 'friends'}` : 'per friend', R.invited ? `${fmt(R.invited)} signed in · ${fmt(R.counted)} counted` : 'your link: copy and share')
        + (gh ? tile('github', gh.completedAt ? (me.github && me.github.login ? '@' + esc(me.github.login) : `+${fmt(ghReward)}`) : `+${fmt(ghReward)}`, 'GitHub', gh.completedAt ? `+${fmt(ghReward)} counted` : 'connect your account', !!gh.completedAt, !gh.completedAt) : '');
    }
    earn.classList.toggle('closed', !open);
    earn.innerHTML = `<div class="earn-top">${top}</div><div class="earn-steps${me && !gh ? ' three' : ''}">${tiles}</div>
      <p class="earn-fine"><span class="long">A pending allocation for the people who spread the line — not a balance, not a promise of value. Not financial advice.</span><span class="short">Pending allocation · not a balance · not financial advice</span></p>`;
  }

  QUEST.onChange(paintEarn);

  /* ---------- the showcase: the graph the page opens with ---------- */
  // the showcase grows once a visit; after a reload (back from x, a trial's link) it's simply there
  const SEEN = 'forks-showcase';
  const seenShowcase = () => { try { return sessionStorage.getItem(SEEN) === '1'; } catch (_) { return false; } };
  async function showcase() {
    const S = window.ForksShowcase; if (!S) return;
    const instant = seenShowcase();
    const m = addTrace(); m.li.classList.add('showcase');
    m.li.querySelector('.who .src').textContent = 'showcase';
    let data = {};
    try {
      const j = await fetch('/api/repos?r=' + S.nodes.map(x => x.repo).join(',')).then(r => r.json().then(j => (r.ok ? j : null), () => null));
      if (j && j.repos) data = j.repos;
    } catch (_) { }
    const c = { title: S.title, focus: S.focus, nodes: S.nodes.map(x => ({ ...x, data: data[x.repo] || null })) };
    m.growP = growRepos(m, c, instant);
    const g = await m.growP;
    try { sessionStorage.setItem(SEEN, '1'); } catch (_) { }
    // the tokens go on the tree as soon as it has grown, while the caption types
    const tokP = LAUNCH.tokens(c.nodes.map(x => x.repo)).catch(() => new Map());
    tokP.then(map => tagCoins(m, map));
    await type(m.txt, S.lines, instant);
    renderLine(m, m.tree);
    tokP.then(map => { tagCoins(m, map); priceTree(m).then(sidebar); });
    const pumpTok = C.projectOf(c.nodes[c.focus].repo);
    follow(m, (pumpTok ? [{ label: `trade $${pumpTok.symbol}`, href: '/coin/' + pumpTok.mint }] : []).concat(S.follow));
    return g;
  }

  /* ---------- the sidebar: tokens on this graph, newest coins ---------- */
  function sidebar() {
    const st = $('#sideTokens'); if (!st) return;
    const S = window.ForksShowcase, seen = new Set(), rows = [];
    S.nodes.forEach(x => { const p = C.projectOf(x.repo); if (p && !seen.has(p.mint)) { seen.add(p.mint); rows.push({ ...p, repo: x.repo }); } });
    st.innerHTML = rows.map(t => { const mk = prices[t.mint]; return `<a class="trow" href="/coin/${esc(t.mint)}"><span class="trow-i">${SH.logo(logos[t.mint] || (mk && mk.image), t.symbol)}</span><span class="trow-n"><span class="trow-s" style="color:var(--link)">$${esc(t.symbol)}</span><span class="trow-r">${esc(t.repo)}</span></span><span class="trow-p">${mk && mk.price != null ? usd(mk.price) : '—'}${mk && mk.change24 != null ? `<span class="${mk.change24 >= 0 ? 'up' : 'dn'}">${pct(mk.change24)}</span>` : ''}</span></a>`; }).join('');
  }
  SH.market().then(j => {
    // the project tokens' prices come with the market: fill the sidebar now, not after the graph has finished typing
    if (j && j.projects) { j.projects.forEach(p => { if (p.image) logos[p.mint] = p.image; if (p.market && !(p.mint in prices)) prices[p.mint] = p.market; }); if (window.ForksShowcase) sidebar(); }
    const sc = $('#sideCoins'); if (!sc) return;
    const list = j && j.coins ? j.coins.slice(0, 5) : [];
    sc.innerHTML = list.length
      ? list.map(t => `<a class="trow" href="/coin/${esc(t.mint)}"><span class="trow-i">${SH.logo(t.image, t.symbol)}</span><span class="trow-n"><span class="trow-s" style="color:var(--warn)">$${esc(t.symbol)}</span><span class="trow-r">${esc(t.repo)}</span></span><span class="trow-p">${t.market && t.market.mcap ? usd(t.market.mcap) : ''}${t.curve && t.curve.progress != null ? `<span class="muted">${Math.round(t.curve.progress)}% curve</span>` : ''}</span></a>`).join('') + '<p style="margin:8px 0 0;font-size:13px"><a href="/market">All coins in the market →</a></p>'
      : '<p class="muted" style="font-size:13px;margin:0">No coins yet. <a href="/launch">Launch the first one →</a></p>';
  });

  // ?q=… traces, ?run=freeforks|invite|info|coins runs a command (links from the other pages)
  {
    const p = new URLSearchParams(location.search), qq = p.get('q'), run = p.get('run');
    if (qq || run) { p.delete('q'); p.delete('run'); window.history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash); }
    const after = showcase();
    if (qq) after.then(() => send(qq));
    else if (run && /^(freeforks|invite|github|info|coins|help)$/.test(run)) after.then(() => send('/' + run));
  }
  $('#invBtn').addEventListener('click', () => send('/invite'));
  window.ForksApp = { send, reset, field, toast };
})();
