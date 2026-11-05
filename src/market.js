/* forks — the market. On top, what's trending on Solana (Jupiter's list), with forks' own pinned coin first.
   Below, one list: the coins launched on repositories here, the project tokens on the graph, and Solana's top
   tokens — filtered with chips, sorted, searched. Every row opens the token's terminal. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, SH = window.ForksShell, esc = SH.esc;
  const $ = s => document.querySelector(s);
  const usd = n => (n == null || !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : n > 0 ? `$${SH.tiny(n)}` : '$0');
  const pct = c => (c == null ? '—' : `${c >= 0 ? '+' : ''}${Number(c).toFixed(1)}%`);
  const ago = t => { if (!t) return ''; const s = (Date.now() - Date.parse(t)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const REPO = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>';
  const CHECK = '<svg class="vf" viewBox="0 0 16 16" fill="currentColor" aria-label="verified by Jupiter"><path d="m9.585.52.929.68c.153.112.331.186.518.215l1.138.175a2.678 2.678 0 0 1 2.24 2.24l.174 1.139c.029.187.103.365.215.518l.68.928a2.677 2.677 0 0 1 0 3.17l-.68.928a1.174 1.174 0 0 0-.215.518l-.175 1.138a2.678 2.678 0 0 1-2.241 2.241l-1.138.175a1.17 1.17 0 0 0-.518.215l-.928.68a2.677 2.677 0 0 1-3.17 0l-.928-.68a1.174 1.174 0 0 0-.518-.215L3.83 14.41a2.678 2.678 0 0 1-2.24-2.24l-.175-1.138a1.17 1.17 0 0 0-.215-.518l-.68-.928a2.677 2.677 0 0 1 0-3.17l.68-.928c.112-.153.186-.331.215-.518l.175-1.14a2.678 2.678 0 0 1 2.24-2.24l1.139-.175c.187-.029.365-.103.518-.215l.928-.68a2.677 2.677 0 0 1 3.17 0ZM7.303 1.728l-.927.68a2.67 2.67 0 0 1-1.18.489l-1.137.174a1.179 1.179 0 0 0-.987.987l-.174 1.136a2.677 2.677 0 0 1-.489 1.18l-.68.928a1.18 1.18 0 0 0 0 1.394l.68.927c.256.348.424.753.489 1.18l.174 1.137c.078.509.478.909.987.987l1.136.174a2.67 2.67 0 0 1 1.18.489l.928.68c.414.305.979.305 1.394 0l.927-.68a2.67 2.67 0 0 1 1.18-.489l1.137-.174a1.18 1.18 0 0 0 .987-.987l.174-1.136a2.67 2.67 0 0 1 .489-1.18l.68-.928a1.176 1.176 0 0 0 0-1.394l-.68-.927a2.686 2.686 0 0 1-.489-1.18l-.174-1.137a1.179 1.179 0 0 0-.987-.987l-1.136-.174a2.677 2.677 0 0 1-1.18-.489l-.928-.68a1.176 1.176 0 0 0-1.394 0ZM11.28 6.78l-3.75 3.75a.75.75 0 0 1-1.06 0L4.72 8.78a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l1.22 1.22 3.22-3.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>';
  const PIN = String((C.market && C.market.pinRepo) || '').toLowerCase();
  const KINDS = ['all', 'coins', 'projects', 'top'];
  const legacy = { trending: 'top', projects: 'projects', coins: 'coins' };
  const qs = new URLSearchParams(location.search), asked = qs.get('tab');
  let data = null, feed = null, kind = KINDS.includes(asked) ? asked : legacy[asked] || 'all', shown = 60;

  // every token once: a coin launched here wins over a project token, which wins over Jupiter's row for it
  function everything() {
    if (!data) return [];
    const seen = new Map();
    const add = (t, k) => { if (!t || !t.mint || seen.has(t.mint)) return; seen.set(t.mint, { ...t, kind: k, pinned: k === 'forks' && PIN && String(t.repo || '').toLowerCase() === PIN }); };
    data.coins.forEach(t => add(t, 'forks'));
    data.projects.forEach(t => add(t, 'project'));
    ((feed && feed.top) || []).forEach(t => add(t, 'token'));
    return [...seen.values()];
  }
  const inKind = (t, k) => k === 'all' || (k === 'coins' && t.kind === 'forks') || (k === 'projects' && t.kind === 'project') || (k === 'top' && t.kind === 'token');

  function rows() {
    if (!data) return;
    const q = $('#mkQ').value.trim().toLowerCase().replace(/^\$/, ''), sort = $('#mkSort').value;
    const all = everything();
    $('#nAll').textContent = all.length;
    $('#nCoins').textContent = all.filter(t => t.kind === 'forks').length;
    $('#nProjects').textContent = all.filter(t => t.kind === 'project').length;
    $('#nTop').textContent = feed ? all.filter(t => t.kind === 'token').length : '·';
    let list = all.filter(t => inKind(t, kind));
    if (q) list = list.filter(t => [t.symbol, t.name, t.repo, t.owner, t.mint].filter(Boolean).some(s => String(s).toLowerCase().includes(q)));
    const v = t => t.market || {}, rank = t => (t.pinned ? 0 : t.kind === 'forks' ? 1 : 2);
    const by = {
      default: (a, b) => rank(a) - rank(b) || (a.kind === 'forks' && b.kind === 'forks' ? Date.parse(b.live_at || 0) - Date.parse(a.live_at || 0) : (v(b).mcap || 0) - (v(a).mcap || 0)),
      mcap: (a, b) => (v(b).mcap || 0) - (v(a).mcap || 0),
      vol: (a, b) => (v(b).volume24 || 0) - (v(a).volume24 || 0),
      change: (a, b) => (v(b).change24 == null ? -1e9 : v(b).change24) - (v(a).change24 == null ? -1e9 : v(a).change24),
      liq: (a, b) => (v(b).liquidity || 0) - (v(a).liquidity || 0),
      new: (a, b) => Date.parse(b.live_at || b.created || 0) - Date.parse(a.live_at || a.created || 0),
      curve: (a, b) => ((b.curve && b.curve.progress) || -1) - ((a.curve && a.curve.progress) || -1)
    }[sort] || (() => 0);
    list.sort(by);
    // the pinned coin stays first whatever the sort
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    const host = $('#mkRows'), more = $('#mkMore');
    if (!list.length) {
      host.innerHTML = kind === 'coins' && !q
        ? `<div class="blank"><h3>No coins yet</h3><p>Every repository can have one. Its creator fees go to the people who wrote the code, for good.</p><a class="btn primary" href="/launch">Launch the first one</a></div>`
        : kind === 'top' && !feed ? '<div class="blank"><span class="thinking"><i></i><i></i><i></i> Reading Solana’s top tokens…</span></div>'
        : `<div class="blank"><h3>Nothing matches</h3><p>Try a ticker, a name, a repository or an address.</p></div>`;
      more.hidden = true; return;
    }
    host.innerHTML = list.slice(0, shown).map(row).join('');
    more.hidden = list.length <= shown;
    more.querySelector('button').textContent = `Show ${Math.min(60, list.length - shown)} more`;
  }
  function row(t) {
    const m = t.market || {}, cv = t.curve, k = t.kind;
    const sub = k === 'project' ? `<span class="label blue">project</span>${esc(t.owner)}`
      : k === 'token' ? `${t.verified ? CHECK : ''}${esc(t.name || '')}${m.liquidity ? ` · liq ${usd(m.liquidity)}` : ''}`
      : `${REPO}${esc(t.repo)}${t.live_at ? ` · ${ago(t.live_at)}` : ''}`;
    return `<a class="mk-r${t.pinned ? ' pinned' : ''}" href="/coin/${esc(t.mint)}">
        <span class="mk-id"><span class="mk-img">${SH.logo(t.image || m.image, t.symbol)}</span>
          <span class="mk-n"><b><span>$${esc(t.symbol)}</span>${t.pinned ? '<span class="label amber">pinned</span>' : k === 'forks' ? '<span class="tok forks" style="height:18px">forks</span>' : ''}</b><small>${sub}</small>
          ${cv && k === 'forks' ? `<span class="prog${cv.complete ? ' done' : ''}" title="bonding curve ${cv.progress != null ? Math.round(cv.progress) + '%' : ''}"><i style="width:${Math.max(2, cv.progress || 0)}%"></i></span>` : ''}</span></span>
        <span class="mk-v">${m.price != null ? usd(m.price) : '—'}<small class="hide-m">${cv && k === 'forks' ? (cv.complete ? 'graduated' : `curve ${cv.progress != null ? Math.round(cv.progress) : 0}%`) : ''}</small></span>
        <span class="mk-v hide-m">${usd(m.mcap)}</span>
        <span class="mk-v ${m.change24 == null ? '' : m.change24 >= 0 ? 'up' : 'dn'}">${pct(m.change24)}</span>
        <span class="mk-v hide-m">${m.volume24 ? usd(m.volume24) : '—'}</span>
        <span class="mk-act"><span class="btn sm">Trade</span></span>
      </a>`;
  }

  /* ---------- trending: the pinned coin, then Jupiter's trending tokens ---------- */
  function strip() {
    const pinned = everything().find(t => t.pinned);
    const list = (pinned ? [pinned] : []).concat(((feed && feed.trending) || []).filter(t => !pinned || t.mint !== pinned.mint)).slice(0, 16);
    const host = $('#trendRow');
    if (!list.length) { if (feed) host.innerHTML = '<p class="muted trend-none">Nothing trending right now.</p>'; return; }
    host.innerHTML = list.map((t, i) => {
      const m = t.market || {}, ch = m.change1 != null ? m.change1 : m.change24, lab = m.change1 != null ? '1h' : '24h';
      return `<a class="trend-c${t.pinned ? ' pinned' : ''}" href="/coin/${esc(t.mint)}">
        <span class="tc-top"><span class="mk-img">${SH.logo(t.image || m.image, t.symbol)}</span><span class="tc-n"><b>$${esc(t.symbol)}</b><small>${t.pinned ? 'pinned · forks' : `#${i + (pinned ? 0 : 1)} trending`}</small></span></span>
        <span class="tc-p">${m.price != null ? usd(m.price) : '—'}</span>
        <span class="tc-c ${ch == null ? '' : ch >= 0 ? 'up' : 'dn'}">${pct(ch)} <small>${lab}</small></span>
      </a>`;
    }).join('');
    $('#trendSrc').textContent = feed && feed.source === 'jupiter' ? 'Jupiter · last hour' : feed && feed.source ? 'GeckoTerminal' : '';
  }

  function tabs() {
    document.querySelectorAll('.seg [data-k]').forEach(b => { b.classList.toggle('on', b.dataset.k === kind); b.setAttribute('aria-selected', String(b.dataset.k === kind)); });
    const s = $('#mkSort');
    s.querySelector('[value="curve"]').hidden = !(kind === 'coins' || kind === 'all');
    if (s.querySelector(`[value="${s.value}"]`).hidden) s.value = 'default';
    shown = 60; rows();
  }
  document.querySelectorAll('.seg [data-k]').forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.k; const u = new URL(location.href); if (kind !== 'all') u.searchParams.set('tab', kind); else u.searchParams.delete('tab'); history.replaceState(null, '', u); tabs();
  }));
  $('#mkQ').addEventListener('input', () => { shown = 60; rows(); });
  $('#mkSort').addEventListener('change', rows);
  $('#mkMore button').addEventListener('click', () => { shown += 60; rows(); });

  async function load(fresh) {
    const j = await SH.market(fresh);
    if (!j) { if (!data) $('#mkRows').innerHTML = '<div class="blank"><h3>The market isn’t answering</h3><p>Try again in a minute.</p></div>'; return; }
    data = j; tabs(); strip();
  }
  async function loadFeed() {
    try { const j = await fetch('/api/trending').then(r => r.json()); if (j && j.ok) feed = { trending: j.trending || j.tokens || [], top: j.top || [], source: j.source }; }
    catch (_) { }
    if (!feed) feed = { trending: [], top: [], source: null };
    rows(); strip();
  }
  load();
  loadFeed();
  setInterval(() => { if (document.hidden) return; load(true); }, 30000);
  setInterval(() => { if (!document.hidden) loadFeed(); }, 120000);
})();
