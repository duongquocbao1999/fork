/* forks — /freeforks: a pending $FORK allocation, in two parts.
   1. the x scan. At the first sign-in the server reads the account (age, followers, posts, lists,
      verified) and forks it a one-time allocation. The page plays that reading back line by line,
      then the tokens fly up into the header.
   2. four small trials on x. upstream hands them out one at a time in the chat. GO opens the link;
      the server starts its own clock, and after the trial's wait (5 s) the claim counts.
   Then a card: the allocation, what it is made of, the trees grown and the repositories seen.
   Amounts come from the server only. Two backends with one interface: the live API (Netlify
   functions + Supabase) and a demo on localStorage, used where the functions don't exist
   (local preview, the Claude artifact). */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG;
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const short = w => (w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '');
  const TICK = C.token.ticker;
  const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const LIVE_HOST = new RegExp(`(^|\\.)${C.site.host.replace(/\./g, '\\.')}$`);
  const XLOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>';
  const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20V3.6"/><path d="M9 14.4C9 10 15.4 10.5 15.4 6.8"/></svg>';

  const TRIAL = {
    follow: { verb: 'follow', title: () => (C.x.handle ? `follow @${C.x.handle} on x` : 'follow forks on x'), done: 'followed.' },
    like: { verb: 'like', title: () => 'like the post', done: 'liked.' },
    repost: { verb: 'repost', title: () => 'repost it to your timeline', done: 'reposted. the line spreads.' },
    comment: { verb: 'comment', title: () => 'leave a comment under the post', done: 'heard you.' }
  };
  // what each line of the x scan reads; the amounts next to them come from the server
  const SCAN_K = {
    age: ['on x for', n => (n >= 1 ? `${n} yrs` : `${Math.max(1, Math.round(n * 12))} mo`)],
    followers: ['followers', n => fmt(n)],
    posts: ['posts', n => fmt(n)],
    lists: ['in lists', n => fmt(n)],
    verified: ['verified', () => 'yes'],
    first: ['first fork', () => 'welcome']
  };
  const AUTH_ERRORS = {
    cancelled: 'You cancelled the X sign-in.',
    expired: 'Sign-in took too long. Try again.',
    state: 'Sign-in check failed. Try again.',
    token: 'X refused the sign-in. Try again in a minute.',
    profile: 'Could not read your X profile.',
    too_new: 'Your X account is too new for the trials.',
    database: 'Could not save your account. Try again in a minute.',
    setup: 'Sign-in is not set up on this site yet.',
    server: 'Something broke on our side. Try again.'
  };
  const CLAIM_ERRORS = { too_early: 'give it a few more seconds.', not_opened: 'open the link first.', closed: 'the trials are closed right now.', unknown_task: 'that trial is gone.', server: 'the ledger hiccuped. try again.' };

  /* ---------- live backend ---------- */
  async function req(path, body) {
    const res = await fetch(path, body === undefined
      ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    if ((res.headers.get('content-type') || '').includes('json')) data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  const live = {
    kind: 'live',
    async me() { const r = await req('/api/me'); if (r.status === 401) return null; if (r.status !== 200 || !r.data) throw new Error('down'); return r.data; },
    login() { location.href = `/auth/x/start?return=${encodeURIComponent('/?resume=freeforks')}`; },
    async open(id) { return (await req('/api/task/open', { task_id: id })).data || { ok: false, error: 'server' }; },
    async claim(id) { return (await req('/api/task/claim', { task_id: id })).data || { ok: false, error: 'server' }; },
    async wallet(w) { return (await req('/api/wallet', { wallet: w })).data || { ok: false, error: 'server' }; },
    async scanSeen() { await req('/api/scan/seen', {}); },
    async seen(traces, repos) { return (await req('/api/seen', { traces, repos })).data; },
    async logout() { await req('/api/logout', {}); }
  };

  /* ---------- demo backend (no functions: preview, artifact) ---------- */
  const DEMO_TASKS = [['follow', 3000], ['like', 2000], ['repost', 2500], ['comment', 2500]];
  // the same lines as scan_lines() in supabase/migrations/0002_scan.sql, for the demo only
  function scanLines(yrs, followers, posts, listed, verified) {
    const r50 = v => Math.round(v / 50) * 50, lg = n => Math.log10(Math.max(0, n) + 1);
    const a = r50(Math.min(yrs, 12) / 12 * 4000), f = r50(Math.min(1, lg(followers) / 5) * 8000);
    const t = r50(Math.min(1, lg(posts) / 4.5) * 3500), l = r50(Math.min(1, lg(listed) / 3) * 2500), v = verified ? 2000 : 0;
    const lines = [{ k: 'age', n: yrs, amount: a }, { k: 'followers', n: followers, amount: f }, { k: 'posts', n: posts, amount: t }, { k: 'lists', n: listed, amount: l }];
    if (v) lines.push({ k: 'verified', n: 1, amount: v });
    let total = a + f + t + l + v;
    if (total < 2000) { lines.push({ k: 'first', n: 0, amount: 2000 - total }); total = 2000; }
    return { lines, total: Math.min(total, 20000) };
  }
  // the demo has no x account to read: numbers drawn from the handle, the same every time
  function demoScan(handle) {
    let h = 2166136261;
    for (const ch of handle) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const yrs = Math.round((0.4 + rnd() * 13) * 10) / 10;
    return scanLines(yrs, Math.round(Math.pow(10, rnd() * 4.6)), Math.round(Math.pow(10, 1 + rnd() * 3.6)), Math.max(0, Math.round(Math.pow(10, rnd() * 2.4)) - 1), rnd() < 0.2);
  }
  // kept in memory too: where storage throws (some sandboxed previews) the demo still works for the visit
  let mem = null;
  const load = () => { if (mem) return JSON.parse(JSON.stringify(mem)); try { return JSON.parse(localStorage.getItem('forks-demo') || '{}'); } catch (_) { return {}; } };
  const save = d => { mem = d; try { localStorage.setItem('forks-demo', JSON.stringify(d)); } catch (_) { } };
  const demo = {
    kind: 'demo',
    async me() {
      const d = load(); if (!d.user) return null;
      const tasks = DEMO_TASKS.map(([id, reward]) => ({ id, type: id, reward, waitSec: 5, openedAt: (d.opened || {})[id] || null, completedAt: (d.done || {})[id] || null }));
      const tasksTotal = tasks.filter(t => t.completedAt).reduce((s, t) => s + t.reward, 0), scan = d.scan || null;
      return {
        user: { username: d.user, name: d.user, avatar: null }, allocation: (scan ? scan.total : 0) + tasksTotal, wallet: d.wallet || null,
        scan, scanSeen: !!d.scanSeen, scanTotal: scan ? scan.total : 0, tasksTotal, traces: d.traces || 0, reposSeen: d.repos || 0,
        tasks, now: new Date().toISOString()
      };
    },
    signIn(handle) { const d = load(); d.user = handle; d.scan = demoScan(handle); d.scanSeen = false; save(d); },
    async open(id) { const d = load(); d.opened = d.opened || {}; d.opened[id] = d.opened[id] || new Date().toISOString(); save(d); return { ok: true }; },
    async claim(id) {
      const d = load(), t = DEMO_TASKS.find(x => x[0] === id); if (!t) return { ok: false, error: 'unknown_task' };
      const at = d.opened && d.opened[id]; if (!at) return { ok: false, error: 'not_opened' };
      const left = 5 - (Date.now() - Date.parse(at)) / 1000; if (left > 0) return { ok: false, error: 'too_early', wait: left };
      d.done = d.done || {}; const already = !!d.done[id]; d.done[id] = d.done[id] || new Date().toISOString(); save(d);
      return { ok: true, reward: already ? 0 : t[1], allocation: (await demo.me()).allocation };
    },
    async wallet(w) { if (!SOLANA.test(w)) return { ok: false, error: 'bad_wallet' }; const d = load(); d.wallet = w; save(d); return { ok: true, wallet: w }; },
    async scanSeen() { const d = load(); d.scanSeen = true; save(d); },
    async seen(traces, repos) { const d = load(); d.traces = (d.traces || 0) + traces; d.repos = (d.repos || 0) + repos; save(d); return { ok: true, traces: d.traces, reposSeen: d.repos }; },
    async logout() { const d = load(); save({ traces: d.traces, repos: d.repos }); } // the stats stay with the browser
  };

  /* ---------- state ---------- */
  let ctx = null, B = null, me = null, mode = 'loading'; // live | demo | down | loading
  let hold = null; // what the header shows while the scan's tokens are still flying
  const listeners = [];
  // until the scan has been played back, the header shows the allocation without it
  const shown = () => (hold != null ? hold : !me ? 0 : me.scan && !me.scanSeen ? me.allocation - (me.scanTotal || 0) : me.allocation);
  const emit = () => listeners.forEach(f => f({ mode, me, shown: shown() }));

  async function detect() {
    try {
      const r = await req('/api/me');
      if (r.status === 401 || r.status === 200) { B = live; mode = 'live'; me = r.status === 200 ? r.data : null; await flush(); return; }
      if (r.status === 503 && r.data && r.data.error === 'not_configured' && !LIVE_HOST.test(location.hostname)) throw new Error('demo');
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      throw new Error('demo');
    } catch (_) {
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      B = demo; mode = 'demo'; me = await demo.me();
    }
  }
  async function refresh() { try { me = await B.me(); await flush(); } catch (_) { } emit(); return me; }

  /* ---------- trees grown and repos seen: a stat for the summary, never a reward ---------- */
  // signed out on the live site, the count waits in this browser and goes up once with the sign-in
  const TALLY = 'forks-tally';
  const tally = () => { try { return JSON.parse(localStorage.getItem(TALLY) || 'null'); } catch (_) { return null; } };
  const setTally = t => { try { if (t) localStorage.setItem(TALLY, JSON.stringify(t)); else localStorage.removeItem(TALLY); } catch (_) { } };
  async function flush() {
    const t = tally(); if (!me || B !== live || !t || !t.traces) return;
    setTally(null);
    const r = await live.seen(Math.min(25, t.traces), Math.min(500, t.repos || 0)).catch(() => null);
    if (r && r.ok) { me.traces = r.traces; me.reposSeen = r.reposSeen; }
  }
  async function noteTrace(repos) {
    repos = Math.max(0, Math.min(20, repos | 0));
    if (mode === 'loading') await ready;
    if (B === live && !me) { const t = tally() || { traces: 0, repos: 0 }; setTally({ traces: t.traces + 1, repos: t.repos + repos }); return; }
    if (!B || mode === 'down') return;
    const r = await B.seen(1, repos).catch(() => null);
    if (r && r.ok && me) { me.traces = r.traces; me.reposSeen = r.reposSeen; }
  }

  /* ---------- chat flow ---------- */
  const pending = () => `${fmt(me ? me.allocation : 0)} ${TICK}`;
  const todo = () => (me ? me.tasks.filter(t => !t.completedAt) : []);
  const tag = () => (mode === 'demo' ? ' · <b class="demo">demo</b>' : '');

  async function say(text, src) {
    const m = ctx.addUp();
    m.src.hidden = false; m.src.textContent = src || 'freeforks';
    await sleep(RM() ? 0 : 380);
    await ctx.type(m.txt, text);
    ctx.scrollDown();
    return m;
  }

  async function run(kind) {
    if (mode === 'loading') await ready;
    if (kind === 'logout') {
      if (!me) return say('you were never signed in.');
      await B.logout(); me = null; emit();
      return say(`signed out. your ${TICK} stays pending on your x account.`);
    }
    if (!C.questOpen() && mode !== 'demo') return say(`the trials open soon. ${TICK} is still being forked.`);
    if (mode === 'down') return say(`the ledger isn't answering right now. try again in a minute.`);
    await refresh();
    if (!me) {
      const m = await say(`${TICK} isn't handed out by the click. it's forked from your x.\nsign in and i'll read your account, then four small trials for +${fmt(C.quest.total)} more.`);
      return signInCard(m);
    }
    return next(true);
  }

  // Show what's left: the x scan, the next trial, or the summary.
  async function next(fresh) {
    if (me.scan && !me.scanSeen) return scan();
    const left = todo(), total = me.tasks.length;
    if (left.length) {
      const n = total - left.length + 1;
      const m = await say(fresh
        ? (n === 1 ? `four trials on x, one at a time. +${fmt(C.quest.total)} ${TICK} for all four.` : `picking up where you left off. trial ${n} of ${total}.`)
        : left[0].type === 'comment' ? 'last one. say something under the post.' : `trial ${n} of ${total}.`);
      return taskCard(m, left[0], n, total);
    }
    const m = await say((fresh ? 'your fork, as it stands.' : `all ${total} trials done. here's your fork.`) +
      (me.wallet ? '' : '\ndrop a solana wallet so the airdrop knows where to land.'));
    return summaryCard(m);
  }

  function card(m, head, body) {
    const el = document.createElement('div'); el.className = 'card quest-card';
    el.innerHTML = `<div class="card-h"><span>${head}</span></div><div class="card-b">${body}</div>`;
    m.cards.appendChild(el); ctx.scrollDown(); return el;
  }
  const face = (u, size) => (u.avatar
    ? `<img src="${ctx.esc(u.avatar)}" alt="" width="${size}" height="${size}">`
    : `<span class="ini">${ctx.esc((u.username || '?')[0])}</span>`);

  function signInCard(m) {
    if (mode === 'demo') {
      const el = card(m, `// sign in${tag()}`, `<form class="q-row"><input class="q-in" name="h" placeholder="@yourhandle" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Your X handle"><button class="q-btn" type="submit">enter</button></form><p class="q-note">demo: no x sign-in here. any handle works; the reading is simulated and stays in this browser.</p>`);
      el.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault(); const h = el.querySelector('input').value.trim().replace(/^@/, '');
        if (!/^\w{1,15}$/.test(h)) { ctx.toast('That is not an X handle.'); return; }
        demo.signIn(h.toLowerCase()); el.querySelector('form').innerHTML = `<span class="q-done">✓ @${ctx.esc(h.toLowerCase())}</span>`;
        await refresh(); next(true);
      });
      return;
    }
    const el = card(m, '// sign in', `<button class="q-btn x" type="button">${XLOGO}sign in with x</button><p class="q-note">read-only: your public profile and its numbers. we never post for you.</p>`);
    el.querySelector('button').addEventListener('click', () => B.login());
  }

  /* ---------- the x scan, played back ---------- */
  function scramble(el, final, ms) {
    return new Promise(res => {
      const end = Date.now() + ms, abc = 'abcdefghijklmnopqrstuvwxyz';
      const tick = () => {
        if (Date.now() >= end) { el.textContent = final; return res(); }
        el.textContent = final.replace(/\d/g, () => String((Math.random() * 10) | 0)).replace(/[a-z]/g, () => abc[(Math.random() * 26) | 0]);
        setTimeout(tick, 45);
      };
      tick();
    });
  }
  function countTo(el, from, to, ms) {
    return new Promise(res => {
      const t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(from + (to - from) * e));
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  async function scan() {
    const s = me.scan, u = me.user, still = RM();
    const m = await say(`before the trials: your x. let me read it.`, 'x scan');
    const el = card(m, `// x scan · @${ctx.esc(u.username)}${tag()}`, `<div class="sc">
      <div class="sc-who">${face(u, 36)}<div class="sc-id"><b>${ctx.esc(u.name || u.username)}</b><span>@${ctx.esc(u.username)}</span></div><span class="sc-st">reading</span></div>
      <div class="sc-sweep"><i></i></div>
      <ol class="sc-lines"></ol>
      <div class="sc-tot"><span class="k">your fork</span><span class="n"><b>0</b> <span class="tk">${TICK}</span></span></div></div>`);
    const box = el.querySelector('.sc'), list = el.querySelector('.sc-lines'), tot = el.querySelector('.sc-tot b'), st = el.querySelector('.sc-st');
    await sleep(still ? 0 : 900);
    let sum = 0;
    for (const ln of s.lines || []) {
      const K = SCAN_K[ln.k] || [String(ln.k), n => fmt(n)], val = K[1](Number(ln.n) || 0), amount = Number(ln.amount) || 0;
      const li = document.createElement('li'); li.className = 'sc-l' + (amount ? '' : ' zero');
      li.innerHTML = `<span class="k">${ctx.esc(K[0])}</span><span class="v">${ctx.esc(val)}</span><span class="a">+${fmt(amount)}</span>`;
      list.appendChild(li); ctx.scrollDown();
      if (!still) {
        await scramble(li.querySelector('.v'), val, 560);
        li.classList.add('in');
        await countTo(tot, sum, sum + amount, 460);
        await sleep(200);
      } else li.classList.add('in');
      sum += amount;
    }
    tot.textContent = fmt(s.total);
    box.classList.add('done'); st.textContent = 'read';
    await sleep(still ? 0 : 450);
    await rain(tot, s.total);
    me.scanSeen = true; hold = null; emit();
    await B.scanSeen().catch(() => {});
    const left = todo();
    const m2 = await say(`${fmt(s.total)} ${TICK}, pending. that's what your x forks into.` +
      (left.length ? `\nnow four small trials on x: +${fmt(C.quest.total)} more, one at a time.` : ''));
    if (!left.length) return next(false);
    return taskCard(m2, left[0], me.tasks.length - left.length + 1, me.tasks.length);
  }

  // the scan's tokens leave the total and land in the header, ticking it up as they arrive
  async function rain(fromEl, amount) {
    const target = ctx.meEl(), base = me.allocation - amount;
    const b = target && !target.hidden ? target.getBoundingClientRect() : null;
    if (RM() || !b || !b.width) return;
    const a = fromEl.getBoundingClientRect(), x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    const N = innerWidth < 640 ? 14 : 22, coins = [];
    hold = base; ctx.burst(x0, y0);
    let landed = 0;
    const flights = Array.from({ length: N }, (_, i) => {
      const c = document.createElement('i'); c.className = 'coin'; c.innerHTML = COIN;
      c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
      document.body.appendChild(c); coins.push(c);
      const ang = Math.random() * Math.PI * 2, r = 28 + Math.random() * 64;
      const mx = Math.cos(ang) * r, my = Math.sin(ang) * r * 0.6 - 26;
      const anim = c.animate([
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.28 },
        { transform: `translate(${dx}px,${dy}px) scale(.42)`, opacity: 0.85 }
      ], { duration: 950 + Math.random() * 420, delay: i * 55, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
      return anim.finished.then(() => {
        c.remove(); landed++;
        hold = base + Math.round(amount * landed / N); ctx.meTick(hold);
      }, () => c.remove());
    });
    await Promise.race([Promise.all(flights), sleep(4000)]); // a background tab can pause the flight: don't wait on it
    coins.forEach(c => c.remove());
    ctx.meTick(base + amount);
  }

  /* ---------- the trials ---------- */
  function taskCard(m, t, n, total) {
    const T = TRIAL[t.type] || { verb: t.type, title: () => t.type, done: 'done.' };
    const url = C.questOpen() ? C.taskUrl(t.type) : null; // demo without an account set: no link, the timer still runs
    const el = card(m, `// trial ${n} of ${total} · ${T.verb}${tag()}`,
      `<div class="q-task"><div><div class="q-title">${ctx.esc(T.title())}</div><div class="q-reward">+${fmt(t.reward)} ${TICK} <span>pending</span></div></div>
       ${url ? `<a class="q-btn go" href="${ctx.esc(url)}" target="_blank" rel="noopener">go ↗</a>` : '<button class="q-btn go" type="button">go</button>'}</div>
       <div class="q-state" hidden><div class="q-bar"><i></i></div><span class="q-msg">verifying</span></div>`);
    const go = el.querySelector('.go'), st = el.querySelector('.q-state'), bar = el.querySelector('.q-bar i'), msg = el.querySelector('.q-msg');
    let running = false;
    go.addEventListener('click', async () => {
      // the link opens natively (an <a> in the click), so popup blockers and X's in-app browser let it through
      if (running) return; running = true;
      go.classList.add('busy'); st.hidden = false; msg.textContent = 'opened · verifying';
      const o = await B.open(t.id).catch(() => null);
      if (!o || !o.ok) { fail(o && o.error); return; }
      const wait = Math.max(1, t.waitSec || 5) * 1000 + 400;
      bar.style.transitionDuration = wait + 'ms'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
      await sleep(wait);
      let r = await B.claim(t.id).catch(() => null);
      if (r && r.error === 'too_early' && r.wait) { msg.textContent = 'almost'; await sleep(r.wait * 1000 + 400); r = await B.claim(t.id).catch(() => null); }
      if (!r || !r.ok) { fail(r && r.error); return; }
      const got = typeof r.reward === 'number' ? r.reward : 0;
      el.classList.add('done');
      el.querySelector('.q-task').innerHTML = `<div><div class="q-title">${ctx.esc(T.title())}</div><div class="q-reward ok">✓ ${got ? `+${fmt(got)} ${TICK} <span>pending</span>` : '<span>already counted</span>'}</div></div>`;
      st.hidden = true;
      if (got) { const box = el.getBoundingClientRect(); ctx.burst(box.left + 30, box.top + 30); }
      await refresh();
      await say(got ? `${T.done} +${fmt(got)} ${TICK}, pending.` : 'that one was already counted.');
      next(false);
    });
    function fail(code) {
      running = false; go.classList.remove('busy'); bar.style.transitionDuration = '0ms'; bar.style.width = '0';
      msg.textContent = CLAIM_ERRORS[code] || CLAIM_ERRORS.server; st.classList.add('err');
      setTimeout(() => st.classList.remove('err'), 2400);
    }
  }

  /* ---------- your fork: the summary ---------- */
  function summaryCard(m) {
    const u = me.user, all = me.tasks.length, done = me.tasks.filter(t => t.completedAt).length;
    const trials = me.tasksTotal != null ? me.tasksTotal : me.tasks.filter(t => t.completedAt).reduce((s, t) => s + t.reward, 0);
    const share = `my x forked into ${fmt(me.allocation)} ${TICK} on ${C.site.host}. where did it all come from?`;
    const el = card(m, `// your fork${tag()}`, `<div class="fs">
      <div class="fs-top"><div class="q-who">${face(u, 28)}<span>@${ctx.esc(u.username)}</span></div><span class="fs-p">pending</span></div>
      <div class="fs-big"><b>${fmt(RM() ? me.allocation : 0)}</b> <span>${TICK}</span></div>
      <div class="fs-rows">
        ${me.scanTotal ? `<div class="fs-r"><span>x scan</span><b>${fmt(me.scanTotal)}</b></div>` : ''}
        <div class="fs-r"><span>trials · ${done}/${all}</span><b>${fmt(trials)}</b></div>
      </div>
      <div class="fs-stats">
        <div><b>${fmt(me.traces)}</b><span>${me.traces === 1 ? 'tree' : 'trees'} grown</span></div>
        <div><b>${fmt(me.reposSeen)}</b><span>repositories seen</span></div>
      </div>
      ${me.traces ? '' : '<p class="q-note">every tree you grow from here counts on this card.</p>'}
      <div class="fs-w"></div>
      <div class="q-acts"><a class="q-btn ghost" href="https://x.com/intent/tweet?text=${encodeURIComponent(share)}&url=${encodeURIComponent(C.site.url)}" target="_blank" rel="noopener">share ↗</a><button class="q-link" type="button" data-a="out">sign out</button></div></div>`);
    el.querySelector('[data-a="out"]').addEventListener('click', () => ctx.send('/logout'));
    if (!RM()) countTo(el.querySelector('.fs-big b'), 0, me.allocation, 900);
    wallet(el.querySelector('.fs-w'));
  }

  function wallet(box) {
    if (me.wallet) { box.innerHTML = `<div class="fs-r"><span>wallet · solana</span><b class="mono">✓ ${ctx.esc(short(me.wallet))}</b></div>`; return; }
    box.innerHTML = `<form class="q-row"><input class="q-in mono" name="w" placeholder="your solana address" maxlength="44" autocomplete="off" spellcheck="false" aria-label="Solana wallet address"><button class="q-btn" type="submit">save</button></form><p class="q-note">only the address. we will never ask for a seed phrase or a signature here.</p>`;
    box.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const w = box.querySelector('input').value.trim();
      if (!SOLANA.test(w)) { ctx.toast('That is not a Solana address.'); return; }
      const r = await B.wallet(w).catch(() => null);
      if (!r || !r.ok) { ctx.toast(r && r.error === 'wallet_taken' ? 'That wallet is already on another account.' : 'Could not save the wallet. Try again.'); return; }
      await refresh(); wallet(box);
      say(`saved. ${pending()} pending → ${short(w)}.\nnot a balance until ${TICK} launches. i'll be here.`);
    });
  }

  /* ---------- boot ---------- */
  let ready;
  function mount(c) {
    ctx = c;
    const p = new URLSearchParams(location.search);
    const auth = p.get('auth'), reason = p.get('reason'), resume = p.get('resume');
    if (auth || resume) {
      ['auth', 'reason', 'resume', 'code', 'state'].forEach(k => p.delete(k));
      history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash);
    }
    ready = detect().then(() => {
      emit();
      if (auth === 'error') ctx.toast(AUTH_ERRORS[reason] || AUTH_ERRORS.server);
      if (auth === 'ok' && resume === 'freeforks') ctx.send(C.quest.command);
    });
    return api;
  }
  const api = { mount, run, noteTrace, onChange: f => { listeners.push(f); f({ mode, me, shown: shown() }); }, get state() { return { mode, me, shown: shown() }; } };
  window.ForksQuest = api;
})();
