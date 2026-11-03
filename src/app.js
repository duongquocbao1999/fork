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
    if (e.target.closest('button, a, input, .card, .msg, form, .full, .top, .chips, .now, .toast')) return;
    field.tap(e.clientX, e.clientY);
  });

  /* ---------- hero ---------- */
  const Q = ['where', 'did', 'it', '<em>come</em>', '<em>from?</em>'];
  $('#q').innerHTML = Q.map((w, i) => `<span class="w" style="animation-delay:${200 + i * 110}ms">${w}</span>`).join(' ');
  $('#eyebrow').innerHTML = `upstream · traces anything · <b>${H.count.nodes}</b> sourced objects · <b>${H.count.roots}</b> origins`;
  const CHIPS = ['where did doge come from?', 'what did chill guy become?', 'trace $JEANPHIL', 'who is jean philanthrope?', 'what is forking right now?', 'surprise me'];
  $('#chips').innerHTML = CHIPS.map(c => `<button class="chip" type="button">${esc(c)}</button>`).join('');
  $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) send(b.textContent); });
  const hot = H.hot().slice(0, 3);
  $('#now').innerHTML = 'forking now · ' + hot.map(n => `<button type="button" data-q="where did ${esc(n.name)} come from?">${esc(n.name.toLowerCase())}</button> <span class="plus">+${n.forks30}</span>`).join(' · ');
  $('#now').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
  const fineBase = `archive lines are hand-sourced · everything else is traced live by upstream · updated ${A.updated.split('-').reverse().join('.')}`;
  $('#fine').textContent = fineBase;

  /* ---------- input ---------- */
  const inp = $('#inp'), sendBtn = $('#sendBtn'), form = $('#ask');
  $('#askSlot').appendChild(form);
  const SMALL = () => innerWidth < 640;
  const PH = [SMALL() ? 'a meme, a ticker, a link' : 'paste a meme, a ticker or a link', 'where did doge come from?', '$CHILLGUY', 'instagram.com/jean_philanthrope', 'what did pepe become?', 'what changed from kabosu photo to dogecoin?'];
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

  /* ---------- AI status ---------- */
  const setAI = () => {
    const on = !!B.AI.kind;
    $('#aiDot').classList.toggle('on', on); $('#aiPill').classList.toggle('on', on);
    $('#aiLbl').textContent = on ? (B.AI.kind === 'claude' ? 'ai · claude' : 'ai · on') : 'archive only';
    $('#aiPill').title = on ? 'Plain-language questions go to the model; it can only show archive objects through tools.' : 'Answers come straight from the sourced archive.';
  };
  addEventListener('forks-ai', setAI); setAI();

  /* ---------- modes ---------- */
  const thread = $('#thread');
  let history = [], busy = false, ctl = null;
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

  /* ---------- send ---------- */
  async function send(raw) {
    raw = String(raw || '').trim(); if (!raw || busy) return;
    const ans = B.archiveAnswer(raw);
    if (ans.clear) { reset(); return; }
    if (ans.quest) { // /freeforks and /logout run in the page, never through the model
      toChat(); inp.value = ''; sendBtn.disabled = true; addYou(raw);
      busy = true; field.setMode('thinking');
      try { await QUEST.run(ans.quest); } finally { busy = false; field.setMode('idle'); scrollDown(); }
      return;
    }
    toChat(); inp.value = ''; sendBtn.disabled = true;
    addYou(raw);
    history.push({ role: 'user', content: raw });
    busy = true; field.setFocus(formRect()); field.setMode('thinking');
    const m = addUp();
    try {
      if (ans.confident) {
        await new Promise(r => setTimeout(r, RM.matches ? 0 : 520));
        m.src.hidden = false; m.src.textContent = 'archive';
        await type(m.txt, ans.text);
        (ans.cards || []).forEach(c => renderCard(m, c));
        follow(m, ans.follow);
        if (ans.light) lightUp(m);
        history.push({ role: 'assistant', content: ans.text });
      } else if (B.AI.kind) {
        m.src.hidden = false; m.src.textContent = 'traced';
        ctl = new AbortController();
        const stop = document.createElement('button'); stop.className = 'stop'; stop.type = 'button'; stop.textContent = 'stop';
        stop.onclick = () => ctl && ctl.abort(); m.li.querySelector('.who').appendChild(stop);
        let got = false;
        const ui = {
          card: c => { renderCard(m, c); scrollDown(); },
          light: () => lightUp(m),
          stream: t => { got = true; m.txt.textContent = t; scrollDown(); }
        };
        let text = '';
        try { text = await B.modelAnswer(history.slice(-10), ui, ctl.signal); }
        catch (e) {
          const code = e && e.code;
          if (code === 'cancelled') text = (e.text || m.txt.textContent || '').trim() || 'stopped.';
          else {
            const nf = B.R.notFound(ans.q, ans.near || []);
            text = (code === 'not_granted' ? 'the model is switched off for this page, so here is what the archive says.\n' : code === 'rate_limited' ? 'the model needs a breather. the archive says:\n' : '') + nf.text;
            m.src.textContent = 'archive';
            await type(m.txt, text); follow(m, nf.follow); got = true;
          }
        }
        stop.remove();
        if (text) m.txt.textContent = text; else if (!got) m.txt.textContent = '…';
        history.push({ role: 'assistant', content: text || m.txt.textContent });
      } else {
        const nf = B.R.notFound(ans.q, ans.near || []);
        m.src.hidden = false; m.src.textContent = 'archive';
        await type(m.txt, nf.text);
        follow(m, nf.follow);
        history.push({ role: 'assistant', content: nf.text });
      }
    } finally {
      busy = false; ctl = null; field.setMode('idle'); scrollDown();
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
    el.addEventListener('click', e => { const g = e.target.closest('.n'); if (g) { closeFull(); pick(g.dataset.id); } });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('.n'); if (g) { e.preventDefault(); closeFull(); pick(g.dataset.id); } } });
  }
  const pickArchive = id => send(`/trace ${id}`);
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
  const pickTraced = c => id => send(`where did ${c.nodes[Number(id)].name} come from?`);

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
  bindTree($('#fullB'), id => fullPick(id));

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
