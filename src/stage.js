/* forks — the trace stage.
   You type something; a line grows from its origin, point by point, through every fork on the way,
   to the thing you asked about. Side forks sprout as the line passes them. While upstream is still
   looking, probes reach out from the root and fall back.
   Wide screens grow left → right; phones grow top → down, one row per point, like git log --graph. */
(function () {
  'use strict';
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(2, n - 1)) + '…' : s);
  const LOOK = ['searching the archive', 'walking upstream', 'following the forks', 'reading the branches', 'looking for the origin'];
  const CH = 7.3; // px per character of the mono label at 12.5px

  function create(host, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'stage looking';
    el.innerHTML = '<div class="st-top"><span class="st-status"><i></i><b>tracing…</b></span><span class="st-acts"></span></div><svg class="st-svg" aria-hidden="true"></svg>';
    host.appendChild(el);
    const svg = el.querySelector('svg'), status = el.querySelector('.st-status b'), acts = el.querySelector('.st-acts');
    let probeT = 0, lookT = 0, li = 0, grown = false;
    const width = () => Math.max(260, el.clientWidth);
    const stageH = () => Math.max(300, Math.min(480, Math.round(innerHeight * .46))); // the wide stage: about half the screen
    const setStatus = t => { status.textContent = t; };

    /* ---------- looking ---------- */
    function probes() {
      const w = width(), wide = w >= 640, h = wide ? stageH() : 210;
      el.style.height = h + 'px';
      const rx = wide ? 28 : 22, ry = wide ? h / 2 + 12 : 52;
      let out = '';
      for (let i = 0; i < 7; i++) {
        let x, y, d;
        if (wide) { x = rx + (0.22 + Math.random() * 0.66) * (w - rx - 40); y = 52 + Math.random() * (h - 72); d = `M${rx} ${ry}C${rx + (x - rx) * .5} ${ry} ${rx + (x - rx) * .5} ${y} ${x} ${y}`; }
        else { x = rx + 26 + Math.random() * (w - rx - 56); y = ry + 34 + Math.random() * (h - ry - 46); d = `M${rx} ${ry}C${rx} ${ry + (y - ry) * .7} ${x} ${y - (y - ry) * .5} ${x} ${y}`; }
        const delay = (i * 0.2).toFixed(2);
        out += `<path class="st-probe" pathLength="1" d="${d}" style="animation-delay:${delay}s"/><circle class="st-tip" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" style="animation-delay:${(i * 0.2 + .6).toFixed(2)}s"/>`;
      }
      out += `<circle class="st-seed" cx="${rx}" cy="${ry}" r="5.5"/>`;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = out;
    }
    function look() {
      probes(); setStatus(LOOK[0] + '…');
      if (RM()) return;
      probeT = setInterval(() => { if (!grown) probes(); }, 1900);
      lookT = setInterval(() => { li = (li + 1) % LOOK.length; setStatus(LOOK[li] + '…'); }, 1600);
    }
    function stopLooking() { clearInterval(probeT); clearInterval(lookT); el.classList.remove('looking'); }

    /* ---------- layout ---------- */
    // data: { nodes: [{ id, name, meta, parent, rel }], root, focus }
    function layout(data) {
      const byId = new Map(data.nodes.map(n => [n.id, n]));
      const kids = new Map(data.nodes.map(n => [n.id, []]));
      data.nodes.forEach(n => { if (n.parent != null && kids.has(n.parent)) kids.get(n.parent).push(n.id); });
      const path = [];
      for (let id = data.focus; id != null && byId.has(id); id = byId.get(id).parent) path.unshift(id);
      const onPath = new Set(path);

      const w = width();
      const pos = new Map(); let leaves = 0, maxD = 0;
      const place = (id, d) => {
        maxD = Math.max(maxD, d); const ks = kids.get(id); let y;
        if (!ks.length) y = leaves++; else { const ys = ks.map(k => place(k, d + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
        pos.set(id, { d, y }); return y;
      };
      place(data.root, 0);
      const colW = (w - 30 - 200) / Math.max(1, maxD);
      const wide = w >= 640 && colW >= 118;
      const P = new Map(); let h, edge;
      if (wide) {
        const target = stageH();
        const rowH = leaves > 8 ? Math.max(30, 420 / leaves) : Math.min(96, Math.max(52, (target - 96) / leaves));
        h = Math.max(target, leaves * rowH + 96);
        const top = 46 + (h - 46 - leaves * rowH) / 2;
        for (const [id, p] of pos) {
          const x = 28 + p.d * Math.min(colW, 300), y = top + p.y * rowH + rowH / 2;
          const leaf = !kids.get(id).length;
          P.set(id, { x, y, chars: Math.floor(((leaf ? w - x - 16 : Math.min(colW, 300) - 18)) / CH), lx: 10, ly: -10, my: 15 });
        }
        edge = (a, b) => { const dx = b.x - a.x; return `M${a.x} ${a.y}C${a.x + dx * .55} ${a.y} ${a.x + dx * .45} ${b.y} ${b.x} ${b.y}`; };
      } else {
        const rows = []; const walk = (id, d) => { rows.push([id, d]); kids.get(id).forEach(k => walk(k, d + 1)); }; walk(data.root, 0);
        const rowH = 50, ind = Math.min(24, (w - 180) / Math.max(1, maxD)), top = 58;
        h = rows.length * rowH + top;
        rows.forEach(([id, d], i) => { const x = 20 + d * ind, y = top + i * rowH; P.set(id, { x, y, chars: Math.floor((w - x - 30) / CH), lx: 13, ly: 4, my: 19 }); });
        edge = (a, b) => `M${a.x} ${a.y}V${b.y - 12}Q${a.x} ${b.y} ${a.x + 12} ${b.y}H${b.x}`;
      }
      return { byId, kids, path, onPath, P, h, w, edge, wide };
    }

    /* ---------- grow ---------- */
    function grow(data) {
      grown = true; stopLooking();
      const L = layout(data), { byId, kids, path, onPath, P, h, w } = L;
      el.classList.add('growing'); el.classList.toggle('rows', !L.wide);
      el.style.height = h + 'px';
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

      // timeline: the line first, one point per step; side forks sprout as it passes their parent
      const fast = RM();
      const STEP = fast ? 0 : 620, SIDE = fast ? 0 : 340;
      const T = new Map(); // id -> { s: edge start, d: edge duration, at: node appears }
      path.forEach((id, i) => T.set(id, i === 0 ? { s: 0, d: 0, at: 0 } : { s: (i - 1) * STEP + 160, d: STEP - 160, at: i * STEP }));
      const queue = path.slice();
      for (let k = 0; k < queue.length; k++) {
        const id = queue[k]; let r = 0;
        for (const c of kids.get(id)) {
          if (T.has(c)) continue;
          const s = T.get(id).at + (fast ? 0 : 240 + r * 150);
          T.set(c, { s, d: SIDE, at: s + SIDE }); r++; queue.push(c);
        }
      }
      const end = Math.max(...[...T.values()].map(t => t.at)) + (fast ? 0 : 420);

      let edges = '', nodes = '';
      for (const n of data.nodes) {
        if (n.parent == null || !P.has(n.parent)) continue;
        const main = onPath.has(n.id) && onPath.has(n.parent);
        edges += `<path class="st-e${main ? ' path' : ''}${n.rel === 'LIKELY' || n.rel === 'DISPUTED' ? ' ' + n.rel.toLowerCase() : ''}" data-for="${esc(n.id)}" d="${L.edge(P.get(n.parent), P.get(n.id))}"/>`;
      }
      for (const n of data.nodes) {
        const p = P.get(n.id); if (!p) continue;
        const isF = n.id === data.focus, isR = n.id === data.root, main = onPath.has(n.id);
        const name = cut(n.name, Math.max(6, p.chars + (isF ? -2 : 0))), meta = n.meta ? cut(n.meta, Math.max(6, Math.floor(p.chars * 1.18))) : '';
        nodes += `<g class="st-n${main ? ' path' : ''}${isF ? ' focus' : ''}${isR ? ' root' : ''}" data-id="${esc(n.id)}" data-ch="${p.chars}" data-meta="${esc(n.meta || '')}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(n.name)}">` +
          `<title>${esc(n.name)}${n.meta ? ' · ' + esc(n.meta) : ''}</title>` +
          // a tap target over the point and its label, at least 44px tall
          `<rect class="hit" x="-12" y="${L.wide ? -26 : -18}" width="${Math.round(p.lx + 14 + Math.max(name.length, meta.length * .86) * CH)}" height="44"/>` +
          (isF ? '<circle class="ring" r="12"/>' : '') +
          `<circle class="dot" r="${(n.size != null ? (main || isR ? 3.6 : 2.6) + n.size * 3.4 : isR ? 5.5 : main ? 4.6 : 3.4).toFixed(1)}"/>` +
          `<text class="nm" x="${p.lx}" y="${p.ly}">${esc(name)}</text>` + (meta ? `<text class="mt" x="${p.lx}" y="${p.my}">${esc(meta)}</text>` : '') + '</g>';
      }
      svg.innerHTML = `<g class="st-edges">${edges}</g><g class="st-nodes">${nodes}</g>`;

      const ease = 'cubic-bezier(.45,0,.2,1)', pop = 'cubic-bezier(.22,1.4,.36,1)';
      svg.querySelectorAll('.st-e').forEach(e => {
        const t = T.get(e.dataset.for);
        if (e.classList.contains('likely') || e.classList.contains('disputed')) { e.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t.s, duration: Math.max(1, t.d), fill: 'both' }); return; }
        const len = e.getTotalLength();
        e.style.strokeDasharray = `${len} ${len}`;
        e.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { delay: t.s, duration: Math.max(1, t.d), easing: ease, fill: 'both' });
      });
      svg.querySelectorAll('.st-n').forEach(g => {
        const t = T.get(g.dataset.id), main = g.classList.contains('path');
        g.querySelector('.dot').animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { delay: t.at, duration: fast ? 1 : 420, easing: pop, fill: 'both' });
        g.querySelectorAll('text').forEach((tx, i) => tx.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { delay: t.at + (fast ? 0 : 60 + i * 90), duration: fast ? 1 : 360, easing: 'ease-out', fill: 'both' }));
        const ring = g.querySelector('.ring');
        if (ring) ring.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.5)' }, { opacity: .9, transform: 'scale(1)' }], { delay: t.at, duration: fast ? 1 : 700, easing: 'ease-out', fill: 'both' });
        if (main && !fast) setTimeout(() => {
          const n = byId.get(g.dataset.id);
          setStatus(g.dataset.id === data.focus ? `arrived · ${n.name.toLowerCase()}` : `${n.when ? n.when + ' · ' : ''}${n.name.toLowerCase()}`);
          if (opts.onPoint) { const r = g.querySelector('.dot').getBoundingClientRect(); opts.onPoint(r.left + r.width / 2, r.top + r.height / 2, g.dataset.id === data.focus); }
        }, t.at);
      });

      const pick = g => { if (opts.onPick && g) opts.onPick(g.dataset.id, g.querySelector('.dot').getBoundingClientRect()); };
      svg.addEventListener('click', e => pick(e.target.closest('.st-n')));
      svg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('.st-n'); if (g) { e.preventDefault(); pick(g); } } });

      return new Promise(res => setTimeout(() => {
        el.classList.remove('growing'); el.classList.add('grown');
        const forks = path.length - 1, root = byId.get(data.root);
        setStatus(forks ? `${forks} fork${forks > 1 ? 's' : ''} from ${root.name.toLowerCase()}` : `${root.name.toLowerCase()} · the origin`);
        if (opts.onFull) { acts.innerHTML = '<button type="button">open ↗</button>'; acts.querySelector('button').onclick = opts.onFull; }
        if (fast && opts.onPoint) { const f = svg.querySelector('.st-n.focus .dot'); if (f) { const r = f.getBoundingClientRect(); opts.onPoint(r.left + r.width / 2, r.top + r.height / 2, true); } }
        res({ path, forks, root, focus: byId.get(data.focus) });
      }, end));
    }

    function remove() { stopLooking(); grown = true; el.remove(); }
    // a coin on a point: its $TICKER in amber, after the name when it fits, else at the head of the meta line
    function tag(id, text) {
      const g = svg.querySelector(`.st-n[data-id="${CSS.escape(String(id))}"]`); if (!g || g.querySelector('text.tk')) return;
      const nm = g.querySelector('text.nm'), mt = g.querySelector('text.mt');
      const avail = Number(g.dataset.ch || 16) * CH * (g.classList.contains('focus') ? 1.12 : 1);
      const tw = text.length * 6.8, lx = Number(nm.getAttribute('x'));
      let w; try { w = nm.getBBox().width; } catch (_) { w = nm.textContent.length * CH; }
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('class', 'tk'); t.textContent = text;
      if (w + 9 + tw <= avail + 4) { t.setAttribute('x', (lx + w + 9).toFixed(1)); t.setAttribute('y', nm.getAttribute('y')); }
      else if (mt) {
        t.setAttribute('x', lx); t.setAttribute('y', mt.getAttribute('y'));
        const room = Math.floor((avail * 1.18 - tw - 8) / (CH * .84)), meta = g.dataset.meta || mt.textContent;
        mt.setAttribute('x', (lx + tw + 8).toFixed(1));
        mt.textContent = room < 4 ? '' : meta.length > room ? meta.slice(0, room - 1) + '…' : meta;
      } else { t.setAttribute('x', lx); t.setAttribute('y', (Number(nm.getAttribute('y')) + 15).toFixed(1)); }
      g.appendChild(t);
      if (!RM()) t.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    }
    look();
    return { el, grow, remove, setStatus, tag };
  }

  window.ForksStage = { create };
})();
