/* forks — Season 0: $FORK for the people who launch coins on repositories. The rules, the ladder of rewards,
   the top devs and your own coins come from /api/season; the database decides what is paid, the page only
   shows it. Used by the launch page (the full section), the launch form (one line) and the home page (a strip). */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, SH = window.ForksShell, esc = SH.esc, D = C.season || {};
  const T = (C.token && C.token.ticker) || '$FORK';
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const cap = n => (n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}K` : `$${n}`);
  const XI = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  let data = null, p = null;
  const listeners = [];

  function load(fresh) {
    if (p && !fresh) return p;
    p = fetch('/api/season', { credentials: 'same-origin' })
      .then(r => r.json().then(j => (j && j.ok ? j : null), () => null), () => null)
      .then(j => { data = j; listeners.forEach(f => { try { f(data); } catch (_) { } }); return data; });
    return p;
  }
  const launchReward = d => { const t = d && d.tiers && d.tiers.find(x => x.id === 'launch'); return t ? t.reward : D.launch || 0; };
  const maxReward = d => (d && d.tiers ? d.tiers.reduce((a, t) => a + t.reward, 0) : D.max || 0);
  const signIn = ret => `/auth/x/start?return=${encodeURIComponent(ret || location.pathname + location.hash)}`;
  const tierName = t => (t.id === 'launch' ? 'Dev buy' : t.id === 'grad' ? 'Migrate' : cap(Number(t.mcap)));

  /* ---------- the launch page: the whole season ---------- */
  function section(host) {
    const d = data, S = d && d.season, tiers = (d && d.tiers) || [];
    const name = (S && S.name) || D.name || 'Season 0';
    const ladder = tiers.length ? tiers.map((t, i) => `<li class="s1-t${t.id === 'launch' ? ' first' : t.id === 'grad' ? ' grad' : ''}"><span class="s1-tn">${esc(tierName(t))}</span><b>+${fmt(t.reward)}</b><small>${esc(t.label)}</small>${i < tiers.length - 1 ? '<i aria-hidden="true"></i>' : ''}</li>`).join('')
      : '<li class="s1-t wait"></li>'.repeat(7);
    const me = d && d.me;
    let mine;
    if (!d) mine = '<p class="muted">Reading the season…</p>';
    else if (!d.signedIn) mine = `<p>Sign in with X <b>before you launch</b>: the coins you launch earn for that account. Launched already? Sign in, then link the wallet you launched from.</p>
      <a class="btn primary" href="${signIn('/launch#season')}">${XI}Sign in with X</a><small class="muted">read-only · we never post for you</small>`;
    else {
      const coins = (me && me.coins) || [];
      mine = `<div class="s1-earned"><b>${fmt(me && me.earned)}</b><span>${T} pending · ${coins.length} ${coins.length === 1 ? 'coin' : 'coins'}</span></div>
        ${coins.length ? `<ul class="s1-coins">${coins.map(c => `<li><a href="/coin/${esc(c.mint)}"><span class="mk-img">${SH.logo(c.image, c.symbol)}</span><span class="s1-cn"><b>$${esc(c.symbol)}</b><small>${esc(c.repo)}</small></span><span class="s1-ct">${tiers.filter(t => (c.tiers || []).includes(t.id)).map(t => `<i title="${esc(t.label)}">${esc(tierName(t))}</i>`).join('')}</span><span class="s1-ce">${c.devBuy === false && !c.earned ? '<small class="s1-nb">no dev buy</small>' : ''}+${fmt(c.earned)}</span></a></li>`).join('')}</ul>`
          : `<p class="muted">No coins yet. <a href="#" data-s1="top">Pick a repository</a> and launch one — +${fmt(launchReward(d))} ${T} when it's live with a buy at launch.</p>`}
        <div class="s1-link"><span>Launched from another wallet?</span><button class="btn sm" type="button" data-s1="link">Link a wallet</button></div>
        ${me && me.wallets && me.wallets.length ? `<p class="s1-ws muted">Linked: ${me.wallets.map(w => `<span class="mono">${esc(w.slice(0, 4))}…${esc(w.slice(-4))}</span>`).join(', ')}</p>` : ''}`;
    }
    const top = (d && d.top) || [];
    const board = top.length ? `<ol class="s1-board">${top.map((r, i) => `<li><span class="s1-r">${i + 1}</span>${r.avatar ? `<img src="${esc(r.avatar)}" alt="" width="24" height="24" loading="lazy">` : '<span class="s1-av"></span>'}<span class="s1-h">@${esc(r.handle)}</span><span class="s1-c">${fmt(r.coins)} ${r.coins === 1 ? 'coin' : 'coins'}</span><b>${fmt(r.earned)}</b></li>`).join('')}</ol>`
      : `<p class="muted s1-empty">${d ? 'Nobody yet. The first coin of the season puts you on top.' : 'Reading…'}</p>`;
    const R = (d && d.rules) || { perDay: 3, minAgeDays: 30, confirmMinutes: 10 };
    const pool = Number((S && S.pool) || D.pool || 0), paid = Number((S && S.paid) || 0);
    host.innerHTML = `
      <div class="s1-head">
        <div><p class="s1-k"><span class="s1-dot"></span>${esc(name)}${S && !S.open ? ' · closed' : ' · live'}</p>
          <h2>Launch coins. Earn ${T}.</h2>
          <p class="s1-sub">Launch a coin on a repository with a buy at launch and it earns you ${T} the moment it's live — then far more as it grows and migrates. Up to <b>${fmt(maxReward(d))} ${T}</b> a coin.</p></div>
        <div class="s1-stats"><div><b>${fmt(d && d.coins)}</b><span>coins this season</span></div><div><b>${fmt(d && d.devs)}</b><span>devs</span></div></div>
      </div>
      ${pool ? `<div class="s1-pool"><span class="s1-pl">Season pool</span><span class="bar"><i style="width:${Math.min(100, Math.max(paid ? 0.6 : 0, paid / pool * 100)).toFixed(2)}%"></i></span><span class="s1-pv"><b>${fmt(pool - paid)}</b> of ${fmt(pool)} ${T} left</span></div>` : ''}
      <ol class="s1-ladder" aria-label="What a coin earns its dev">${ladder}</ol>
      <div class="s1-grid">
        <div class="box s1-me"><div class="box-h"><h3>Your season</h3></div><div class="box-b">${mine}</div></div>
        <div class="box s1-top"><div class="box-h"><h3>Top devs</h3><span class="muted">${T} earned</span></div><div class="box-b">${board}</div></div>
      </div>
      <p class="s1-fine">How it counts: a coin created alone earns nothing; with a buy at launch${R.minDevBuySol > 0 ? ` of at least ${R.minDevBuySol} SOL` : ''}, the launch reward lands when it's live (up to ${R.perDay} launches a day per X account). Market-cap milestones count once each, when forks sees the cap there twice, ${R.confirmMinutes}+ minutes apart — measured every 10 minutes from the curve on the chain, or from DexScreener with real liquidity behind it. Migrating from the curve is read from the chain. X accounts younger than ${R.minAgeDays} days and forks' own coins don't earn. ${esc(name)} pays out of a pool of ${fmt(pool)} ${T} and ends when the pool does, or when it's announced over. A pending allocation — not a balance, not a promise of value. Not financial advice.</p>`;
    host.querySelectorAll('[data-s1="link"]').forEach(b => b.addEventListener('click', () => link(b)));
    host.querySelectorAll('[data-s1="top"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const i = document.getElementById('repoIn'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } }));
  }

  /* ---------- link a wallet: sign a message with it (free, moves nothing) ---------- */
  async function link(btn) {
    const W = window.ForksWallet;
    if (!W) return;
    const old = btn ? btn.textContent : '';
    const busy = t => { if (btn) { btn.disabled = !!t; btn.textContent = t || old; } };
    try {
      let st = W.state();
      if (!st.connected) {
        const ws = await W.list();
        if (!ws.length) { SH.toast(W.mobile() ? 'Open forks.wiki in your wallet’s browser to link it.' : 'No Solana wallet found in this browser.'); return; }
        busy('Connecting…');
        await W.connect(ws[0].name);
        st = W.state();
      }
      const wallet = st.connected.address;
      busy('Sign in your wallet…');
      const m = await fetch('/api/season/link?wallet=' + encodeURIComponent(wallet), { credentials: 'same-origin' }).then(r => r.json());
      if (!m.ok) throw Object.assign(new Error(m.error), { code: m.error });
      const signature = await W.signText(m.message);
      busy('Linking…');
      const r = await fetch('/api/season/link', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet, issued: m.issued, signature }) }).then(x => x.json());
      if (!r.ok) throw Object.assign(new Error(r.error), { code: r.error });
      SH.toast(r.coins ? `Linked: ${r.coins} ${r.coins === 1 ? 'coin' : 'coins'} now earn for you.` : 'Linked: the coins this wallet launches earn for you.');
      await load(true);
    } catch (e) {
      const c = e && e.code;
      SH.toast(c === 'rejected' ? 'Not signed. Nothing changed.' : c === 'no_sign_message' ? 'This wallet can’t sign messages. Try Phantom or Solflare.'
        : c === 'wallet_taken' ? 'That wallet is linked to another X account.' : c === 'too_many_wallets' ? 'That’s the most wallets one account can link.'
        : c === 'excluded' ? 'That wallet doesn’t earn in the season.' : c === 'unauthorized' ? 'Sign in with X first.' : c === 'expired' ? 'That took too long. Try again.'
        : 'Couldn’t link the wallet. Try again.');
    } finally { busy(''); }
  }

  /* ---------- one line under the launch button: what this launch earns, given its buy at launch ---------- */
  function note(el, devSol) {
    if (!el) return () => { };
    const paint = () => {
      const d = data;
      if (d && d.season && !d.season.open) { el.hidden = true; return; }
      const r = launchReward(d), max = maxReward(d), name = (d && d.season && d.season.name) || D.name || 'Season 0';
      const min = (d && d.rules && d.rules.minDevBuySol) || 0, buy = devSol ? devSol() : 0, bought = buy > 0 && buy >= min;
      const k = `<span class="s1-k sm"><span class="s1-dot"></span>${esc(name)}</span>`;
      const first = d && d.signedIn ? '' : `<a href="${signIn()}">Sign in with X</a> first: `;
      el.hidden = false;
      el.innerHTML = bought
        ? `${k} ${first}${first ? 'this' : 'This'} launch earns you <b>+${fmt(r)} ${T}</b> when it's live, up to ${fmt(max)} as it grows.`
        : `${k} ${first}${first ? 'add' : 'Add'} a buy at launch${min > 0 ? ` (${min} SOL or more)` : ''} to earn <b>+${fmt(r)} ${T}</b> — a coin created alone earns nothing. Up to ${fmt(max)} as it grows.`;
    };
    paint();
    load().then(paint);
    return paint;
  }

  /* ---------- the home page: a strip under the $FORK box ---------- */
  function strip() {
    const d = data, name = (d && d.season && d.season.name) || D.name || 'Season 0';
    if (d && d.season && !d.season.open) return '';
    return `<a class="s1-strip" href="/launch#season"><span class="s1-k sm"><span class="s1-dot"></span>${esc(name)}</span><b>Up to ${fmt(maxReward(d))} ${T} a coin</b><span class="s1-more">launch with a dev buy, earn as it grows →</span></a>`;
  }

  window.ForksSeason = { load, section, note, strip, link, get: () => data, onChange: f => listeners.push(f) };
  // the launch page: the season section paints itself, and again whenever the season changes (a link, a launch)
  const host = document.getElementById('season');
  if (host) { section(host); listeners.push(() => section(host)); load().then(() => { if (location.hash === '#season') host.scrollIntoView({ block: 'start' }); }); }
})();
