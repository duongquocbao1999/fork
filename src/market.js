/* forks — the market: coins launched on repositories, the project tokens on the graph, and Solana's trending
   tokens, in one list that filters, sorts and refreshes itself. Each row opens the token's terminal. */
(function () {
  'use strict';
  const SH = window.ForksShell, esc = SH.esc;
  const $ = s => document.querySelector(s);
  const usd = n => (n == null || !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : n > 0 ? `$${SH.tiny(n)}` : '$0');
  const pct = c => (c == null ? '—' : `${c >= 0 ? '+' : ''}${Number(c).toFixed(1)}%`);
  const ago = t => { if (!t) return ''; const s = (Date.now() - Date.parse(t)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const REPO = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>';
  const TABS = ['coins', 'projects', 'trending'];
  let data = null, trend = null, kind = TABS.includes(new URLSearchParams(location.search).get('tab')) ? new URLSearchParams(location.search).get('tab') : 'coins';
  const listOf = k => (k === 'coins' ? data.coins : k === 'projects' ? data.projects : trend || []);

  function rows() {
    if (!data) return;
    const q = $('#mkQ').value.trim().toLowerCase(), sort = $('#mkSort').value;
    if (kind === 'trending' && !trend) { $('#mkRows').innerHTML = '<div class="blank"><span class="thinking"><i></i><i></i><i></i> Reading what’s trending…</span></div>'; return; }
    let list = listOf(kind).map((t, i) => ({ ...t, rank: i })).slice();
    if (q) list = list.filter(t => [t.symbol, t.name, t.repo, t.owner].filter(Boolean).some(s => String(s).toLowerCase().includes(q.replace(/^\$/, ''))));
    const v = t => t.market || {};
    const by = {
      trend: (a, b) => a.rank - b.rank,
      new: (a, b) => Date.parse(b.live_at || b.created || 0) - Date.parse(a.live_at || a.created || 0),
      liq: (a, b) => (v(b).liquidity || 0) - (v(a).liquidity || 0),
      mcap: (a, b) => (v(b).mcap || 0) - (v(a).mcap || 0),
      vol: (a, b) => (v(b).volume24 || 0) - (v(a).volume24 || 0),
      change: (a, b) => (v(b).change24 == null ? -1e9 : v(b).change24) - (v(a).change24 == null ? -1e9 : v(a).change24),
      curve: (a, b) => ((b.curve && b.curve.progress) || 0) - ((a.curve && a.curve.progress) || 0)
    }[sort];
    if (by) list.sort(by);
    const host = $('#mkRows');
    if (!list.length) {
      host.innerHTML = kind === 'coins' && !q
        ? `<div class="blank"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0Z"/></svg><h3>No coins yet</h3><p>Every repository can have one. Its creator fees go to the people who wrote the code, for good.</p><a class="btn primary" href="/launch">Launch the first one</a></div>`
        : kind === 'trending' && !q ? `<div class="blank"><h3>Nothing trending right now</h3><p>GeckoTerminal didn’t answer. Try again in a minute.</p></div>`
        : `<div class="blank"><h3>Nothing matches</h3><p>Try a ticker or a repository name.</p></div>`;
      return;
    }
    host.innerHTML = list.map(t => {
      const m = t.market || {}, proj = t.kind === 'project', other = t.kind === 'token', cv = t.curve;
      const sub = proj ? `<span class="label blue">project token</span>${esc(t.owner)}`
        : other ? `<span class="label">#${t.rank + 1} trending</span>${esc(t.name || '')}${m.liquidity ? ` · liq ${usd(m.liquidity)}` : ''}${t.created ? ` · ${ago(t.created)}` : ''}`
        : `${REPO}${esc(t.repo)}${t.live_at ? ` · ${ago(t.live_at)}` : ''}`;
      return `<a class="mk-r" href="/coin/${esc(t.mint)}">
        <span class="mk-id"><span class="mk-img">${SH.logo(t.image || m.image, t.symbol)}</span>
          <span class="mk-n"><b><span>$${esc(t.symbol)}</span>${proj || other ? '' : '<span class="tok forks" style="height:18px">forks</span>'}</b><small>${sub}</small>
          ${cv && !proj && !other ? `<span class="prog${cv.complete ? ' done' : ''}" title="bonding curve ${cv.progress != null ? Math.round(cv.progress) + '%' : ''}"><i style="width:${Math.max(2, cv.progress || 0)}%"></i></span>` : ''}</span></span>
        <span class="mk-v">${m.price != null ? usd(m.price) : '—'}<small class="hide-m">${cv && !proj && !other ? (cv.complete ? 'graduated' : `curve ${cv.progress != null ? Math.round(cv.progress) : 0}%`) : ''}</small></span>
        <span class="mk-v hide-m">${usd(m.mcap)}</span>
        <span class="mk-v ${m.change24 == null ? '' : m.change24 >= 0 ? 'up' : 'dn'}">${pct(m.change24)}</span>
        <span class="mk-v hide-m">${m.volume24 ? usd(m.volume24) : '—'}</span>
        <span class="mk-act"><span class="btn sm">Trade</span></span>
      </a>`;
    }).join('');
  }
  function tabs() {
    document.querySelectorAll('.seg [data-k]').forEach(b => { b.classList.toggle('on', b.dataset.k === kind); b.setAttribute('aria-selected', String(b.dataset.k === kind)); });
    const s = $('#mkSort'), hide = (v, h) => { s.querySelector(`[value="${v}"]`).hidden = h; };
    hide('new', kind === 'projects'); hide('curve', kind !== 'coins'); hide('trend', kind !== 'trending');
    if (s.querySelector(`[value="${s.value}"]`).hidden) s.value = kind === 'trending' ? 'trend' : kind === 'projects' ? 'mcap' : 'new';
    if (!s.dataset.user) s.value = kind === 'trending' ? 'trend' : kind === 'projects' ? 'mcap' : 'new';
    if (kind === 'trending' && !trend) loadTrend();
    rows();
  }
  document.querySelectorAll('.seg [data-k]').forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.k; const u = new URL(location.href); if (kind !== 'coins') u.searchParams.set('tab', kind); else u.searchParams.delete('tab'); history.replaceState(null, '', u); delete $('#mkSort').dataset.user; tabs();
  }));
  $('#mkQ').addEventListener('input', rows);
  $('#mkSort').addEventListener('change', () => { $('#mkSort').dataset.user = '1'; rows(); });

  async function load(fresh) {
    const j = await SH.market(fresh);
    if (!j) { if (!data) $('#mkRows').innerHTML = '<div class="blank"><h3>The market isn’t answering</h3><p>Try again in a minute.</p></div>'; return; }
    const first = !data;
    data = j;
    $('#nCoins').textContent = j.coins.length; $('#nProjects').textContent = j.projects.length;
    // no coins yet: open on the project tokens, and say so
    if (first && !j.coins.length && !new URLSearchParams(location.search).get('tab')) {
      kind = 'projects';
      const f = document.createElement('div'); f.className = 'flash'; f.style.marginBottom = '16px';
      f.innerHTML = 'No coins launched yet. Every repository can have one, and its creator fees go to the people who wrote the code. <a href="/launch">Launch the first one →</a>';
      $('#mk').before(f);
    }
    tabs();
  }
  // trending: its own endpoint (GeckoTerminal, cached two minutes on the server)
  let trendBusy = false;
  async function loadTrend() {
    if (trendBusy) return; trendBusy = true;
    try { const j = await fetch('/api/trending').then(r => r.json()); trend = j && j.ok ? j.tokens || [] : trend || []; }
    catch (_) { trend = trend || []; }
    trendBusy = false;
    $('#nTrending').textContent = trend.length;
    if (kind === 'trending') rows();
  }
  load();
  loadTrend();
  setInterval(() => { if (document.hidden) return; load(true); if (kind === 'trending') loadTrend(); }, 30000);
})();
