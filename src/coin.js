/* forks — a coin's terminal: what it is (a coin launched on a repository, or a project's token), its price,
   a candle chart, the latest trades, the top holders, the fee split, and a buy/sell panel. A coin on its
   pump.fun curve trades straight on the curve; anything else through Jupiter. The wallet signs every trade
   and nothing moves without it. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, SH = window.ForksShell, W = window.ForksWallet, F = window.ForksLaunch;
  const esc = SH.esc, $ = s => document.querySelector(s);
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MINT = (location.pathname.match(/^\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})\/?$/) || [])[1] || new URLSearchParams(location.search).get('m') || '';
  const WSOL = 'So11111111111111111111111111111111111111112';

  /* ---------- numbers ---------- */
  // tiny prices the way terminals write them: 0.0₅4194 = 0.000004194 (five zeros after the point)
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sig = (n, d = 4) => {
    if (!Number.isFinite(n)) return '—'; if (n === 0) return '0';
    const a = Math.abs(n);
    if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (a >= 1) return n.toFixed(a >= 100 ? 2 : 3);
    if (a >= 0.001) return n.toPrecision(d).replace(/0+$/, '').replace(/\.$/, '');
    const z = -Math.floor(Math.log10(a)) - 1, digits = Math.round(a * 10 ** (z + d)).toString().slice(0, d).replace(/0+$/, '');
    return `${n < 0 ? '-' : ''}0.0${String(z).split('').map(c => SUB[c]).join('')}${digits}`;
  };
  const usd = n => (n == null || !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${sig(n)}`);
  const big = n => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : sig(n, 3));
  const pct = c => (c == null ? '—' : `${c >= 0 ? '+' : ''}${Number(c).toFixed(2)}%`);
  const short = a => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
  const ago = t => { const s = Math.max(1, (Date.now() - t) / 1000); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
  const toRaw = (v, dec) => { const [i, f = ''] = String(v).replace(',', '.').split('.'); const s = (i.replace(/^0+(?=\d)/, '') || '0') + (f + '0'.repeat(dec)).slice(0, dec); return s.replace(/^0+(?=\d)/, ''); };
  const fromRaw = (raw, dec) => Number(raw) / 10 ** dec;
  async function api(path, body) {
    try {
      const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      const j = await r.json().catch(() => null);
      return j || { ok: false, error: r.status === 404 ? 'offline' : 'server' };
    } catch (_) { return { ok: false, error: 'network' }; }
  }

  let info = null; // /api/coin
  const tok = () => info.coin, dec = () => info.decimals == null ? 6 : info.decimals, Q = () => info.quote;

  /* ---------- header, stats, about ---------- */
  function head() {
    const t = tok(), m = info.market || {}, proj = t.kind === 'project', other = t.kind === 'token';
    document.title = `$${t.symbol} · ${t.name} · forks`;
    const repo = t.repo || (proj ? null : null);
    const curve = info.curve;
    $('#cnH').innerHTML = `
      <span class="cn-img">${SH.logo(t.image || m.image, t.symbol)}</span>
      <div class="cn-t">
        <h1>$${esc(t.symbol)} <span class="nm">${esc(t.name)}</span>${proj ? '<span class="label blue">project token</span>' : other ? '<span class="label">Solana token · not on forks</span>' : '<span class="label amber">coin on forks</span>'}${curve ? (curve.complete ? '<span class="label purple">graduated</span>' : curve.onCurve ? `<span class="label green">on the curve · ${Math.round(curve.progress || 0)}%</span>` : '') : ''}</h1>
        <div class="meta">${repo ? `<a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener">${esc(repo)}</a>` : proj ? `by <a href="https://github.com/${esc(t.owner)}" target="_blank" rel="noopener">${esc(t.owner)}</a> on GitHub` : ''}
          <button class="btn sm" type="button" id="caBtn" title="Copy the contract address"><span class="mono">${esc(short(MINT))}</span> copy</button></div>
      </div>
      <div class="cn-price"><b id="pxNow">${m.price != null ? usd(m.price) : '—'}</b><span class="${m.change24 == null ? 'muted' : m.change24 >= 0 ? 'up' : 'dn'}">${pct(m.change24)} <span class="muted">24h</span></span></div>`;
    $('#caBtn').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(MINT); SH.toast(`$${t.symbol} address copied.`); } catch (_) { SH.toast(MINT); }
      const b = e.currentTarget; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    });
    const st = $('#stats'); st.hidden = false;
    st.innerHTML = [
      ['Market cap', usd(m.mcap)], ['Liquidity', usd(m.liquidity)], ['Volume 24h', usd(m.volume24)],
      ['Trades 24h', m.txns24 ? m.txns24.toLocaleString('en-US') : '—'],
      curve && !curve.complete ? ['Bonding curve', `${(curve.progress || 0).toFixed(1)}%`] : ['1h', pct(m.change1)]
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
  function about() {
    const t = tok(), proj = t.kind === 'project', other = t.kind === 'token';
    const L = [['pump.fun', `https://pump.fun/coin/${MINT}`], ['DexScreener', `https://dexscreener.com/solana/${MINT}`], ['Solscan', `https://solscan.io/token/${MINT}`], ['Jupiter', `https://jup.ag/tokens/${MINT}`]].filter(([n]) => !(proj && n === 'pump.fun'));
    $('#about').innerHTML = `<div class="box-h"><h3>About</h3></div><div class="box-b">
      ${t.repo ? `<div class="repo" id="aboutRepo"><a class="rn" href="https://github.com/${esc(t.repo)}" target="_blank" rel="noopener">${esc(t.repo)}</a><p class="muted">Reading GitHub…</p></div>` : ''}
      <p style="margin:0">${other ? `A token traded on Solana. It wasn't launched on forks and isn't a project token on the graph; forks only shows its market (DexScreener, GeckoTerminal) and routes trades through Jupiter. Anyone can make a token with any name: check the address before you trade.` : proj ? `The ${esc(t.name)} project's own token. It belongs to the project, not to forks; it sits on the graph on every repository of <a href="https://github.com/${esc(t.owner)}" target="_blank" rel="noopener">${esc(t.owner)}</a>.` : `A coin launched on forks for this repository. Its creator fees go, for good, to the people in the fee split below; they claim on pump.fun with GitHub. The repository's authors didn't make or endorse it.`}</p>
      ${t.repo ? `<p class="lin" id="aboutLine" style="margin:0"></p>` : ''}
      <div class="ca-row" id="caRow"><code>${esc(MINT)}</code><button class="btn sm" type="button">Copy</button></div>
      <dl class="kv" style="margin:0">${info.supply ? `<dt>Supply</dt><dd>${big(fromRaw(info.supply, dec()))}</dd>` : ''}<dt>Decimals</dt><dd>${dec()}</dd>${info.program ? `<dt>Program</dt><dd>${info.program === 'token-2022' ? 'Token-2022' : 'SPL Token'}</dd>` : ''}${t.live_at ? `<dt>Launched</dt><dd>${new Date(t.live_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</dd>` : ''}${t.launcher ? `<dt>Launched by</dt><dd><a href="https://solscan.io/account/${esc(t.launcher)}" target="_blank" rel="noopener">${esc(short(t.launcher))}</a></dd>` : ''}</dl>
      <div class="tkn-links">${L.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n} ↗</a>`).join('')}</div>
      <p class="muted" style="margin:0;font-size:12px">Not financial advice. Prices move fast; only trade what you can lose.</p></div>`;
    $('#caRow button').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(MINT); SH.toast('Address copied.'); } catch (_) { SH.toast(MINT); }
      const r = $('#caRow'); r.classList.remove('pulse'); void r.offsetWidth; r.classList.add('pulse');
    });
    if (t.repo) {
      fetch('/api/repos?r=' + encodeURIComponent(t.repo)).then(r => r.json().then(j => (r.ok ? j : null), () => null)).then(j => {
        const d = j && j.repos && (j.repos[t.repo] || Object.values(j.repos)[0]); const el = $('#aboutRepo'); if (!el) return;
        el.innerHTML = `<a class="rn" href="https://github.com/${esc(t.repo)}" target="_blank" rel="noopener">${esc(t.repo)}</a>${d && d.desc ? `<p>${esc(d.desc)}</p>` : ''}${d ? `<div class="rm">${d.lang ? `<span>${esc(d.lang)}</span>` : ''}<span>★ ${Number(d.stars).toLocaleString('en-US')}</span><span>${Number(d.forks).toLocaleString('en-US')} forks</span></div>` : ''}`;
      }).catch(() => { });
      const split = t.split || [], up = split.filter(h => (h.roles || []).some(r => /parent|ancestor/.test(r)) && h.repo);
      const el = $('#aboutLine');
      if (el) el.innerHTML = up.length ? `came from ${[...new Set(up.map(h => h.repo))].map(r => `<a href="/?q=${encodeURIComponent('where did ' + r + ' come from?')}">${esc(r)}</a>`).join(' ← ')} · <a href="/?q=${encodeURIComponent('where did ' + t.repo + ' come from?')}">see the graph</a>` : `<a href="/?q=${encodeURIComponent('where did ' + t.repo + ' come from?')}">See where ${esc(t.repo)} came from →</a>`;
    }
  }

  /* ---------- the chart ---------- */
  const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  let tf = '15m', candles = [], hover = -1, chartT = 0;
  const cv = $('#cv'), tip = $('#chTip');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function draw() {
    const box = $('#chart').getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, box.width, box.height);
    const empty = $('#chEmpty');
    if (candles.length < 2) { empty.hidden = false; tip.innerHTML = ''; return; }
    empty.hidden = true;
    const W_ = box.width, H = box.height, padR = 78, padB = 22, top = 34, plotW = W_ - padR - 8, volH = (H - top - padB) * 0.18, plotH = H - top - padB - volH - 6;
    const n = Math.max(2, Math.min(candles.length, Math.floor(plotW / 7))), vis = candles.slice(-n), step = plotW / n, cw = Math.max(1, Math.min(10, step * 0.66));
    let lo = Infinity, hi = -Infinity, vmax = 0;
    for (const c of vis) { lo = Math.min(lo, c[3]); hi = Math.max(hi, c[2]); vmax = Math.max(vmax, c[5]); }
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const padP = (hi - lo) * 0.08; hi += padP; lo = Math.max(0, lo - padP);
    const y = p => top + (1 - (p - lo) / (hi - lo)) * plotH, x = i => 8 + step * i + step / 2;
    const up = css('--acc'), dn = css('--err'), grid = css('--rule'), ink2 = css('--ink-2');
    g.font = '11px ' + css('--mono'); g.textBaseline = 'middle'; g.fillStyle = ink2; g.strokeStyle = grid; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const p = lo + (hi - lo) * (k / 4), yy = Math.round(y(p)) + .5;
      g.beginPath(); g.moveTo(8, yy); g.lineTo(8 + plotW, yy); g.stroke();
      g.fillText(sig(p, 4), 8 + plotW + 8, yy);
    }
    g.textBaseline = 'alphabetic';
    const span = (vis[vis.length - 1][0] - vis[0][0]) || 1, fmtT = t => { const d = new Date(t * 1000); return span > 3 * 86400 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); };
    const every = Math.max(1, Math.round(n / Math.max(2, Math.floor(plotW / 90))));
    for (let i = 0; i < n; i += every) g.fillText(fmtT(vis[i][0]), Math.min(x(i) - 14, W_ - padR - 30), H - 6);
    vis.forEach((c, i) => {
      const color = c[4] >= c[1] ? up : dn, xx = Math.round(x(i)) + .5;
      g.strokeStyle = color; g.fillStyle = color;
      g.beginPath(); g.moveTo(xx, y(c[2])); g.lineTo(xx, y(c[3])); g.stroke();
      const yo = y(c[1]), yc = y(c[4]); g.fillRect(xx - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
      const vh = vmax ? (c[5] / vmax) * volH : 0; g.globalAlpha = .35; g.fillRect(xx - cw / 2, H - padB - vh, cw, vh); g.globalAlpha = 1;
    });
    // the last price, labelled on the axis
    const last = vis[vis.length - 1], ly = y(last[4]);
    g.setLineDash([3, 3]); g.strokeStyle = last[4] >= last[1] ? up : dn; g.beginPath(); g.moveTo(8, ly); g.lineTo(8 + plotW, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = last[4] >= last[1] ? up : dn; g.fillRect(8 + plotW + 2, ly - 9, padR - 4, 18); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(sig(last[4], 4), 8 + plotW + 6, ly);
    const hi_ = hover >= 0 && hover < n ? vis[hover] : last;
    if (hover >= 0 && hover < n) { g.strokeStyle = ink2; g.globalAlpha = .5; g.beginPath(); g.moveTo(Math.round(x(hover)) + .5, top); g.lineTo(Math.round(x(hover)) + .5, H - padB); g.stroke(); g.globalAlpha = 1; }
    const ch = hi_[1] ? ((hi_[4] - hi_[1]) / hi_[1]) * 100 : 0;
    tip.innerHTML = `<span>${new Date(hi_[0] * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span><span>O <b>${sig(hi_[1])}</b></span><span>H <b>${sig(hi_[2])}</b></span><span>L <b>${sig(hi_[3])}</b></span><span>C <b class="${ch >= 0 ? 'up' : 'dn'}">${sig(hi_[4])}</b></span><span class="${ch >= 0 ? 'up' : 'dn'}">${pct(ch)}</span>`;
    cv._map = { step, n };
  }
  cv.addEventListener('pointermove', e => { const m = cv._map; if (!m) return; const r = cv.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - 8) / m.step); hover = i >= 0 && i < m.n ? i : -1; draw(); });
  cv.addEventListener('pointerleave', () => { hover = -1; draw(); });
  addEventListener('resize', () => { clearTimeout(chartT); chartT = setTimeout(draw, 80); });
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  async function chart() {
    const j = await api(`/api/chart?mint=${MINT}&tf=${tf}`);
    candles = j.ok ? j.candles : [];
    $('#chEmpty').textContent = j.busy ? 'The chart data source is busy. It refreshes on its own in a moment.' : candles.length < 2 ? 'No candles yet: nobody has traded it on a pool the data sources index.' : '';
    $('#chPool').textContent = j.pool ? `pool ${short(j.pool)}` : '';
    $('#chMeta').textContent = candles.length ? `${candles.length} candles` : '';
    draw();
  }
  $('#tfs').innerHTML = TFS.map(t => `<button type="button" role="tab" data-tf="${t}">${t}</button>`).join('');
  $('#tfs').addEventListener('click', e => { const b = e.target.closest('[data-tf]'); if (!b) return; tf = b.dataset.tf; paintTf(); chart(); });
  const paintTf = () => document.querySelectorAll('#tfs button').forEach(b => { b.classList.toggle('on', b.dataset.tf === tf); b.setAttribute('aria-selected', String(b.dataset.tf === tf)); });

  /* ---------- activity: trades, holders, the fee split ---------- */
  let act = 'trades', seenTx = new Set(), holdersCache = null;
  function actTabs() {
    const t = tok(), list = [['trades', 'Trades']].concat(MINT !== WSOL ? [['holders', 'Holders']] : []).concat(t.kind === 'forks' ? [['split', 'Fee split']] : []);
    $('#actTabs').innerHTML = list.map(([k, n]) => `<button type="button" role="tab" data-k="${k}" class="${k === act ? 'on' : ''}">${n}</button>`).join('');
    $('#actTabs').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; act = b.dataset.k; actTabs(); panel(); };
  }
  async function panel() {
    const P = $('#actPanel');
    if (act === 'trades') {
      const j = await api(`/api/trades?mint=${MINT}`);
      if (act !== 'trades') return;
      const list = j.ok ? j.trades : [];
      if (!list.length) { P.innerHTML = `<div class="blank" style="padding:32px"><p>${j.busy ? 'The trade feed is busy; it refreshes on its own.' : 'No trades seen yet.'}</p></div>`; return; }
      const fresh = seenTx.size > 0;
      P.innerHTML = `<div class="tlist"><div class="tl-h"><span>Time</span><span>Side</span><span class="r">$${esc(tok().symbol)}</span><span class="r w">USD</span><span class="r">Wallet</span></div>${list.map(x => {
        const isNew = fresh && !seenTx.has(x.tx);
        return `<div class="tl-r${isNew ? ' new' : ''}"><span class="muted">${x.t ? ago(x.t) : ''}</span><span class="${x.side === 'buy' ? 'up' : 'dn'}">${x.side}</span><span class="r">${big(x.amount)}</span><span class="r w">${usd(x.usd)}</span><span class="r"><a href="https://solscan.io/tx/${esc(x.tx)}" target="_blank" rel="noopener">${esc(short(x.wallet || x.tx))}</a></span></div>`;
      }).join('')}</div>`;
      list.forEach(x => seenTx.add(x.tx));
      return;
    }
    if (act === 'holders') {
      if (!holdersCache) { P.innerHTML = '<div class="blank" style="padding:32px"><span class="thinking"><i></i><i></i><i></i> Reading the chain…</span></div>'; holdersCache = await api(`/api/holders?mint=${MINT}`); }
      if (act !== 'holders') return;
      const j = holdersCache;
      if (!j.ok) { P.innerHTML = `<div class="blank" style="padding:32px"><p>${j.error === 'not_configured' ? 'Holders appear once the site is connected to Solana.' : 'Couldn’t read the holders just now.'}</p></div>`; holdersCache = null; return; }
      const me = W.state().connected, max = Math.max(...j.holders.map(h => h.pct), 1);
      P.innerHTML = `<div class="tlist">${j.holders.map((h, i) => `<div class="hl-r"><span class="muted">${i + 1}</span><span><a href="https://solscan.io/account/${esc(h.owner || h.account)}" target="_blank" rel="noopener">${esc(h.label || short(h.owner || h.account))}</a>${me && h.owner === me.address ? ' <span class="label green">you</span>' : ''}<span class="bar"><i style="width:${(h.pct / max) * 100}%"></i></span></span><span class="r">${h.pct.toFixed(2)}%</span></div>`).join('')}</div>`;
      return;
    }
    if (act === 'split') {
      const s = tok().split || [];
      P.innerHTML = `<div class="box-b">${F.splitRows(s)}<p class="muted" style="margin:12px 0 0;font-size:13px">Locked on-chain when the coin was created; nobody can change it. People claim their part on <a href="https://pump.fun/coin/${esc(MINT)}" target="_blank" rel="noopener">pump.fun</a> by signing in with GitHub.</p></div>`;
    }
  }

  /* ---------- trade ---------- */
  let side = 'buy', slip = C.trade.slippageBps, bal = null, quoteT = 0, quoteSeq = 0, busy = false, lastQuote = null;
  function tradeBox() {
    const t = tok(), q = Q();
    $('#trade').innerHTML = `<div class="tabbar" role="tablist"><button type="button" role="tab" class="buy" data-side="buy">Buy</button><button type="button" role="tab" class="sell" data-side="sell">Sell</button></div>
      <div class="trade-b">
        ${info.trading ? '' : '<div class="flash warn">Trading opens once the site is connected to Solana.</div>'}
        <div class="bal"><span>You pay</span><span>Balance <b id="bal">—</b></span></div>
        <div class="amt"><label class="sr" for="amt">Amount</label><input id="amt" inputmode="decimal" placeholder="0.0" autocomplete="off"><span class="unit" id="unit"></span></div>
        <div class="quick" id="quick"></div>
        <div class="qv wait" id="qv"><div class="big"><span>You receive</span><b id="qOut">—</b></div><div><span>Minimum</span><b id="qMin">—</b></div><div id="qImpRow"><span>Price impact</span><b id="qImp">—</b></div><div><span>Route</span><b id="qRoute">—</b></div></div>
        <div class="slip"><span>Slippage <b class="mono" id="slipV"></b></span><button type="button" id="slipB">change</button></div>
        <div class="slip-set" id="slipSet" hidden>${[100, 300, 500, 1000, 2000].map(b => `<button type="button" data-b="${b}">${b / 100}%</button>`).join('')}</div>
        <button class="btn primary go" type="button" id="go">Connect a wallet</button>
        <div class="tstate" id="tstate" role="status"></div>
      </div>`;
    const paintSide = () => {
      document.querySelectorAll('#trade [data-side]').forEach(b => b.classList.toggle('on', b.dataset.side === side));
      $('#unit').textContent = side === 'buy' ? q.symbol : '$' + t.symbol;
      $('#quick').innerHTML = side === 'buy'
        ? (q.symbol === 'SOL' ? C.trade.quickBuy.map(v => `<button type="button" data-v="${v}">${v} SOL</button>`) : [10, 50, 100].map(v => `<button type="button" data-v="${v}">${v} ${q.symbol}</button>`)).join('')
        : [25, 50, 100].map(p => `<button type="button" data-p="${p}">${p}%</button>`).join('');
      const go = $('#go'); go.classList.toggle('sell', side === 'sell');
      $('#amt').value = ''; resetQuote(); paintGo(); paintBal();
    };
    document.querySelectorAll('#trade [data-side]').forEach(b => b.addEventListener('click', () => { side = b.dataset.side; paintSide(); }));
    $('#quick').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) $('#amt').value = b.dataset.v;
      else if (b.dataset.p && bal) { const raw = BigInt(bal.token || '0') * BigInt(b.dataset.p) / 100n; $('#amt').value = String(fromRaw(raw.toString(), dec())); }
      paintGo(); quote();
    });
    $('#amt').addEventListener('input', () => { $('#amt').value = $('#amt').value.replace(/[^0-9.,]/g, '').slice(0, 24); clearTimeout(quoteT); quoteT = setTimeout(quote, 450); paintGo(); });
    $('#slipB').addEventListener('click', () => { $('#slipSet').hidden = !$('#slipSet').hidden; });
    $('#slipSet').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (!b) return; slip = Number(b.dataset.b); paintSlip(); quote(); });
    $('#go').addEventListener('click', go);
    paintSlip(); paintSide();
    W.onChange(() => { paintGo(); loadBal(); });
    loadBal();
  }
  const paintSlip = () => { $('#slipV').textContent = `${slip / 100}%`; document.querySelectorAll('#slipSet button').forEach(b => b.classList.toggle('on', Number(b.dataset.b) === slip)); };
  function paintGo() {
    const go = $('#go'); if (!go || busy) return;
    const s = W.state().connected, v = Number(String($('#amt').value || '').replace(',', '.'));
    go.disabled = !!s && !(v > 0) || !info.trading;
    go.textContent = !s ? 'Connect a wallet' : !(v > 0) ? 'Enter an amount' : `${side === 'buy' ? 'Buy' : 'Sell'} $${tok().symbol}`;
  }
  function paintBal() {
    const el = $('#bal'); if (!el) return;
    if (!bal) { el.textContent = W.state().connected ? '…' : '—'; return; }
    const q = Q();
    el.textContent = side === 'buy'
      ? (q.symbol === 'SOL' ? `${fromRaw(bal.lamports, 9).toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL` : `${fromRaw(bal.quoteToken || '0', 6).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${q.symbol}`)
      : `${big(fromRaw(bal.token || '0', dec()))} $${tok().symbol}`;
  }
  async function loadBal() {
    const s = W.state().connected; bal = null; paintBal();
    if (!s || !info.trading) return;
    const j = await api(`/api/balance?owner=${s.address}&mint=${MINT}`);
    if (j.ok) { bal = j; if (MINT === WSOL) bal.token = j.lamports; paintBal(); }
  }
  function resetQuote() { lastQuote = null; $('#qv').classList.add('wait'); ['qOut', 'qMin', 'qImp', 'qRoute'].forEach(k => { $('#' + k).textContent = '—'; }); $('#qImpRow').classList.remove('warn'); }
  function amountRaw() {
    const v = String($('#amt').value || '').trim(); if (!v || !(Number(v.replace(',', '.')) > 0)) return null;
    return toRaw(v, side === 'buy' ? Q().decimals : dec());
  }
  function showQuote(j) {
    const outDec = side === 'buy' ? dec() : Q().decimals, outSym = side === 'buy' ? '$' + tok().symbol : Q().symbol;
    $('#qOut').textContent = `${big(fromRaw(j.outAmount, outDec))} ${outSym}`;
    $('#qMin').textContent = `${big(fromRaw(j.minOut || j.outAmount, outDec))} ${outSym}`;
    $('#qImp').textContent = j.impact != null ? `${Number(j.impact).toFixed(2)}%` : '—';
    $('#qImpRow').classList.toggle('warn', j.impact != null && j.impact > 5);
    $('#qRoute').textContent = j.route === 'pump' ? 'pump.fun curve' : `Jupiter${j.venues && j.venues.length ? ' · ' + j.venues.slice(0, 2).join(', ') : ''}${j.feeBps ? ` · fee ${j.feeBps / 100}%` : ''}`;
    $('#qv').classList.remove('wait');
  }
  async function quote() {
    const raw = amountRaw(); const seq = ++quoteSeq;
    if (!raw || !info.trading) { resetQuote(); return; }
    $('#qOut').textContent = '…';
    const j = await api(`/api/trade/quote?mint=${MINT}&side=${side}&amount=${raw}&slippageBps=${slip}`);
    if (seq !== quoteSeq) return;
    if (!j.ok) { resetQuote(); $('#qOut').textContent = j.error === 'no_route' ? 'no route' : j.error === 'too_small' ? 'too small' : j.error === 'busy' ? 'busy, retrying…' : '—'; if (j.error === 'busy') setTimeout(quote, 2500); return; }
    lastQuote = j; showQuote(j);
  }
  function state(msg, cls) { const el = $('#tstate'); el.className = 'tstate' + (cls ? ' ' + cls : ''); el.innerHTML = msg; }
  async function go() {
    if (busy) return;
    if (!W.state().connected) {
      const ws = await W.list();
      if (!ws.length) { if (W.mobile()) { location.href = W.openIn(location.href)[0][1]; return; } state('No Solana wallet in this browser. Install Phantom, Solflare or Backpack.', 'err'); return; }
      try { await W.connect(ws[0].name); } catch (e) { state(e.code === 'rejected' ? 'Connection cancelled.' : 'Couldn’t connect the wallet.', 'err'); }
      return;
    }
    const raw = amountRaw(); if (!raw) return;
    const me = W.state().connected;
    busy = true; const btn = $('#go'); btn.classList.add('busy'); state('Getting a fresh quote…');
    try {
      const b = await api('/api/trade/build', { mint: MINT, side, amount: raw, slippageBps: slip, owner: me.address });
      if (!b.ok) { state({ no_route: 'No route for this trade right now.', too_small: 'That amount is too small.', busy: 'The router is busy. Try again in a moment.', rate_limited: 'Too many tries. Give it a minute.' }[b.error] || 'Couldn’t build the trade. Try again.', 'err'); return; }
      showQuote(b);
      state(`Sign in ${esc(me.name)}…`);
      let signed;
      try { [signed] = await W.sign([b.tx]); }
      catch (e) { state(e.code === 'rejected' ? 'Cancelled in the wallet. Nothing was sent.' : 'The wallet couldn’t sign. Nothing was sent.', 'err'); return; }
      state('Sending…');
      const s = await api('/api/trade/send', b.route === 'jupiter' ? { route: 'jupiter', requestId: b.requestId, tx: signed } : { route: 'pump', ticket: b.ticket, tx: signed });
      if (!s.ok || !s.signature) { state(s.error === 'send_failed' ? `The network refused it: ${esc((s.why || '').slice(0, 120))}` : s.error === 'expired' ? 'That took too long. Try again.' : s.why ? `It didn’t land: ${esc(String(s.why).slice(0, 120))}` : 'It didn’t land. Nothing changed. Try again.', 'err'); return; }
      const link = `<a href="https://solscan.io/tx/${esc(s.signature)}" target="_blank" rel="noopener">view on Solscan ↗</a>`;
      if (b.route === 'jupiter') state(`Done. ${link}`, 'ok');
      else {
        state(`Sent, confirming… ${link}`);
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 1500));
          const t = await api('/api/tx?sig=' + s.signature);
          if (t.ok && t.state === 'confirmed') { state(`Confirmed. ${link}`, 'ok'); break; }
          if (t.ok && t.state === 'failed') { state(`It failed on-chain (slippage or price moved). ${link}`, 'err'); break; }
        }
      }
      $('#amt').value = ''; resetQuote(); loadBal(); holdersCache = null; setTimeout(() => { if (act === 'trades') panel(); }, 2500);
      const r = $('#trade').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 80);
    } finally { busy = false; btn.classList.remove('busy'); paintGo(); }
  }
  function burst(x, y) {
    if (RM()) return;
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('i'), a = (i / 10) * Math.PI * 2, r = 30 + Math.random() * 20;
      d.style.cssText = `position:fixed;z-index:60;left:${x}px;top:${y}px;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--acc);pointer-events:none`;
      document.body.appendChild(d);
      d.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => d.remove();
    }
  }

  /* ---------- boot ---------- */
  async function boot() {
    if (!MINT) { $('#cnH').innerHTML = '<div class="blank" style="width:100%"><h3>No coin here</h3><p>Pick one from the market.</p><a class="btn primary" href="/market">Open the market</a></div>'; return; }
    const j = await api('/api/coin?mint=' + encodeURIComponent(MINT));
    if (!j.ok) {
      $('#cnH').innerHTML = `<div class="blank" style="width:100%"><h3>${j.error === 'unknown' ? 'No market for this address' : 'Couldn’t read this coin'}</h3><p>${j.error === 'unknown' ? 'The terminal opens coins launched on forks, the project tokens, and any Solana token with a live market. This address has none we can see.' : 'Try again in a minute.'}</p><a class="btn primary" href="/market">Open the market</a></div>`;
      return;
    }
    info = j;
    head(); about(); $('#term').hidden = false; $('#buybar').hidden = false;
    tf = info.curve && info.curve.onCurve ? '1m' : '15m'; paintTf();
    tradeBox(); actTabs(); panel(); chart();
    $('#buybar').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; side = b.dataset.s; document.querySelector(`#trade [data-side="${side}"]`).click(); $('#trade').scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' }); setTimeout(() => $('#amt').focus({ preventScroll: true }), 400); });
    setInterval(() => { if (document.hidden) return; chart(); if (act === 'trades') panel(); }, 20000);
    setInterval(async () => { if (document.hidden) return; const k = await api('/api/coin?mint=' + encodeURIComponent(MINT)); if (k.ok) { info = { ...info, market: k.market, curve: k.curve }; const m = k.market || {}; const px = $('#pxNow'); if (px && m.price != null) px.textContent = usd(m.price); } }, 30000);
  }
  boot();
})();
