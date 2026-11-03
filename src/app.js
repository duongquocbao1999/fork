/* forks — the conversation. */
(function () {
  'use strict';
  const A = window.FORKS_ARCHIVE, B = window.ForksBrain, H = B.H;
  const $ = s => document.querySelector(s);
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  // starters: half answered from the sourced archive, half traced live — a fresh six on every visit
  const ARCHIVE_STARTS = [
    ['dogecoin’s bloodline', 'where did dogecoin come from?'],
    ['who forked kekius maximus?', 'where did kekius maximus come from?'],
    ['tung tung tung sahur, from the root', 'where did tung tung tung sahur come from?'],
    ['everything chill guy forked into', 'what did chill guy become?'],
    ['the upstream of $JEANPHIL', 'where did $JEANPHIL come from?'],
    ['how nafo got its doge', 'where did nafo fellas come from?']
  ];
  const LIVE_STARTS = [
    ['where did “gm” come from?', 'where did gm come from?'],
    ['trace “touch grass”', 'where did touch grass come from?'],
    ['what is “wagmi” a fork of?', 'where did wagmi come from?'],
    ['the family tree of “rizz”', 'where did rizz come from?'],
    ['who started the “ratio”?', 'where did ratio come from?'],
    ['how “skibidi” forked', 'where did skibidi come from?'],
    ['the ancestors of “based”', 'where did based come from?'],
    ['what came before the rickroll?', 'where did the rickroll come from?']
  ];
  const pickN = (list, n) => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
  const starts = pickN(pickN(ARCHIVE_STARTS, 3).concat(pickN(LIVE_STARTS, 3)), 6);
  $('#chips').innerHTML = starts.map(([label, q]) => `<button class="chip" type="button" data-q="${esc(q)}">${esc(label)}</button>`).join('');
  $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) send(b.dataset.q); });
  $('#fine').textContent = 'archive lines are hand-sourced · everything else is traced live by upstream';

  /* ---------- input ---------- */
  const inp = $('#inp'), sendBtn = $('#sendBtn'), form = $('#ask');
  $('#askSlot').appendChild(form);
  const SMALL = () => innerWidth < 640;
  const PH = [SMALL() ? 'type anything' : 'type anything — a word, a meme, a ticker', 'gm', 'touch grass', '$CHILLGUY', 'it’s giving', 'why does everyone say 67?'];
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
    field.setDim(SMALL() ? .9 : .8); inp.placeholder = SMALL() ? 'ask a follow-up' : 'ask a follow-up, or paste something new';
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
  $('#archBtn').addEventListener('click', () => send('/archive'));

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
  function lightUp(m) {
    const r = m.li.getBoundingClientRect();
    if (!SMALL()) field.light(Math.max(40, r.left - 30), Math.min(innerHeight - 60, Math.max(80, r.top + 24)));
    field.burst(r.left + 12, r.top + 14);
  }

  /* ---------- trace messages: a stage on top, the result under it ---------- */
  const wait = ms => new Promise(r => setTimeout(r, RM.matches ? 0 : ms));
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
  function result(m, r, sourced) {
    m.head.hidden = false; m.head.textContent = r.focus.name;
    m.sub.hidden = false;
    const when = n => (n.when ? ` · ${esc(n.when)}` : '');
    m.sub.innerHTML = (r.forks ? `${r.forks} fork${r.forks > 1 ? 's' : ''} from <b>${esc(r.root.name)}</b>${when(r.root)}` : `the origin${when(r.focus)}`) + (sourced ? ' · <span class="sourced">sourced</span>' : '') + ' · <span class="hint">tap any point for links</span>';
    scrollDown();
    return r;
  }
  function growArchive(m, rootId, focusId) {
    const ids = [rootId].concat(H.subtree(rootId).map(n => n.id));
    m.pick = (id, rect) => pointArchive(id, rect);
    m.full = () => openFull(rootId, focusId);
    m.sourced = focusId;
    return m.stage.grow({
      root: rootId, focus: focusId,
      nodes: ids.map(id => { const n = H.node(id); return { id, name: n.name, when: H.when(n), meta: `${n.type.toLowerCase()} · ${H.when(n)}`, parent: id === rootId ? null : n.parent, rel: n.relation }; })
    }).then(r => result(m, r, true));
  }
  function growTraced(m, c) {
    m.pick = (id, rect) => pointTraced(c, id, rect);
    m.full = () => showFull(c.title.toLowerCase(), `${c.nodes.length} objects · origin ${c.nodes[0].name.toLowerCase()}${c.nodes[0].when ? ', ' + c.nodes[0].when : ''} · traced to ${c.nodes[c.focus].name.toLowerCase()}`, tracedTree(c, 'full'), pickTraced(c), '<span><i class="p"></i>the traced line</span><span>tap any node to trace it</span>');
    return m.stage.grow({
      root: '0', focus: String(c.focus),
      nodes: c.nodes.map((x, i) => ({ id: String(i), name: x.name, when: x.when, meta: [x.when, x.note].filter(Boolean).join(' · '), parent: x.parent == null ? null : String(x.parent) }))
    }).then(r => result(m, r, false));
  }

  /* ---------- send ---------- */
  async function send(raw) {
    raw = String(raw || '').trim(); if (!raw) return;
    if (busy) { queued = raw; inp.value = ''; sendBtn.disabled = true; return; } // goes out as soon as this answer lands
    const ans = B.archiveAnswer(raw, { strict: true }); // the archive answers alone only when you name one of its objects
    if (ans.clear) { reset(); return; }
    if (ans.quest) { // /freeforks and /logout run in the page, never through the model
      toChat(); inp.value = ''; sendBtn.disabled = true; addYou(raw);
      busy = true; field.setMode('thinking');
      try { await QUEST.run(ans.quest); } finally {
        busy = false; field.setMode('idle'); scrollDown();
        if (queued) { const q = queued; queued = null; setTimeout(() => send(q), 0); }
      }
      return;
    }
    toChat(); inp.value = ''; sendBtn.disabled = true;
    addYou(raw);
    history.push({ role: 'user', content: raw });
    busy = true; field.setFocus(formRect()); field.setMode('thinking');
    const say = async (m, text, cards, more) => {
      await type(m.txt, text);
      (cards || []).forEach(c => renderCard(m, c));
      follow(m, more);
      history.push({ role: 'assistant', content: text });
    };
    try {
      const tree = ans.confident && ans.cards && ans.cards[0] && ans.cards[0].type === 'lineage';
      if (ans.confident && !tree) { // who are you, /help, /hot, /archive, what changed, sources
        const m = addUp(); await wait(420);
        await say(m, ans.text, ans.cards, ans.follow);
        return;
      }
      const m = addTrace();
      if (tree) {
        await wait(900);
        await growArchive(m, ans.cards[0].root, ans.cards[0].focus);
        await say(m, ans.text, ans.cards.slice(1), ans.follow);
        return;
      }

      // anything else: upstream traces it
      await B.AI.ready;
      let note = '';
      if (B.AI.kind) {
        ctl = new AbortController();
        const acts = m.stage.el.querySelector('.st-acts');
        acts.innerHTML = '<button type="button">stop</button>'; acts.querySelector('button').onclick = () => ctl && ctl.abort();
        let streamed = '';
        const ui = {
          card: c => {
            if ((c.type === 'lineage' || c.type === 'traced') && !m.growP) m.growP = c.type === 'lineage' ? growArchive(m, c.root, c.focus) : growTraced(m, c);
            else { renderCard(m, c); scrollDown(); }
          },
          light: () => {},
          stream: t => { streamed = t; }
        };
        let text = '', err = null;
        try { text = await B.modelAnswer(history.slice(-10), ui, ctl.signal); } catch (e) { err = e; }
        if (m.growP) {
          const r = await m.growP;
          const t = String(text || streamed || '').trim();
          if (t) await type(m.txt, t);
          follow(m, m.sourced ? [`what did ${r.root.name} become?`, `/sources ${m.sourced}`] : [`where did ${r.root.name} come from?`, `what did ${r.focus.name} become?`]);
          history.push({ role: 'assistant', content: t || `${r.focus.name}: ${r.forks} forks from ${r.root.name}` });
          return;
        }
        if (err && (err.code === 'cancelled' || (ctl && ctl.signal.aborted))) { m.stage.remove(); await say(m, String((err && err.text) || streamed || '').trim() || 'stopped.'); return; }
        note = err && err.code === 'not_granted' ? 'the model is switched off for this page.\n' : err && err.code === 'rate_limited' ? 'too many traces at once. give it a minute.\n' : '';
      }
      // no model, or no tree came back: the archive's closest line, if it has one
      const loose = B.archiveAnswer(raw, { strict: false });
      if (loose.confident && loose.cards && loose.cards[0] && loose.cards[0].type === 'lineage') {
        await growArchive(m, loose.cards[0].root, loose.cards[0].focus);
        await say(m, note + loose.text, loose.cards.slice(1), loose.follow);
        return;
      }
      m.stage.remove();
      const nf = B.R.notFound(loose.q || ans.q, loose.near || ans.near || []);
      await say(m, note + nf.text, [], nf.follow);
    } finally {
      busy = false; ctl = null; field.setMode('idle'); scrollDown();
      if (queued) { const q = queued; queued = null; setTimeout(() => send(q), 0); }
      if (matchMedia('(pointer: fine)').matches) inp.focus();
    }
  }

  /* ---------- trees ---------- */
  // layout: x by generation, y by leaf order
  function layout(nodes, rootId, kids) {
    let leaf = 0; const pos = new Map(); let maxD = 0;
    const place = (id, d) => {
      maxD = Math.max(maxD, d); const ks = kids(id); let y;
      if (!ks.length) y = leaf++; else { const ys = ks.map(k => place(k, d + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(id, { d, y }); return y;
    };
    place(rootId, 0); return { pos, leaves: leaf, maxD };
  }
  function treeSVG(o) {
    // o: { ids, root, kids(id), get(id) -> {name, meta, relation}, path:Set, sub:Set, focus, colW, rowH, chars, grow }
    const L = layout(o.ids, o.root, o.kids), colW = o.colW, rowH = o.rowH, pad = 14;
    const rg = o.get(o.root), rootW = Math.max(Math.min(rg.name.length, o.chars) * (o.full ? 7.6 : 6.7), (rg.meta || '').length * (o.full ? 6.4 : 5.8)) + 16;
    const W = rootW + L.maxD * colW + Math.max(colW, o.chars * 7) + 20, Hh = Math.max(1, L.leaves) * rowH + pad * 2 + 18;
    const X = d => rootW + d * colW, Y = y => pad + 18 + y * rowH + rowH / 2;
    let edges = '', nodes = '';
    for (const [id, p] of L.pos) {
      for (const k of o.kids(id)) {
        const c = L.pos.get(k), x0 = X(p.d), y0 = Y(p.y), x1 = X(c.d), y1 = Y(c.y), dx = x1 - x0;
        const g = o.get(k), cls = o.path.has(k) && o.path.has(id) ? 'path' : (o.sub.has(k) ? 'sub' : '');
        edges += `<path class="e ${cls} ${g.relation || ''}${o.grow ? ' grow' : ''}" style="animation-delay:${c.d * 140}ms" d="M${x0} ${y0}C${x0 + dx * .6} ${y0} ${x0 + dx * .4} ${y1} ${x1} ${y1}"/>`;
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
  function archiveTree(rootId, focusId, size) {
    const root = H.node(rootId), sub = H.subtree(rootId), ids = [root].concat(sub).map(n => n.id);
    const path = new Set(H.ancestors(focusId).map(n => n.id).concat(focusId));
    const fsub = new Set(H.subtree(focusId).map(n => n.id));
    const full = size === 'full', small = innerWidth < 640;
    return treeSVG({
      ids, root: rootId, kids: id => H.node(id).children, focus: focusId, path, sub: fsub, full,
      get: id => { const n = H.node(id); return { name: n.name, meta: `${n.type.toLowerCase()} · ${H.when(n)}`, relation: n.relation }; },
      colW: full ? 250 : small ? 116 : 138, rowH: full ? 40 : 28, chars: full ? 30 : small ? 15 : 19, grow: !full, label: `lineage of ${root.name}`
    });
  }
  function bindTree(el, pick) {
    const at = g => (g.querySelector('circle:not(.ring)') || g).getBoundingClientRect();
    el.addEventListener('click', e => { const g = e.target.closest('.n'); if (g) pick(g.dataset.id, at(g)); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('.n'); if (g) { e.preventDefault(); pick(g.dataset.id, at(g)); } } });
  }

  /* ---------- a point's card: what it is, where to read about it, where to go next ---------- */
  const enc = encodeURIComponent;
  const plain = s => String(s || '').replace(/["“”«»]/g, '').trim();
  const SEARCH = [
    ['search on x', q => `https://x.com/search?q=${enc(q)}&f=top`],
    ['know your meme', q => `https://knowyourmeme.com/search?q=${enc(q)}`],
    ['wikipedia', q => `https://en.wikipedia.org/w/index.php?title=Special:Search&go=Go&search=${enc(q)}`],
    ['google', q => `https://www.google.com/search?q=${enc(q)}`]
  ];
  const searchLinks = (q, name) => {
    const tk = (String(name).match(/\$[A-Za-z][A-Za-z0-9]{1,14}/) || [])[0];
    return (tk ? [['dexscreener · ' + tk, `https://dexscreener.com/search?q=${enc(tk.slice(1))}`]] : []).concat(SEARCH.map(([l, f]) => [l, f(q)]));
  };
  const point = $('#point');
  function openPoint(o, rect) {
    point.innerHTML = `<div class="pt-h"><div class="pt-name">${esc(o.name)}</div>${o.meta ? `<div class="pt-meta">${esc(o.meta)}</div>` : ''}</div>` +
      (o.desc ? `<p class="pt-desc">${esc(o.desc)}</p>` : '') +
      `<div class="pt-k">${o.sourced ? 'sources' : 'find it'}</div><ul class="pt-links">${o.links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>` +
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

  function pointArchive(id, rect) {
    const n = H.node(id);
    openPoint({
      name: n.name, meta: `${n.type.toLowerCase()} · ${H.when(n)} · ${n.plat.toLowerCase()}`, desc: n.desc, sourced: true,
      links: n.sources.map(([t, u]) => [t, u]).concat([['search on x', `https://x.com/search?q=${enc(n.name)}&f=top`]]),
      acts: [['trace from here', () => send(`/trace ${id}`)], ['what did it become?', () => send(`/became ${id}`)]]
    }, rect);
  }
  function pointTraced(c, i, rect) {
    const x = c.nodes[Number(i)], name = plain(x.name);
    openPoint({
      name: x.name, meta: [x.when, x.note].filter(Boolean).join(' · '),
      links: searchLinks(x.q || name, x.name),
      acts: [['trace from here', () => send(`where did ${name} come from?`)], ['what did it become?', () => send(`what did ${name} become?`)]]
    }, rect);
  }
  const pickArchive = (id, rect) => pointArchive(id, rect);
  // a tree upstream traced itself: nodes [{name, parent, when, note}], focus = the thing asked about
  function tracedTree(c, size) {
    const full = size === 'full', small = innerWidth < 640;
    const kids = id => c.nodes.map((x, j) => j).filter(j => j > 0 && c.nodes[j].parent === Number(id)).map(String);
    const path = new Set(), sub = new Set();
    for (let i = c.focus; i != null; i = c.nodes[i].parent) path.add(String(i));
    const walk = i => kids(i).forEach(k => { sub.add(k); walk(k); }); walk(c.focus);
    return treeSVG({
      ids: c.nodes.map((x, i) => String(i)), root: '0', kids, focus: String(c.focus), path, sub, full,
      get: id => { const x = c.nodes[Number(id)]; return { name: x.name, meta: [x.when, x.note].filter(Boolean).join(' · ') }; },
      colW: full ? 250 : small ? 116 : 138, rowH: full ? 40 : 30, chars: full ? 30 : small ? 15 : 19, grow: !full, label: `lineage of ${c.title}`
    });
  }
  const pickTraced = c => (id, rect) => pointTraced(c, id, rect);

  /* ---------- cards ---------- */
  function renderCard(m, c) {
    const el = document.createElement('div'); el.className = 'card';
    if (c.type === 'lineage') {
      const n = H.node(c.focus), root = H.node(c.root);
      el.innerHTML = `<div class="card-h"><span>// lineage · <b>${esc(root.name.toLowerCase())}</b> · ${H.subtree(root.id).length + 1} objects</span><span class="acts"><button type="button" data-a="full">open ↗</button><button type="button" data-a="src">sources</button></span></div>
        <div class="tree-wrap">${archiveTree(c.root, c.focus)}</div>
        <div class="legend"><span><i class="p"></i>line to ${esc(n.name.toLowerCase())}</span><span><i></i>verified</span><span><i class="l"></i>likely</span><span><i class="d"></i>disputed</span></div>`;
      bindTree(el.querySelector('.tree-wrap'), pickArchive);
      el.querySelector('[data-a="full"]').onclick = () => openFull(c.root, c.focus);
      el.querySelector('[data-a="src"]').onclick = () => send(`/sources ${c.focus}`);
      requestAnimationFrame(() => { const w = el.querySelector('.tree-wrap'), f = w.querySelector('.n.focus'); if (f && w.scrollWidth > w.clientWidth) { const bb = f.getBBox(); if (bb.x + 90 > w.clientWidth) w.scrollLeft = Math.max(0, bb.x - w.clientWidth * .55); } });
    } else if (c.type === 'mutation') {
      const a = H.node(c.a), b = H.node(c.b);
      el.innerHTML = `<div class="card-h"><span>// what changed · <b>${H.ancestors(b.id).filter(x => x.depth >= a.depth).length} generation${H.ancestors(b.id).filter(x => x.depth >= a.depth).length > 1 ? 's' : ''}</b></span></div>
        <div class="card-b"><div class="mut-h"><span>trait</span><span>then</span><span></span><span>now</span></div>
        <div class="mut-h" style="font:400 11px var(--mono);color:var(--ink-3);padding-bottom:4px"><span></span><span>${esc(a.name)}</span><span></span><span>${esc(b.name)}</span></div>
        <div class="mut">${A.traits.map(([k, l]) => { const ch = a.traits[k] !== b.traits[k]; return `<span class="k ${ch ? 'ch' : ''}">${esc(l.toLowerCase())}</span><span class="then">${esc(a.traits[k] || '—')}</span><span class="arr ${ch ? 'ch' : ''}">${ch ? '→' : '='}</span><span class="now ${ch ? 'ch' : ''}">${esc(b.traits[k] || '—')}</span>`; }).join('')}</div></div>`;
    } else if (c.type === 'sources') {
      const n = H.node(c.id), line = H.ancestors(n.id).concat(n);
      const srcs = [...new Map(line.flatMap(x => x.sources).map(s => [s[1], s])).values()];
      el.innerHTML = `<div class="card-h"><span>// sources · <b>${esc(n.name.toLowerCase())}</b> and its line</span></div><div class="card-b"><ul class="srcs">${srcs.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul></div>`;
    } else if (c.type === 'hot') {
      el.innerHTML = `<div class="card-h"><span>// forking now · <b>last 30 days</b></span></div><div class="card-b"><div class="rows">${H.hot().slice(0, 6).map(n => `<button class="row" type="button" data-q="where did ${esc(n.name)} come from?"><span><span class="rn">${esc(n.name)}</span><span class="rm">${esc(H.famName(n.family).toLowerCase())} · ${n.type.toLowerCase()} · ${H.when(n)}</span></span><span class="rv">+${n.forks30} fork${n.forks30 === 1 ? '' : 's'}</span></button>`).join('')}</div></div>`;
      el.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
    } else if (c.type === 'archive') {
      el.innerHTML = `<div class="card-h"><span>// the archive · <b>${H.count.roots} origins</b></span></div><div class="card-b"><div class="rows">${H.roots().map(n => `<button class="row" type="button" data-q="what did ${esc(n.name)} become?"><span><span class="rn">${esc(n.name)}</span><span class="rm">${esc(H.famName(n.family).toLowerCase())} · ${H.when(n)} · ${n.depthBelow} generations</span></span><span class="rv">${n.descendants} forks</span></button>`).join('')}</div></div>`;
      el.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
    } else if (c.type === 'traced') {
      const q = c.nodes[c.focus];
      el.innerHTML = `<div class="card-h"><span>// lineage · <b>${esc(c.title.toLowerCase())}</b> · ${c.nodes.length} objects</span><span class="acts"><button type="button" data-a="full">open ↗</button></span></div>
        <div class="tree-wrap">${tracedTree(c)}</div>
        <div class="legend"><span><i class="p"></i>line to ${esc(q.name.toLowerCase())}</span><span>tap any node to trace it</span></div>`;
      bindTree(el.querySelector('.tree-wrap'), pickTraced(c));
      el.querySelector('[data-a="full"]').onclick = () => showFull(c.title.toLowerCase(), `${c.nodes.length} objects · origin ${c.nodes[0].name.toLowerCase()}${c.nodes[0].when ? ', ' + c.nodes[0].when : ''} · traced to ${q.name.toLowerCase()}`, tracedTree(c, 'full'), pickTraced(c), `<span><i class="p"></i>the traced line</span><span>tap any node to trace it</span>`);
      requestAnimationFrame(() => { const w = el.querySelector('.tree-wrap'), f = w.querySelector('.n.focus'); if (f && w.scrollWidth > w.clientWidth) { const bb = f.getBBox(); if (bb.x + 90 > w.clientWidth) w.scrollLeft = Math.max(0, bb.x - w.clientWidth * .55); } });
    }
    m.cards.appendChild(el);
  }

  /* ---------- full view ---------- */
  const ARCHIVE_LEGEND = `<span><i class="p"></i>the traced line</span><span><i></i>verified</span><span><i class="l"></i>likely</span><span><i class="d"></i>disputed</span><span>tap any node to ask about it</span>`;
  let fullPick = pickArchive;
  function showFull(title, sub, svg, pick, legend) {
    $('#fullTitle').textContent = title; $('#fullSub').textContent = sub; $('#fullB').innerHTML = svg; $('#fullLegend').innerHTML = legend;
    fullPick = pick; $('#full').hidden = false; $('#fullX').focus();
  }
  function openFull(rootId, focusId) {
    const root = H.node(rootId), n = H.node(focusId);
    showFull(root.name.toLowerCase(), `${H.subtree(rootId).length + 1} objects · ${root.depthBelow} generations · origin ${H.when(root)} · traced to ${n.name.toLowerCase()}`, archiveTree(rootId, focusId, 'full'), pickArchive, ARCHIVE_LEGEND);
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
  const C = window.FORKS_CONFIG, fmt = n => Number(n || 0).toLocaleString('en-US');
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
