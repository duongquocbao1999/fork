/* forks — /freeforks: four small trials on X for a pending $FORK allocation.
   upstream hands them out one at a time in the chat. GO opens the link; the server starts its own
   clock, and after the trial's wait (5 s) the claim counts. Amounts come from the server only.
   Two backends with one interface: the live API (Netlify functions + Supabase) and a demo on
   localStorage, used where the functions don't exist (local preview, the Claude artifact). */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG;
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const short = w => (w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '');
  const TICK = C.token.ticker;
  const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const LIVE_HOST = new RegExp(`(^|\\.)${C.site.host.replace(/\./g, '\\.')}$`);

  const TRIAL = {
    follow: { verb: 'follow', title: () => (C.x.handle ? `follow @${C.x.handle} on x` : 'follow forks on x'), done: 'followed.' },
    like: { verb: 'like', title: () => 'like the post', done: 'liked.' },
    repost: { verb: 'repost', title: () => 'repost it to your timeline', done: 'reposted. the line spreads.' },
    comment: { verb: 'comment', title: () => 'leave a comment under the post', done: 'heard you.' }
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
    async logout() { await req('/api/logout', {}); }
  };

  /* ---------- demo backend (no functions: preview, artifact) ---------- */
  const DEMO_TASKS = [['follow', 1500], ['like', 1000], ['repost', 1250], ['comment', 1250]];
  // kept in memory too: where storage throws (some sandboxed previews) the demo still works for the visit
  let mem = null;
  const load = () => { if (mem) return JSON.parse(JSON.stringify(mem)); try { return JSON.parse(localStorage.getItem('forks-demo') || '{}'); } catch (_) { return {}; } };
  const save = d => { mem = d; try { localStorage.setItem('forks-demo', JSON.stringify(d)); } catch (_) { } };
  const demo = {
    kind: 'demo',
    async me() {
      const d = load(); if (!d.user) return null;
      const tasks = DEMO_TASKS.map(([id, reward]) => ({ id, type: id, reward, waitSec: 5, openedAt: (d.opened || {})[id] || null, completedAt: (d.done || {})[id] || null }));
      return { user: { username: d.user, name: d.user, avatar: null }, allocation: tasks.filter(t => t.completedAt).reduce((s, t) => s + t.reward, 0), wallet: d.wallet || null, tasks, now: new Date().toISOString() };
    },
    signIn(handle) { const d = load(); d.user = handle; save(d); },
    async open(id) { const d = load(); d.opened = d.opened || {}; d.opened[id] = d.opened[id] || new Date().toISOString(); save(d); return { ok: true }; },
    async claim(id) {
      const d = load(), t = DEMO_TASKS.find(x => x[0] === id); if (!t) return { ok: false, error: 'unknown_task' };
      const at = d.opened && d.opened[id]; if (!at) return { ok: false, error: 'not_opened' };
      const left = 5 - (Date.now() - Date.parse(at)) / 1000; if (left > 0) return { ok: false, error: 'too_early', wait: left };
      d.done = d.done || {}; const already = !!d.done[id]; d.done[id] = d.done[id] || new Date().toISOString(); save(d);
      return { ok: true, reward: already ? 0 : t[1], allocation: (await demo.me()).allocation };
    },
    async wallet(w) { if (!SOLANA.test(w)) return { ok: false, error: 'bad_wallet' }; const d = load(); d.wallet = w; save(d); return { ok: true, wallet: w }; },
    async logout() { save({}); }
  };

  /* ---------- state ---------- */
  let ctx = null, B = null, me = null, mode = 'loading'; // live | demo | down | loading
  const listeners = [];
  const emit = () => listeners.forEach(f => f({ mode, me }));

  async function detect() {
    try {
      const r = await req('/api/me');
      if (r.status === 401 || r.status === 200) { B = live; mode = 'live'; me = r.status === 200 ? r.data : null; return; }
      if (r.status === 503 && r.data && r.data.error === 'not_configured' && !LIVE_HOST.test(location.hostname)) throw new Error('demo');
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      throw new Error('demo');
    } catch (_) {
      if (LIVE_HOST.test(location.hostname)) { B = live; mode = 'down'; return; }
      B = demo; mode = 'demo'; me = await demo.me();
    }
  }
  async function refresh() { try { me = await B.me(); } catch (_) { } emit(); return me; }

  /* ---------- chat flow ---------- */
  const pending = () => `${fmt(me ? me.allocation : 0)} ${TICK}`;
  const todo = () => (me ? me.tasks.filter(t => !t.completedAt) : []);
  const tag = () => (mode === 'demo' ? ' · <b class="demo">demo</b>' : '');

  async function say(text, src) {
    const m = ctx.addUp();
    m.src.hidden = false; m.src.textContent = src || 'freeforks';
    await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380);
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
      const m = await say(`${fmt(C.quest.total)} ${TICK}, pending — for four small forks of your own.\ni don't hand out to strangers. sign in with x first.`);
      return signInCard(m);
    }
    return next(true);
  }

  // Show what's left: the next trial, the wallet, or the summary.
  async function next(fresh) {
    const left = todo(), total = me.tasks.length;
    if (left.length) {
      const n = total - left.length + 1;
      const m = await say(fresh
        ? (n === 1 ? `four trials, one at a time. each one forks you closer to ${fmt(C.quest.total)} ${TICK}.` : `picking up where you left off. trial ${n} of ${total}.`)
        : left[0].type === 'comment' ? 'last one. say something under the post.' : `trial ${n} of ${total}.`);
      return taskCard(m, left[0], n, total);
    }
    if (!me.wallet) {
      const m = await say(`all ${total} trials done. ${pending()}, pending.\ndrop a solana wallet so the airdrop knows where to land.`);
      return walletCard(m);
    }
    const m = await say(`you're in the line. ${pending()} pending → ${short(me.wallet)}.\nnot a balance until ${TICK} launches. i'll be here.`);
    return summaryCard(m);
  }

  function card(m, head, body) {
    const el = document.createElement('div'); el.className = 'card quest-card';
    el.innerHTML = `<div class="card-h"><span>${head}</span></div><div class="card-b">${body}</div>`;
    m.cards.appendChild(el); ctx.scrollDown(); return el;
  }

  function signInCard(m) {
    if (mode === 'demo') {
      const el = card(m, `// sign in${tag()}`, `<form class="q-row"><input class="q-in" name="h" placeholder="@yourhandle" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Your X handle"><button class="q-btn" type="submit">enter</button></form><p class="q-note">demo: no x sign-in here, any handle works and progress stays in this browser.</p>`);
      el.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault(); const h = el.querySelector('input').value.trim().replace(/^@/, '');
        if (!/^\w{1,15}$/.test(h)) { ctx.toast('That is not an X handle.'); return; }
        demo.signIn(h.toLowerCase()); el.querySelector('form').innerHTML = `<span class="q-done">✓ @${ctx.esc(h.toLowerCase())}</span>`;
        await refresh(); next(true);
      });
      return;
    }
    const el = card(m, '// sign in', `<button class="q-btn x" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>sign in with x</button><p class="q-note">read-only: we see your handle and avatar, nothing else. we never post for you.</p>`);
    el.querySelector('button').addEventListener('click', () => B.login());
  }

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

  function walletCard(m) {
    const el = card(m, `// wallet · solana${tag()}`, `<form class="q-row"><input class="q-in mono" name="w" placeholder="your solana address" maxlength="44" autocomplete="off" spellcheck="false" aria-label="Solana wallet address"><button class="q-btn" type="submit">save</button></form><p class="q-note">only the address. we will never ask for a seed phrase or a signature here.</p>`);
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const w = el.querySelector('input').value.trim();
      if (!SOLANA.test(w)) { ctx.toast('That is not a Solana address.'); return; }
      const r = await B.wallet(w).catch(() => null);
      if (!r || !r.ok) { ctx.toast(r && r.error === 'wallet_taken' ? 'That wallet is already on another account.' : 'Could not save the wallet. Try again.'); return; }
      el.querySelector('form').innerHTML = `<span class="q-done mono">✓ ${ctx.esc(short(w))}</span>`;
      await refresh(); next(false);
    });
  }

  function summaryCard(m) {
    const u = me.user;
    const el = card(m, `// your fork${tag()}`, `<div class="q-sum">
      <div class="q-who">${u.avatar ? `<img src="${ctx.esc(u.avatar)}" alt="" width="32" height="32">` : ''}<span>@${ctx.esc(u.username)}</span></div>
      <div class="q-big">${fmt(me.allocation)} <span>${TICK} · pending</span></div>
      <div class="q-meta mono">${me.tasks.length}/${me.tasks.length} trials · wallet ${ctx.esc(short(me.wallet))}</div>
      <div class="q-acts"><a class="q-btn ghost" href="https://x.com/intent/tweet?text=${encodeURIComponent(`just forked myself into the ${TICK} line. where did it all come from?`)}&url=${encodeURIComponent(C.site.url)}" target="_blank" rel="noopener">share ↗</a><button class="q-link" type="button" data-a="out">sign out</button></div></div>`);
    el.querySelector('[data-a="out"]').addEventListener('click', () => ctx.send('/logout'));
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
  const api = { mount, run, onChange: f => { listeners.push(f); f({ mode, me }); }, get state() { return { mode, me }; } };
  window.ForksQuest = api;
})();
