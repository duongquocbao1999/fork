/* forks — /freeforks: a pending $FORK allocation, in two parts.
   1. the x scan. At the first sign-in the server reads the account (age, followers, posts, lists,
      verified) and forks it a one-time allocation. The page plays that reading back line by line,
      then the tokens fly up into the header.
   2. five trials, one at a time in the chat: follow, like, retweet, comment (GO opens the link; the
      server's clock counts it after 5 s), and quote the post with your fork card (counted by the link
      to your quote). (Until 4.4 there was a sixth, "ask upstream anything"; its card stays for old databases.)
   3. your fork: the card as a picture (copy, save, quote on x), the wallet, the invite link.
   4. optional, any time: connect github (/github) — github's own sign-in; the bonus lands once, on the server.
   Referrals: forks.wiki/r/<handle> → ?ref= → kept here → through the X sign-in → bound to new accounts.
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
  const GHLOGO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
  const MARKI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M9 20V3.6"/><path d="M9 14.4C9 10 15.4 10.5 15.4 6.8"/></svg>';
  const ICON = { chat: MARKI, github: GHLOGO };

  const TRIAL = {
    follow: { verb: 'follow', title: () => (C.x.handle ? `follow @${C.x.handle} on x` : 'follow forks on x'), done: 'followed.' },
    like: { verb: 'like', title: () => 'like the post', done: 'liked.' },
    repost: { verb: 'retweet', title: () => 'retweet the post', done: 'retweeted. the line spreads.' },
    comment: { verb: 'comment', title: () => 'leave a comment under the post', done: 'heard you.' },
    chat: { verb: 'ask upstream', title: () => 'ask upstream anything', done: 'that\'s how it works.' },
    quote: { verb: 'quote', title: () => 'quote the post with your fork', done: 'quoted. the line spreads.' },
    github: { verb: 'connect', title: () => 'connect your github', done: 'github connected.' }
  };
  const ASK = ['where did llama.cpp come from?', 'what did bitcoin/bitcoin become?', 'where did neovim come from?', 'the family tree of doge', 'who came before bun?', 'what is ollama built on?'];
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
  const CLAIM_ERRORS = { too_early: 'give it a few more seconds.', not_opened: 'open the link first.', closed: 'the trials are closed right now.', unknown_task: 'that trial is gone.', server: 'the ledger hiccuped. try again.',
    bad_link: 'That is not a link to a post. Copy it from X: share → copy link.', not_yours: 'That post is from another account. Paste the link to your own quote.',
    too_old: 'That post is older than your fork. Quote the post now and paste the new link.', link_used: 'That post has already been counted.', no_tree: 'Grow a tree first: ask upstream anything.', use_github: 'connect github with the button.' };
  const GH_ERRORS = {
    cancelled: 'You cancelled the GitHub sign-in.', expired: 'GitHub sign-in took too long. Try again.', state: 'GitHub sign-in check failed. Try again.',
    signin: 'Sign in with X first, then connect GitHub.', token: 'GitHub refused the sign-in. Try again in a minute.', profile: 'Could not read your GitHub profile.',
    github_taken: 'That GitHub account is already connected to another X account.', linked_other: 'This X account is already connected to another GitHub account.',
    too_new: 'Your GitHub account is too new for the bonus.', setup: 'GitHub sign-in is not set up on this site yet.', database: 'Could not save the connection. Try again in a minute.', server: 'Something broke on our side. Try again.'
  };

  /* ---------- who invited you: ?ref= (or /r/<code>) kept for 30 days, sent through the X sign-in ---------- */
  const REF = 'forks-ref', REF_OK = /^[a-z0-9_-]{1,40}$/i;
  const getRef = () => { try { const r = JSON.parse(localStorage.getItem(REF) || 'null'); return r && Date.now() - r.at < 30 * 864e5 ? r.code : null; } catch (_) { return null; } };
  const setRef = code => { try { if (code) localStorage.setItem(REF, JSON.stringify({ code: code.toLowerCase(), at: Date.now() })); else localStorage.removeItem(REF); } catch (_) { } };
  const refLink = code => `${C.site.url}/r/${code}`;

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
    login(resume) { const r = getRef(); location.href = `/auth/x/start?return=${encodeURIComponent('/?resume=' + (resume || 'freeforks'))}${r ? `&ref=${encodeURIComponent(r)}` : ''}`; },
    async open(id) { return (await req('/api/task/open', { task_id: id })).data || { ok: false, error: 'server' }; },
    async claim(id, proof) { return (await req('/api/task/claim', proof == null ? { task_id: id } : { task_id: id, proof })).data || { ok: false, error: 'server' }; },
    async wallet(w) { return (await req('/api/wallet', { wallet: w })).data || { ok: false, error: 'server' }; },
    async scanSeen() { await req('/api/scan/seen', {}); },
    async seen(traces, repos) { return (await req('/api/seen', { traces, repos })).data; },
    async logout() { await req('/api/logout', {}); },
    github() { location.href = `/auth/github/start?return=${encodeURIComponent('/?resume=github')}`; return new Promise(() => {}); }
  };

  /* ---------- demo backend (no functions: preview, artifact) ---------- */
  const DEMO_TASKS = [['follow', 2000, 'timer'], ['like', 1000, 'timer'], ['repost', 1500, 'timer'], ['comment', 1500, 'timer'], ['quote', 3000, 'link'], ['github', 3000, 'github']];
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
      const tasks = DEMO_TASKS.map(([id, reward, verify]) => ({ id, type: id, reward, verify, optional: verify === 'github', waitSec: verify === 'timer' ? 5 : 0, openedAt: (d.opened || {})[id] || null, completedAt: (d.done || {})[id] || null }));
      const tasksTotal = tasks.filter(t => t.completedAt).reduce((s, t) => s + t.reward, 0), scan = d.scan || null;
      return {
        user: { username: d.user, name: d.user, avatar: null }, allocation: (scan ? scan.total : 0) + tasksTotal, wallet: d.wallet || null,
        scan, scanSeen: !!d.scanSeen, scanTotal: scan ? scan.total : 0, tasksTotal, traces: d.traces || 0, reposSeen: d.repos || 0,
        ref: { code: d.user, reward: 2000, minTasks: 3, invited: 0, counted: 0, earned: 0, by: d.by || null },
        github: d.github || null,
        tasks, now: new Date().toISOString()
      };
    },
    signIn(handle) { const d = load(); d.user = handle; d.scan = demoScan(handle); d.scanSeen = false; const r = getRef(); d.by = r && r !== handle ? r : null; save(d); },
    async open(id) {
      const d = load(); d.opened = d.opened || {}; d.base = d.base || {};
      if (!d.opened[id]) { d.opened[id] = new Date().toISOString(); d.base[id] = d.traces || 0; }
      save(d); return { ok: true };
    },
    async claim(id, proof) {
      const d = load(), t = DEMO_TASKS.find(x => x[0] === id); if (!t) return { ok: false, error: 'unknown_task' };
      if (t[2] === 'github') return { ok: false, error: 'use_github' };
      if (t[2] === 'link') {
        const m = String(proof || '').trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status(?:es)?\/(\d{6,25})(?:[/?#].*)?$/i);
        if (!m) return { ok: false, error: 'bad_link' };
        if (m[1].toLowerCase() !== d.user) return { ok: false, error: 'not_yours' };
      } else {
        const at = d.opened && d.opened[id]; if (!at) return { ok: false, error: 'not_opened' };
        if (t[2] === 'trees' && (d.traces || 0) <= ((d.base || {})[id] || 0)) return { ok: false, error: 'no_tree' };
        const left = (t[2] === 'timer' ? 5 : 0) - (Date.now() - Date.parse(at)) / 1000; if (left > 0) return { ok: false, error: 'too_early', wait: left };
      }
      d.done = d.done || {}; const already = !!d.done[id]; d.done[id] = d.done[id] || new Date().toISOString(); save(d);
      return { ok: true, reward: already ? 0 : t[1], allocation: (await demo.me()).allocation };
    },
    async wallet(w) { if (!SOLANA.test(w)) return { ok: false, error: 'bad_wallet' }; const d = load(); d.wallet = w; save(d); return { ok: true, wallet: w }; },
    async scanSeen() { const d = load(); d.scanSeen = true; save(d); },
    async seen(traces, repos) { const d = load(); d.traces = (d.traces || 0) + traces; d.repos = (d.repos || 0) + repos; save(d); return { ok: true, traces: d.traces, reposSeen: d.repos }; },
    async logout() { const d = load(); save({ traces: d.traces, repos: d.repos }); }, // the stats stay with the browser
    // the demo has no github to sign in to: the connection is simulated, like the scan
    async github() {
      const d = load(); if (!d.user) return { ok: false, error: 'signin' };
      d.github = { login: d.user }; d.done = d.done || {}; const already = !!d.done.github; d.done.github = d.done.github || new Date().toISOString(); save(d);
      return { ok: true, reward: already ? 0 : DEMO_TASKS.find(x => x[0] === 'github')[1] };
    }
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
      if (r.status === 401 || r.status === 200) { B = live; mode = 'live'; me = r.status === 200 ? r.data : null; if (me) setRef(null); await flush(); return; }
      if (r.status === 503 && r.data && r.data.error === 'not_configured' && !LIVE_HOST.test(location.hostname)) throw new Error('demo');
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      throw new Error('demo');
    } catch (_) {
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      B = demo; mode = 'demo'; me = await demo.me();
    }
  }
  async function refresh() { try { me = await B.me(); await flush(); } catch (_) { } if (me) setRef(null); emit(); return me; }

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
    if (chatWait) chatWait();
  }
  let chatWait = null; // set while the "ask upstream anything" trial is on screen

  /* ---------- chat flow ---------- */
  const pending = () => `${fmt(me ? me.allocation : 0)} ${TICK}`;
  // the trials proper; optional ones (connect github) sit beside them and never block the line
  const core = () => (me ? me.tasks.filter(t => !t.optional) : []);
  const todo = () => core().filter(t => !t.completedAt);
  const ghTask = () => (me ? me.tasks.find(t => t.type === 'github') || null : null);
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
      await B.logout(); me = null; emit(); goneTo(null);
      return say(`signed out. your ${TICK} stays pending on your x account.`);
    }
    if (!C.questOpen() && mode !== 'demo') return say(`the trials open soon. ${TICK} is still being forked.`);
    if (mode === 'down') return say(`the ledger isn't answering right now. try again in a minute.`);
    await refresh();
    if (kind === 'invite') {
      if (!me) { const m = await say(`your invite link is your x handle. sign in first.`, 'invite'); return signInCard(m, 'invite'); }
      return inviteCard();
    }
    if (kind === 'github') {
      if (!me) { const m = await say(`connecting github is a bonus on top of your fork: +${fmt(C.quest.github)} ${TICK}, pending. sign in with x first.`, 'github'); return signInCard(m, 'github'); }
      return githubTrial(true);
    }
    if (!me) {
      const m = await say(`${TICK} isn't handed out by the click. it's forked from your x.\nsign in and i'll read your account, then five trials for +${fmt(C.quest.total)} more, and an optional github bonus.`);
      return signInCard(m);
    }
    return next(true);
  }

  // Show what's left: the x scan, the next trial, or the summary.
  async function next(fresh) {
    if (me.scan && !me.scanSeen) return scan();
    const left = todo(), total = core().length;
    if (left.length) {
      const t = left[0], n = total - left.length + 1;
      const lead = fresh
        ? (n === 1 ? `${total} trials, one at a time. +${fmt(C.quest.total)} ${TICK} for all ${total}.\n` : `picking up where you left off. `)
        : '';
      if (t.type === 'quote') {
        const m = await say(`${lead}trial ${n} of ${total}, the last: post your fork.\ncopy the card, quote the post on x with it, then paste the link to your quote here. +${fmt(t.reward)} ${TICK}.`);
        return forkCard(m, t);
      }
      if (t.type === 'chat') {
        const m = await say(`${lead}trial ${n} of ${total}: see how i work. ask me anything below — a word, a project, a repo — and watch its tree grow.`);
        return chatCard(m, t, n, total);
      }
      const m = await say(`${lead}${t.type === 'comment' ? 'say something under the post. ' : ''}trial ${n} of ${total}.`.replace(/^\s+/, ''));
      return taskCard(m, t, n, total);
    }
    const m = await say((fresh ? 'your fork, as it stands.' : `all ${total} trials done. here's your fork.`) +
      (me.wallet ? '' : '\ndrop a solana wallet so the airdrop knows where to land.'));
    await forkCard(m, null);
    const g = ghTask();
    if (g && !g.completedAt) return githubTrial(false);
  }

  function card(m, head, body) {
    const el = document.createElement('div'); el.className = 'card quest-card';
    el.innerHTML = `<div class="card-h"><span>${head}</span></div><div class="card-b">${body}</div>`;
    m.cards.appendChild(el); ctx.scrollDown(); return el;
  }
  const face = (u, size) => (u.avatar
    ? `<img src="${ctx.esc(u.avatar)}" alt="" width="${size}" height="${size}">`
    : `<span class="ini">${ctx.esc((u.username || '?')[0])}</span>`);

  function signInCard(m, resume) {
    if (mode === 'demo') {
      const el = card(m, `// sign in${tag()}`, `<form class="q-row"><input class="q-in" name="h" placeholder="@yourhandle" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Your X handle"><button class="q-btn" type="submit">enter</button></form><p class="q-note">demo: no x sign-in here. any handle works; the reading is simulated and stays in this browser.</p>`);
      el.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault(); const h = el.querySelector('input').value.trim().replace(/^@/, '');
        if (!/^\w{1,15}$/.test(h)) { ctx.toast('That is not an X handle.'); return; }
        demo.signIn(h.toLowerCase()); el.querySelector('form').innerHTML = `<span class="q-done">✓ @${ctx.esc(h.toLowerCase())}</span>`;
        await refresh(); if (resume === 'invite') inviteCard(); else if (resume === 'github') githubTrial(true); else next(true);
      });
      return;
    }
    const el = card(m, '// sign in', `<button class="q-btn x" type="button">${XLOGO}sign in with x</button><p class="q-note">read-only: your public profile and its numbers. we never post for you.</p>`);
    el.querySelector('button').addEventListener('click', () => B.login(resume));
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
      (left.length ? `\nnow ${core().length} trials: +${fmt(C.quest.total)} more, one at a time.` : ''));
    if (!left.length || left[0].type !== 'follow') return next(false);
    return taskCard(m2, left[0], core().length - left.length + 1, core().length);
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
  // the row every trial shares: icon · what to do + what it pays · the button (if any)
  const head = (t, T, reward, btn) => `<span class="q-ico${t.type === 'github' ? ' gh' : ''}">${ICON[t.type] || XLOGO}</span><div><div class="q-title">${ctx.esc(T.title())}${t.optional ? '<span class="q-opt">optional</span>' : ''}</div><div class="q-reward${reward.ok ? ' ok' : ''}">${reward.html}</div></div>${btn || ''}`;
  const owed = t => ({ html: `+${fmt(t.reward)} ${TICK} <span>pending</span>` });
  const paid = got => ({ ok: true, html: `✓ ${got ? `+${fmt(got)} ${TICK} <span>pending</span>` : '<span>already counted</span>'}` });

  // the link opened in another tab (or the X app) and this page was reloaded meanwhile: noted here, so the
  // page can come back to the trials instead of starting over (see mount)
  const GONE = 'forks-quest-gone';
  function goneTo(id) { try { if (id) sessionStorage.setItem(GONE, JSON.stringify({ id, at: Date.now() })); else sessionStorage.removeItem(GONE); } catch (_) { } }
  function wentTo() { try { const g = JSON.parse(sessionStorage.getItem(GONE) || 'null'); return g && Date.now() - g.at < 20 * 60e3 ? g : null; } catch (_) { return null; } }

  function taskCard(m, t, n, total) {
    const T = TRIAL[t.type] || { verb: t.type, title: () => t.type, done: 'done.' };
    const url = C.questOpen() ? C.taskUrl(t.type) : null; // demo without an account set: no link, the timer still runs
    const label = `${T.verb} on x`;
    const el = card(m, `// trial ${n} of ${total} · ${T.verb}${tag()}`,
      `<div class="q-task">${head(t, T, owed(t), url ? `<a class="q-btn go" href="${ctx.esc(url)}" target="_blank" rel="noopener">${XLOGO}${ctx.esc(label)} ↗</a>` : `<button class="q-btn go" type="button">${ctx.esc(label)}</button>`)}</div>
       <p class="q-hint">opens x in a new tab · counted about ${Math.max(1, t.waitSec || 5)} seconds after you open it</p>
       <div class="q-state" hidden><div class="q-bar"><i></i></div><span class="q-msg">verifying</span></div>`);
    const go = el.querySelector('.go'), st = el.querySelector('.q-state'), bar = el.querySelector('.q-bar i'), msg = el.querySelector('.q-msg'), hint = el.querySelector('.q-hint');
    let running = false;
    go.addEventListener('click', async () => {
      // the link opens natively (an <a> in the click), so popup blockers and X's in-app browser let it through
      if (running) return; running = true; goneTo(t.id);
      go.classList.add('busy'); st.hidden = false; hint.hidden = true; msg.textContent = 'opened · verifying';
      const o = await B.open(t.id).catch(() => null);
      if (!o || !o.ok) { fail(o && o.error); return; }
      const wait = Math.max(1, t.waitSec || 5) * 1000 + 400;
      bar.style.transitionDuration = wait + 'ms'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
      await sleep(wait);
      check();
    });
    // opened before (another tab, a reload, the X app): count it now, without opening the link again
    if (t.openedAt && !t.completedAt) { running = true; go.classList.add('busy'); st.hidden = false; hint.hidden = true; msg.textContent = 'welcome back · checking'; bar.style.width = '100%'; check(true); }
    async function check(back) {
      let r = await B.claim(t.id).catch(() => null);
      if (r && r.error === 'too_early' && r.wait) { msg.textContent = 'almost'; await sleep(r.wait * 1000 + 400); r = await B.claim(t.id).catch(() => null); }
      if (!r || !r.ok) { if (back && r && r.error === 'not_opened') { reset(); return; } fail(r && r.error); return; }
      goneTo(null);
      const got = typeof r.reward === 'number' ? r.reward : 0;
      el.classList.add('done');
      el.querySelector('.q-task').innerHTML = head(t, T, paid(got));
      st.hidden = true; hint.hidden = true;
      if (got) { const box = el.getBoundingClientRect(); ctx.burst(box.left + 30, box.top + 30); }
      await refresh();
      await say(got ? `${T.done} +${fmt(got)} ${TICK}, pending.` : 'that one was already counted.');
      next(false);
    }
    function reset() { running = false; go.classList.remove('busy'); bar.style.transitionDuration = '0ms'; bar.style.width = '0'; st.hidden = true; hint.hidden = false; }
    function fail(code) {
      running = false; go.classList.remove('busy'); bar.style.transitionDuration = '0ms'; bar.style.width = '0';
      msg.textContent = CLAIM_ERRORS[code] || CLAIM_ERRORS.server; st.classList.add('err');
      setTimeout(() => st.classList.remove('err'), 2400);
    }
  }

  /* ---------- optional: connect github (github's own sign-in; the bonus is decided on the server) ---------- */
  async function githubTrial(asked) {
    const t = ghTask(), T = TRIAL.github;
    if (!t) return asked ? say('the github bonus isn\'t open yet.', 'github') : null;
    if (t.completedAt) return asked ? say(`github connected${me.github && me.github.login ? `: @${ctx.esc(me.github.login)}` : ''}. +${fmt(t.reward)} ${TICK} counted, once.`, 'github') : null;
    const m = await say(asked ? `connect your github: +${fmt(t.reward)} ${TICK}, pending, once. we only read your public profile.`
      : `one more, if you like: connect your github. +${fmt(t.reward)} ${TICK}, pending.`, 'github');
    const el = card(m, `// bonus · ${T.verb} github${tag()}`,
      `<div class="q-task">${head(t, T, owed(t), `<button class="q-btn go ghost" type="button">${GHLOGO}connect github</button>`)}</div>
       <p class="q-hint">read-only: your public profile. one github per x account; it can't be moved later.</p>
       <div class="q-state" hidden><span class="q-msg"></span></div>`);
    const go = el.querySelector('.go'), st = el.querySelector('.q-state'), msg = el.querySelector('.q-msg');
    go.addEventListener('click', async () => {
      go.classList.add('busy');
      const r = await B.github().catch(() => null); // live: leaves for github and comes back (see mount)
      go.classList.remove('busy');
      if (!r || !r.ok) { st.hidden = false; st.classList.add('err'); msg.textContent = GH_ERRORS[(r && r.error) || 'server'] || GH_ERRORS.server; return; }
      await refresh(); githubDone(el, t, r.reward || 0);
    });
  }
  async function githubDone(el, t, got) {
    if (el) { el.classList.add('done'); el.querySelector('.q-task').innerHTML = head(t, TRIAL.github, paid(got)); el.querySelector('.q-hint').hidden = true; const b = el.getBoundingClientRect(); if (got) ctx.burst(b.left + 30, b.top + 30); }
    await say(got ? `${TRIAL.github.done} +${fmt(got)} ${TICK}, pending.` : 'that github was already counted.', 'github');
  }

  /* ---------- trial: ask upstream anything (counted when a tree lands) ---------- */
  function chatCard(m, t, n, total) {
    const T = TRIAL.chat, picks = ASK.map(q => [Math.random(), q]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]);
    const el = card(m, `// trial ${n} of ${total} · ${T.verb}${tag()}`,
      `<div class="q-task">${head(t, T, { html: `+${fmt(t.reward)} ${TICK} <span>pending · counts when your tree grows</span>` })}</div>
       <div class="q-chips">${picks.map(q => `<button class="chip" type="button">${ctx.esc(q)}</button>`).join('')}</div>
       <div class="q-state"><span class="q-msg">waiting for your first tree · or type your own below</span></div>`);
    const msg = el.querySelector('.q-msg');
    el.querySelector('.q-chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) ctx.send(b.textContent); });
    B.open(t.id).catch(() => null); // the server notes how many trees you had; the next one counts
    let busy = false;
    chatWait = async () => {
      if (busy) return; busy = true;
      const r = await B.claim(t.id).catch(() => null);
      busy = false;
      if (!r || !r.ok) { if (r && r.error !== 'no_tree') msg.textContent = CLAIM_ERRORS[r.error] || CLAIM_ERRORS.server; return; }
      chatWait = null;
      const got = typeof r.reward === 'number' ? r.reward : 0;
      el.classList.add('done'); el.querySelector('.q-chips').remove();
      el.querySelector('.q-task').innerHTML = head(t, T, paid(got));
      el.querySelector('.q-state').hidden = true;
      await refresh();
      await say(got ? `that's how i work: every point is a real repository — tap one for github. +${fmt(got)} ${TICK}, pending.` : 'that one was already counted.');
      next(false);
    };
  }

  /* ---------- your fork: the card to quote, the wallet, the invite ---------- */
  const trialsOf = () => {
    const done = core().filter(t => t.completedAt);
    return { done: done.length, all: core().length, amount: done.reduce((s, t) => s + t.reward, 0) };
  };
  const quoteOf = () => `https://x.com/${encodeURIComponent(C.x.postBy || C.x.handle)}/status/${encodeURIComponent(C.x.post)}`;
  function quoteText() {
    const u = me.user.username, tr = trialsOf(), code = me.ref && me.ref.code;
    return [`my x forked into ${fmt(me.allocation)} ${TICK}`, '', `$ git log --graph @${u}`,
      me.scanTotal ? `* x scan +${fmt(me.scanTotal)}` : null,
      tr.amount ? `* trials +${fmt(tr.amount)}` : null,
      me.traces ? `* ${fmt(me.traces)} ${me.traces === 1 ? 'tree' : 'trees'} grown` : null,
      me.ref && me.ref.earned ? `* invites +${fmt(me.ref.earned)}` : null,
      ghTask() && ghTask().completedAt ? `* github +${fmt(ghTask().reward)}` : null,
      '', 'where did yours come from?', code ? refLink(code) : C.site.url].filter(x => x != null).join('\n');
  }
  async function drawCard() {
    const u = me.user, tr = trialsOf(), code = me.ref && me.ref.code;
    return window.ForksCard.render({
      handle: u.username, avatar: u.avatar, ticker: TICK, allocation: me.allocation, scan: me.scanTotal,
      trialsDone: tr.done, trialsAll: tr.all, trialsAmount: tr.amount, traces: me.traces, repos: me.reposSeen,
      refs: (me.ref && me.ref.counted) || 0, refsAmount: (me.ref && me.ref.earned) || 0,
      link: code ? `${C.site.host}/r/${code}` : C.site.host, demo: mode === 'demo'
    });
  }

  async function forkCard(m, quote) {
    const u = me.user, alt = `${u.username}'s fork: ${fmt(me.allocation)} ${TICK} pending`;
    const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(quoteText())}&url=${encodeURIComponent(quoteOf())}`;
    const el = card(m, `// your fork · @${ctx.esc(u.username)}${tag()}`, `<div class="fk">
      <div class="fk-pic"><div class="fk-wait">printing your fork…</div></div>
      <div class="fk-acts">
        <button class="q-btn" type="button" data-a="copy"><b>1</b> copy card</button>
        <a class="q-btn x" href="${ctx.esc(intent)}" target="_blank" rel="noopener" data-a="quote"><b>2</b> quote on x ↗</a>
        <button class="q-link" type="button" data-a="save">save image</button>
      </div>
      ${quote ? `<div class="fk-proof"><div class="q-note"><b>3</b> paste the link to your quote · +${fmt(quote.reward)} ${TICK}</div>
        <form class="q-row"><input class="q-in mono" name="p" placeholder="https://x.com/${ctx.esc(u.username)}/status/…" autocomplete="off" spellcheck="false" inputmode="url" aria-label="Link to your quote"><button class="q-btn" type="submit">check</button></form>
        <div class="q-state" hidden><span class="q-msg"></span></div></div>` : ''}
      ${quote ? '' : '<div class="fs-w"></div>'}
      <div class="fk-foot"><button class="q-link" type="button" data-a="invite">invite friends · +${fmt((me.ref && me.ref.reward) || 2000)} ${TICK} each</button><button class="q-link" type="button" data-a="out">sign out</button></div></div>`);
    const pic = el.querySelector('.fk-pic');
    let blob = null;
    const ready = drawCard().then(r => {
      blob = r.blob;
      pic.innerHTML = `<img class="fk-img" src="${r.url}" alt="${ctx.esc(alt)}" width="1200" height="675">`;
      ctx.scrollDown();
    }).catch(() => { pic.innerHTML = '<div class="fk-wait">the card could not be drawn here. the quote still works.</div>'; });
    el.querySelector('[data-a="copy"]').addEventListener('click', async () => {
      if (!blob) { await ready; if (!blob) return; }
      const how = await window.ForksCard.copy(blob);
      ctx.toast(how === 'copied' ? 'Card copied. Paste it into your quote.' : how === 'shared' ? 'Card shared.' : how === 'saved' ? 'Card saved. Attach it to your quote.' : 'Not copied.');
    });
    el.querySelector('[data-a="save"]').addEventListener('click', async () => { if (!blob) await ready; if (blob) window.ForksCard.save(blob); });
    el.querySelector('[data-a="out"]').addEventListener('click', () => ctx.send('/logout'));
    el.querySelector('[data-a="invite"]').addEventListener('click', () => ctx.send('/invite'));
    if (quote) {
      const form = el.querySelector('.fk-proof form'), st = el.querySelector('.fk-proof .q-state'), msg = st.querySelector('.q-msg');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const link = form.querySelector('input').value.trim(); if (!link) return;
        form.querySelector('button').classList.add('busy'); st.hidden = false; st.classList.remove('err'); msg.textContent = 'checking the link';
        const r = await B.claim(quote.id, link).catch(() => null);
        form.querySelector('button').classList.remove('busy');
        if (!r || !r.ok) { st.classList.add('err'); msg.textContent = CLAIM_ERRORS[(r && r.error) || 'server'] || CLAIM_ERRORS.server; return; }
        const got = typeof r.reward === 'number' ? r.reward : 0;
        el.querySelector('.fk-proof').innerHTML = `<div class="q-reward ok">✓ ${got ? `quote counted · +${fmt(got)} ${TICK} <span>pending</span>` : '<span>already counted</span>'}</div>`;
        if (got) { const b = el.getBoundingClientRect(); ctx.burst(b.left + 40, b.bottom - 40); }
        await refresh();
        await say(got ? `${TRIAL.quote.done} +${fmt(got)} ${TICK}, pending.` : 'that one was already counted.');
        next(false);
      });
    } else wallet(el.querySelector('.fs-w'));
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
      say(`saved. ${pending()} pending → ${short(w)}.`);
    });
  }

  /* ---------- invite: your link, who came through it ---------- */
  async function inviteCard() {
    const R = me.ref || {}, reward = R.reward || 2000, min = R.minTasks || 3;
    if (!R.code) return say(`invites open once the ledger is updated. try again soon.`, 'invite');
    const link = refLink(R.code), shown = `${C.site.host}/r/${R.code}`;
    const m = await say(`+${fmt(reward)} ${TICK}, pending, for every friend who signs in through your link and finishes ${min} trials.` + (R.by ? `\nyou came through @${R.by}.` : ''), 'invite');
    const text = `where did it come from? type anything and watch the github repos it forked from grow.\n\nmy invite: ${link}`;
    const el = card(m, `// invite · @${ctx.esc(me.user.username)}${tag()}`, `<div class="ivc">
      <div class="ivc-link"><span class="mono">${ctx.esc(shown)}</span><button class="q-btn" type="button" data-a="copy">copy</button></div>
      <div class="ivc-stats"><div><b>${fmt(R.invited)}</b><span>signed in</span></div><div><b>${fmt(R.counted)}</b><span>counted</span></div><div><b>${fmt(R.earned)}</b><span>${TICK} pending</span></div></div>
      <div class="q-acts"><a class="q-btn ghost" href="https://x.com/intent/tweet?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">share on x ↗</a></div></div>`);
    el.querySelector('[data-a="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); ctx.toast('Invite link copied.'); }
      catch (_) { ctx.toast(link); }
    });
  }

  /* ---------- boot ---------- */
  let ready;
  function mount(c) {
    ctx = c;
    const p = new URLSearchParams(location.search);
    const auth = p.get('auth'), reason = p.get('reason'), resume = p.get('resume'), ref = p.get('ref'), gh = p.get('gh');
    if (ref && REF_OK.test(ref)) setRef(ref);
    if (auth || resume || ref || gh) {
      ['auth', 'reason', 'resume', 'code', 'state', 'ref', 'gh'].forEach(k => p.delete(k));
      history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash);
    }
    const gone = !auth && !gh ? wentTo() : null; // back from a trial's link after the page was reloaded
    ready = detect().then(() => {
      emit();
      if (auth === 'error') ctx.toast(AUTH_ERRORS[reason] || AUTH_ERRORS.server);
      if (auth === 'ok' && resume === 'freeforks') ctx.send(C.quest.command);
      if (auth === 'ok' && resume === 'invite') ctx.send('/invite');
      if (auth === 'ok' && resume === 'github') ctx.send('/github');
      // back from github: the bonus was decided in the callback; say what happened
      if (gh === 'ok') ctx.send('/github');
      if (gh === 'error') ctx.toast(GH_ERRORS[reason] || GH_ERRORS.server);
      if (gone && me && todo().some(t => t.id === gone.id)) ctx.send(C.quest.command);
      else if (gone) goneTo(null);
    });
    return api;
  }
  // connect github from anywhere on the page (the home page's $FORK box): signed out, it asks for x first
  async function github() { if (mode === 'loading') await ready; if (!me) return ctx.send('/github'); const t = ghTask(); if (t && !t.completedAt && B === live) return live.github(); return ctx.send('/github'); }
  const api = { mount, run, noteTrace, github, onChange: f => { listeners.push(f); f({ mode, me, shown: shown() }); }, get state() { return { mode, me, shown: shown() }; } };
  window.ForksQuest = api;
})();
