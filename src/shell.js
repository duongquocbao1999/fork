/* forks — the frame every page shares: the header (brand, where you are, search, invite, $FORK, wallet,
   X, theme), the tab bar (Graph · Market · Launch · Guide), the footer, the toast and the wallet menu.
   Pages call ForksShell.mount({ page, crumb }) once. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, W = window.ForksWallet;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MARK = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20V3.6"/><path d="M9 14.4C9 10 15.4 10.5 15.4 6.8"/><circle class="d" cx="9" cy="20" r="2.4"/><circle class="e" cx="15.4" cy="5.1" r="1.8"/></svg>';
  const I = {
    graph: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>',
    market: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>',
    launch: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 1 1 2.12 2.12Zm6.94-3.935c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 0 0 .119-.213ZM3.678 8.116 5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 0 0-.213.119l-1.2 1.95ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
    guide: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>',
    invite: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.9 8.548h-.001a5.528 5.528 0 0 1 3.1 4.659.75.75 0 1 1-1.498.086A4.01 4.01 0 0 0 5.5 9.5a4.01 4.01 0 0 0-4.001 3.793.75.75 0 1 1-1.498-.085 5.527 5.527 0 0 1 3.1-4.66 3.5 3.5 0 1 1 4.799 0ZM13.25 0a.75.75 0 0 1 .75.75V2h1.25a.75.75 0 0 1 0 1.5H14v1.25a.75.75 0 0 1-1.5 0V3.5h-1.25a.75.75 0 0 1 0-1.5h1.25V.75A.75.75 0 0 1 13.25 0ZM3.5 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"/></svg>',
    wallet: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.5 9.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM1 3.75A1.75 1.75 0 0 1 2.75 2h9.5A1.75 1.75 0 0 1 14 3.75V5h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 14H2.75A1.75 1.75 0 0 1 1 12.25Zm1.5 0V5h10V3.75a.25.25 0 0 0-.25-.25h-9.5a.25.25 0 0 0-.25.25Zm0 2.75v5.75c0 .138.112.25.25.25h11.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>',
    theme: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/></svg>',
    gh: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>'
  };
  const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  let page = 'graph';

  /* ---------- theme (before paint) ---------- */
  try { const t = localStorage.getItem('forks-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (_) { }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('forks-theme', next); } catch (_) { }
  }

  /* ---------- toast ---------- */
  let toastT = 0;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; t.classList.remove('out');
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.hidden = true; }, 300); }, 3200);
  }

  /* ---------- search: a mint opens its terminal, anything else is traced on the graph ---------- */
  function search(q) {
    q = String(q || '').trim(); if (!q) return;
    if (MINT.test(q) && !q.includes('/')) { location.href = '/coin/' + q; return; }
    if (page === 'graph' && window.ForksApp) { window.ForksApp.send(q); return; }
    location.href = '/?q=' + encodeURIComponent(q);
  }

  /* ---------- the wallet button and its menu ---------- */
  let menu = null, balT = 0;
  function paintWallet() {
    const b = $('#walletBtn'); if (!b) return;
    const s = W.state().connected;
    b.innerHTML = s ? `${s.icon ? `<img src="${esc(s.icon)}" alt="">` : '<i class="dotg"></i>'}<span class="mono">${esc(s.short)}</span>` : `${I.wallet}<span class="lbl">Connect</span>`;
    b.setAttribute('aria-label', s ? `Wallet ${s.short}` : 'Connect a Solana wallet');
    if (!s && menu) closeMenu();
  }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  async function openMenu() {
    const s = W.state().connected; if (!s) return;
    closeMenu();
    menu = document.createElement('div'); menu.className = 'wmenu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="wm-h">${esc(s.name)}</div><div class="wm-a">${s.icon ? `<img src="${esc(s.icon)}" width="20" height="20" alt="">` : ''}<span>${esc(s.short)}</span></div>
      <div class="wm-b"><span class="muted">balance</span><b class="mono" data-bal>…</b></div><hr>
      <button class="wm-i" type="button" data-a="copy">Copy address</button>
      <a class="wm-i" href="https://solscan.io/account/${esc(s.address)}" target="_blank" rel="noopener" style="display:block;padding:8px;border-radius:6px;color:var(--ink)">View on Solscan</a>
      <button class="wm-i" type="button" data-a="off">Disconnect</button>`;
    document.body.appendChild(menu);
    menu.querySelector('[data-a="copy"]').onclick = async () => { try { await navigator.clipboard.writeText(s.address); toast('Address copied.'); } catch (_) { toast(s.address); } closeMenu(); };
    menu.querySelector('[data-a="off"]').onclick = () => { W.disconnect(); closeMenu(); };
    try {
      const r = await fetch('/api/balance?owner=' + encodeURIComponent(s.address)).then(r => r.json());
      const el = menu && menu.querySelector('[data-bal]');
      if (el) el.textContent = r.ok ? `${(Number(r.lamports) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL` : '—';
    } catch (_) { const el = menu && menu.querySelector('[data-bal]'); if (el) el.textContent = '—'; }
  }
  async function walletClick() {
    if (W.state().connected) return menu ? closeMenu() : openMenu();
    const ws = await W.list();
    if (!ws.length) {
      if (W.mobile()) { location.href = W.openIn(location.href)[0][1]; return; }
      toast('No Solana wallet in this browser. Install Phantom, Solflare or Backpack.'); return;
    }
    try { await W.connect(ws.length === 1 ? ws[0].name : (await pickWallet(ws))); }
    catch (e) { if (e && e.code !== 'picked_none') toast(e.code === 'rejected' ? 'Connection cancelled.' : 'Couldn’t connect that wallet.'); }
  }
  function pickWallet(ws) {
    return new Promise((res, rej) => {
      closeMenu();
      menu = document.createElement('div'); menu.className = 'wmenu';
      menu.innerHTML = `<div class="wm-h">Connect a wallet</div>` + ws.map(w => `<button class="wm-i" type="button" data-w="${esc(w.name)}">${w.icon ? `<img src="${esc(w.icon)}" width="20" height="20" alt="">` : ''}${esc(w.name)}</button>`).join('');
      document.body.appendChild(menu);
      menu.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) { closeMenu(); res(b.dataset.w); } });
      const away = e => { if (menu && !menu.contains(e.target) && !e.target.closest('#walletBtn')) { removeEventListener('pointerdown', away, true); closeMenu(); rej(Object.assign(new Error('none'), { code: 'picked_none' })); } };
      addEventListener('pointerdown', away, true);
    });
  }
  addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !e.target.closest('#walletBtn')) closeMenu(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* ---------- mount ---------- */
  function mount(o) {
    page = o.page || 'graph';
    const hd = document.createElement('header'); hd.className = 'hd';
    const tab = (id, href, label, icon, extra = '') => `<a class="tab${page === id ? ' on' : ''}" href="${href}"${page === id ? ' aria-current="page"' : ''}>${I[icon]}${label}${extra}</a>`;
    hd.innerHTML = `<div class="hd-row">
        <a class="hd-brand" href="/" aria-label="forks home">${MARK}<span>forks</span></a>
        ${o.crumb ? `<span class="hd-crumb">/ <b>${esc(o.crumb)}</b></span>` : ''}
        <div class="hd-search"><form role="search" id="hdSearch"><label class="sr" for="hdQ">Search repositories and coins</label>${I.search}<input id="hdQ" type="search" placeholder="Trace a repo or paste a coin address" autocomplete="off" spellcheck="false"><kbd>/</kbd></form></div>
        <div class="hd-acts">
          <button class="pill icon" type="button" id="invBtn" aria-label="Invite friends: +2,000 ${esc(C.token.ticker)} each" title="Invite">${I.invite}</button>
          <button class="pill me" type="button" id="meBtn" hidden></button>
          <button class="pill wbtn" type="button" id="walletBtn"></button>
          ${C.links.x ? `<a class="pill icon" id="xLink" href="${esc(C.links.x)}" target="_blank" rel="noopener" aria-label="forks on X">${I.x}</a>` : ''}
          <button class="pill icon" type="button" id="themeBtn" aria-label="Switch light or dark">${I.theme}</button>
        </div>
      </div>
      <nav class="tabs" aria-label="Site">${tab('graph', '/', 'Graph', 'graph')}${tab('market', '/market', 'Market', 'market', ' <span class="counter" id="mkCount" hidden></span>')}${tab('launch', '/launch', 'Launch', 'launch')}${tab('guide', '/guide', 'Guide', 'guide')}</nav>`;
    document.body.prepend(hd);
    const ft = document.createElement('footer'); ft.className = 'foot';
    ft.innerHTML = `${MARK}<span>forks — the family tree of open-source code, and the tokens on it.</span><span class="sp"></span><a href="/guide">Guide</a><a href="/market">Market</a>${C.links.github ? `<a href="${esc(C.links.github)}" target="_blank" rel="noopener">Source</a>` : ''}${C.links.x ? `<a href="${esc(C.links.x)}" target="_blank" rel="noopener">@${esc(C.x.handle)}</a>` : ''}<span>Not financial advice · not affiliated with GitHub, pump.fun or the projects shown</span>`;
    if (o.footer !== false) (document.querySelector('main') || document.body).appendChild(ft);

    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#walletBtn').addEventListener('click', walletClick);
    $('#hdSearch').addEventListener('submit', e => { e.preventDefault(); search($('#hdQ').value); $('#hdQ').value = ''; $('#hdQ').blur(); });
    if (page !== 'graph') {
      $('#invBtn').addEventListener('click', () => { location.href = '/?run=invite'; });
      const me = $('#meBtn'); me.hidden = false; me.innerHTML = `<b class="mono" style="color:var(--warn)">${esc(C.token.ticker)}</b>`; me.setAttribute('aria-label', `${C.token.ticker}: sign in for the trials`);
      me.addEventListener('click', () => { location.href = '/?run=freeforks'; });
    }
    addEventListener('keydown', e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
      const target = page === 'graph' && $('#inp') ? $('#inp') : $('#hdQ');
      if (target && target.offsetParent !== null) { e.preventDefault(); target.focus(); }
      else if ($('#hdQ') && $('#hdQ').offsetParent !== null) { e.preventDefault(); $('#hdQ').focus(); }
    });
    W.onChange(paintWallet); paintWallet();
    W.resume();
    // how many coins the market holds, on the tab (the pages reuse the same answer)
    market().then(j => {
      if (!j) return;
      const n = (j.coins || []).length + (j.projects || []).length, c = $('#mkCount');
      if (c && n) { c.textContent = n; c.hidden = false; }
    });
  }
  let marketP = null;
  const market = (fresh) => (!fresh && marketP) || (marketP = fetch('/api/market').then(r => r.json().then(j => (r.ok ? j : null), () => null)).then(j => (j && j.ok ? j : null)).catch(() => null));

  // tiny prices the way terminals write them: 0.0₅4194 = 0.000004194
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function tiny(a, d = 4) {
    if (!(a > 0)) return '0';
    if (a >= 0.001) return a.toPrecision(d).replace(/0+$/, '').replace(/\.$/, '');
    const z = -Math.floor(Math.log10(a)) - 1;
    return '0.0' + String(z).split('').map(c => SUB[c]).join('') + Math.round(a * 10 ** (z + d)).toString().slice(0, d).replace(/0+$/, '');
  }

  window.ForksShell = { mount, toast, search, market, tiny, esc, MARK, I };
})();
