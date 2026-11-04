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

  /* ---------- theme ---------- */
  try { const t = localStorage.getItem('forks-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (_) { }
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('forks-theme', next); } catch (_) { }
  });

  /* ---------- field ---------- */
  const field = new window.ForksField($('#field'));
  const formRect = () => $('#ask').getBoundingClientRect();
  addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, input, .card, .msg, form, .full, .top, .chips, .toast, .point')) return;
    field.tap(e.clientX, e.clientY);
  });

  /* ---------- hero ---------- */
  const Q = ['where', 'did', 'it', '<em>come</em>', '<em>from?</em>'];
  $('#q').innerHTML = Q.map((w, i) => `<span class="w" style="animation-delay:${200 + i * 110}ms">${w}</span>`).join(' ');
  // six starters, fresh on every visit
  const STARTS = [
    ['who forked bitcoin?', 'what did bitcoin/bitcoin become?'],
    ['the bloodline of llama.cpp', 'where did llama.cpp come from?'],
    ['neovim, from the root', 'where did neovim come from?'],
    ['what is ollama built on?', 'where did ollama come from?'],
    ['the family tree of doge', 'where did dogecoin come from?'],
    ['who came before bun?', 'where did bun come from?'],
    ['everything vscode forked into', 'what did microsoft/vscode become?'],
    ['where did zed come from?', 'where did zed come from?'],
    ['the ancestors of tailwind', 'where did tailwindcss come from?'],
    ['what did stable diffusion become?', 'what did stable diffusion become?'],
    ['how linux forked', 'what did torvalds/linux become?'],
    ['the roots of solana', 'where did solana come from?']
  ];
  const starts = STARTS.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, 6).map(x => x[1]);
  $('#chips').innerHTML = starts.map(([label, q]) => `<button class="chip" type="button" data-q="${esc(q)}">${esc(label)}</button>`).join('');
  $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) send(b.dataset.q); });
  $('#fine').textContent = 'every point is a public github repository · traced live by upstream';

  /* ---------- input ---------- */
  const inp = $('#inp'), sendBtn = $('#sendBtn'), form = $('#ask');
  $('#askSlot').appendChild(form);
  const SMALL = () => innerWidth < 640;
  const PH = [SMALL() ? 'type anything' : 'type anything — a word, a project, a repo', 'llama.cpp', 'bitcoin', 'github.com/neovim/neovim', 'doge', 'why is everything a fork of chromium?'];
  let phI = 0; inp.placeholder = PH[0];
  setInterval(() => { if (!inp.value && document.activeElement !== inp && !document.body.classList.contains('chat')) { phI = (phI + 1) % PH.length; inp.placeholder = PH[phI]; } }, 3200);
  const listen = () => { field.setFocus(formRect()); field.setMode(busy ? 'thinking' : (inp.value || document.activeElement === inp ? 'listening' : 'idle')); };
  inp.addEventListener('input', () => { sendBtn.disabled = !inp.value.trim(); listen(); });
  inp.addEventListener('focus', listen); inp.addEventListener('blur', listen);
  form.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (v) send(v); });
  addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== inp && !e.metaKey && !e.ctrlKey) { e.preventDefault(); inp.focus(); inp.value = '/'; sendBtn.disabled = false; }
    if (e.key === 'Escape') { if (!$('#full').hidden) closeFull(); else if (busy && ctl) ctl.abort(); }
  });

  /* ---------- modes ---------- */
  const thread = $('#thread');
  let history = [], busy = false, ctl = null, queued = null;
  function toChat() {
    if (document.body.classList.contains('chat')) return;
    document.body.classList.add('chat');
    $('#dock').appendChild(form);
    field.setDim(SMALL() ? .9 : .8); inp.placeholder = SMALL() ? 'trace something else' : 'trace something else — a word, a project, a repo';
  }
  function reset() {
    if (ctl) ctl.abort();
    thread.innerHTML = ''; history = []; busy = false;
    document.body.classList.remove('chat');
    $('#askSlot').appendChild(form);
    field.setDim(0); field.setMode('idle'); inp.placeholder = PH[0];
    inp.value = ''; sendBtn.disabled = true; inp.focus();
  }
  $('#home').addEventListener('click', e => { e.preventDefault(); reset(); });
  $('#newBtn').addEventListener('click', reset);

  /* ---------- messages ---------- */
  function addYou(text) {
    const li = document.createElement('li'); li.className = 'msg you'; li.textContent = text;
    thread.appendChild(li); scrollDown();
  }
  function addUp() {
    const li = document.createElement('li'); li.className = 'msg up';
    li.innerHTML = `<div class="av">${MARK}</div><div class="body"><div class="who">upstream<span class="src" hidden></span></div><div class="txt"><span class="thinking"><i></i><i></i><i></i> tracing</span></div><div class="cards"></div></div>`;
    thread.appendChild(li); scrollDown();
    return { li, txt: li.querySelector('.txt'), cards: li.querySelector('.cards'), src: li.querySelector('.src'), body: li.querySelector('.body') };
  }
  function scrollDown() { requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: RM.matches ? 'auto' : 'smooth' })); }
  function type(el, text) {
    return new Promise(res => {
      if (RM.matches) { el.textContent = text; return res(); }
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
    d.innerHTML = list.slice(0, 4).map(f => `<button class="chip" type="button">${esc(f)}</button>`).join('');
    d.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) send(b.textContent); });
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
    li.innerHTML = '<div class="stage-host"></div><div class="result"><div class="r-head" hidden></div><div class="r-sub" hidden></div><div class="txt"></div><div class="cards"></div></div>';
    thread.appendChild(li);
    const m = { li, txt: li.querySelector('.txt'), cards: li.querySelector('.cards'), body: li.querySelector('.result'), head: li.querySelector('.r-head'), sub: li.querySelector('.r-sub') };
    m.stage = window.ForksStage.create(li.querySelector('.stage-host'), {
      onPick: (id, rect) => m.pick && m.pick(id, rect),
      onFull: () => m.full && m.full(),
      onPoint: (x, y, last) => { if (last) { if (!SMALL()) field.light(Math.max(40, x - 40), y); field.burst(x, y); } }
    });
    scrollDown();
    return m;
  }
  function growRepos(m, c) {
    m.tree = c;
    m.pick = (id, rect) => pointRepo(c, Number(id), rect);
    m.full = () => showFull(c.title.toLowerCase(), `${c.nodes.length} repositories · origin ${c.nodes[0].repo}${c.nodes[0].data ? ', ' + B.year(c.nodes[0].data.created) : ''} · traced to ${c.nodes[c.focus].repo}`, repoTree(c, 'full'), (id, rect) => pointRepo(c, Number(id), rect), '<span><i class="p"></i>the traced line</span><span>tap any repository for github</span>');
    return m.stage.grow({
      root: '0', focus: String(c.focus),
      nodes: c.nodes.map((x, i) => ({ id: String(i), name: x.repo, when: x.data ? B.year(x.data.created) : '', meta: nodeMeta(x), parent: x.parent == null ? null : String(x.parent), size: x.data ? Math.min(1, Math.log10(x.data.stars + 1) / 5.2) : null }))
    }).then(r => {
      const root = c.nodes[0], focus = c.nodes[c.focus];
      m.head.hidden = false; m.head.textContent = focus.repo;
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
      return `<a class="rp${onPath.has(i) ? ' main' : ''}${i === c.focus ? ' focus' : ''}" href="${esc(d ? d.url : 'https://github.com/' + x.repo)}" target="_blank" rel="noopener">` +
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
    if (busy) { queued = raw; inp.value = ''; sendBtn.disabled = true; return; } // goes out as soon as this answer lands
    const r = B.route(raw);
    if (r.clear) { reset(); return; }
    toChat(); inp.value = ''; sendBtn.disabled = true; addYou(raw);
    busy = true; field.setFocus(formRect()); field.setMode('thinking');
    try {
      if (r.quest) { await QUEST.run(r.quest); return; } // /freeforks and /logout run in the page, never through the model
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
        const t = String(note || text || streamed || '').trim();
        if (t) await type(m.txt, t);
        renderLine(m, m.tree);
        const root = g.root.name, focus = g.focus.name;
        follow(m, [g.forks ? `where did ${root} come from?` : `what did ${focus} become?`, g.forks ? `what did ${focus} become?` : `where did ${focus} come from?`]);
        history.push({ role: 'assistant', content: t || `${focus}: ${g.forks} forks from ${root}` });
        return;
      }
      m.stage.remove();
      const why = err && err.code === 'rate_limited' ? 'too many traces at once. give it a minute.' : err && err.code === 'not_granted' ? 'the model is switched off for this page.' : 'couldn’t reach a model or github just now. try again in a minute.';
      await type(m.txt, why);
      history.push({ role: 'assistant', content: why });
    } finally {
      busy = false; ctl = null; field.setMode('idle'); scrollDown();
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
    openPoint({
      name: x.repo,
      meta: d ? [`★ ${fmt(d.stars)}`, d.lang, `since ${B.year(d.created)}`, d.archived ? 'archived' : '', d.fork && d.fork !== '?' ? `github fork of ${d.fork}` : ''].filter(Boolean).join(' · ') : '',
      how, desc: d ? d.desc : '', links,
      acts: [['trace from here', () => send(`where did ${x.repo} come from?`)], ['what did it become?', () => send(`what did ${x.repo} become?`)]]
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
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('out');
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.hidden = true; }, 300); }, 3200);
  }

  /* ---------- $FORK: /freeforks ---------- */
  const C = window.FORKS_CONFIG;
  const QUEST = window.ForksQuest.mount({ addUp, type, send, scrollDown, toast, esc, burst: (x, y) => field.burst(x, y) });
  $('#questBtn').addEventListener('click', () => send(C.quest.command));
  $('#meBtn').addEventListener('click', () => send(C.quest.command));
  QUEST.onChange(({ mode, me }) => {
    const qb = $('#questBtn'), mb = $('#meBtn');
    const done = me ? me.tasks.filter(t => t.completedAt).length : 0, all = me ? me.tasks.length : 4;
    qb.innerHTML = !me || !done ? `get <b>+${fmt(C.quest.total)}</b> ${C.token.ticker}`
      : done < all ? `<b>${fmt(me.allocation)}</b> ${C.token.ticker} pending · finish the trials`
      : `<b>${fmt(me.allocation)}</b> ${C.token.ticker} pending${me.wallet ? '' : ' · add a wallet'}`;
    qb.classList.toggle('has', !!(me && done));
    mb.hidden = mode === 'loading' || mode === 'down';
    mb.innerHTML = me
      ? (me.user.avatar ? `<img src="${esc(me.user.avatar)}" alt="" width="18" height="18">` : `<span class="ini">${esc((me.user.username || '?')[0])}</span>`) + `<span class="amt">${fmt(me.allocation)}<span class="tk"> ${C.token.ticker}</span></span>${mode === 'demo' ? '<span class="demo">demo</span>' : ''}`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg><span class="lbl">sign in</span>${mode === 'demo' ? '<span class="demo">demo</span>' : ''}`;
    mb.setAttribute('aria-label', me ? `@${me.user.username}: ${fmt(me.allocation)} ${C.token.ticker} pending` : 'Sign in with X for /freeforks');
  });

  setTimeout(() => { if (matchMedia('(pointer: fine)').matches) inp.focus({ preventScroll: true }); }, 900);
  window.ForksApp = { send, reset, field, toast };
})();
