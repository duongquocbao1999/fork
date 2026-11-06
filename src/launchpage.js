/* forks — the launch page: pick a repository (search or paste), see who gets its creator fees, name the
   coin and launch it. The form itself is ForksLaunch.form, the same one the chat uses. */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, L = C.launch, F = window.ForksLaunch, SH = window.ForksShell;
  const $ = s => document.querySelector(s), esc = SH.esc;
  const AS = new URLSearchParams(location.search).get('as') || ''; // forks' treasury, for its own repository
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const kfmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n || 0));
  const pct = bps => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
  const REPO_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>';
  const LANG = { 'C++': '#f34b7d', C: '#555555', Go: '#00ADD8', Rust: '#dea584', Python: '#3572A5', TypeScript: '#3178c6', JavaScript: '#f1e05a', Java: '#b07219', Swift: '#F05138', Ruby: '#701516', Solidity: '#AA6746', Zig: '#ec915c' };

  // the default split, for the sidebar
  const S = L.split;
  $('#defSplit').innerHTML = `<dl class="kv" style="margin:0">
    <dt>Owner <span class="muted">or an org's top ${L.orgContributors}</span></dt><dd>${pct(S.owner)}</dd>
    <dt>Top ${L.contributors} contributors</dt><dd>${pct(S.contributors)}</dd>
    <dt>Parent repo's owner</dt><dd>${pct(S.ancestors[0])}</dd>
    <dt>Grandparent</dt><dd>${pct(S.ancestors[1])}</dd>
    <dt>One more up</dt><dd>${pct(S.ancestors[2])}</dd>
    <dt>forks</dt><dd>${pct(S.forks)}</dd></dl>
    <p class="muted" style="margin:8px 0 0;font-size:12px">An empty part goes to the owner. The same person in two parts gets both.</p>`;

  // a few crypto repositories to try, different on every visit (so not everyone starts from the same one)
  const POOL = ['bitcoin/bitcoin', 'ethereum/go-ethereum', 'anza-xyz/agave', 'jito-foundation/jito-solana', 'solana-foundation/anchor',
    'litecoin-project/litecoin', 'dogecoin/dogecoin', 'monero-project/monero', 'ethereum/solidity', 'foundry-rs/foundry', 'paradigmxyz/reth',
    'OpenZeppelin/openzeppelin-contracts', 'Uniswap/v4-core', 'aave/aave-v3-core', 'MetaMask/metamask-extension', 'wevm/viem', 'ethers-io/ethers.js',
    'metaplex-foundation/mpl-core', 'pyth-network/pyth-crosschain', 'wormhole-foundation/wormhole', 'drift-labs/protocol-v2', 'orca-so/whirlpools',
    'raydium-io/raydium-amm', 'firedancer-io/firedancer', 'MystenLabs/sui', 'aptos-labs/aptos-core', 'near/nearcore', 'cosmos/cosmos-sdk',
    'paritytech/polkadot-sdk', 'starkware-libs/cairo', 'ton-blockchain/ton', 'zcash/zcash', 'lightningnetwork/lnd', 'ElementsProject/lightning',
    'bitcoinjs/bitcoinjs-lib', 'ethereum-optimism/optimism', 'OffchainLabs/nitro', 'matter-labs/zksync-era', 'celestiaorg/celestia-node',
    'solana-labs/solana-program-library', 'helium/helium-program-library', 'jup-ag/jupiter-quote-api-node', 'tensor-foundation/marketplace',
    'magicblock-labs/bolt', 'kamino-finance/klend', 'meteoraAg/dlmm-sdk', 'marinade-finance/liquid-staking-program', 'solana-developers/program-examples',
    'blockworks-foundation/mango-v4', 'sigp/lighthouse', 'prysmaticlabs/prysm', 'ethereum/consensus-specs', 'bitcoin/bips', 'ethereum/EIPs', 'smartcontractkit/chainlink'];
  const starts = POOL.map(r => [Math.random(), r]).sort((a, b) => a[0] - b[0]).slice(0, 4).map(x => x[1]);
  $('#lpChips').innerHTML = '<span class="lp-try-k">Try</span>' + starts.map(r => `<button class="chip" type="button" data-r="${esc(r)}">${esc(r)}</button>`).join('');
  $('#lpChips').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) choose(b.dataset.r); });

  /* ---------- the picker ---------- */
  const inp = $('#repoIn'), sugg = $('#sugg');
  let t = 0, items = [], sel = -1, current = null;
  function showSugg(list) {
    items = list; sel = -1;
    sugg.hidden = !list.length; inp.setAttribute('aria-expanded', String(!!list.length));
    sugg.innerHTML = list.map((r, i) => `<button type="button" role="option" data-i="${i}">${REPO_ICON}<span><b>${esc(r.name)}</b><small>${esc(r.desc || '')}</small></span><span class="st">★ ${kfmt(r.stars)}</span></button>`).join('');
  }
  sugg.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)].name); });
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const v = inp.value.trim();
    if (v.length < 2) return showSugg([]);
    const direct = F.repoOf(v);
    t = setTimeout(async () => {
      if (direct && /\//.test(v)) { showSugg([]); return; }
      try {
        const j = await fetch('/api/repos/search?q=' + encodeURIComponent(v)).then(r => r.json());
        if (inp.value.trim() === v) showSugg((j.items || []).slice(0, 8));
      } catch (_) { showSugg([]); }
    }, 280);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return; e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      sugg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === sel));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel >= 0 && items[sel]) return choose(items[sel].name);
      const r = F.repoOf(inp.value); if (r) choose(r); else if (items[0]) choose(items[0].name);
    } else if (e.key === 'Escape') showSugg([]);
  });
  addEventListener('pointerdown', e => { if (!e.target.closest('.pick')) showSugg([]); });
  $('#pickForm').addEventListener('submit', e => {
    e.preventDefault();
    const r = F.repoOf(inp.value);
    if (r) choose(r); else if (items[0]) choose(items[0].name); else { inp.focus(); SH.toast('Paste a repository: owner/name or a github.com link.'); }
  });
  // the season, in one line under the picker (the whole of it is further down)
  if (window.ForksSeason) {
    const paintS = () => { const h = window.ForksSeason.strip().replace('href="/launch#season"', 'href="#season"'); $('#lpSeason').innerHTML = h; };
    paintS(); window.ForksSeason.onChange(paintS);
  }

  /* ---------- a repository chosen ---------- */
  async function choose(repo) {
    showSugg([]); inp.value = repo; current = repo;
    const u = new URL(location.href); u.searchParams.set('repo', repo); history.replaceState(null, '', u);
    const box = $('#repoBox');
    $('#splitStep').hidden = true; $('#coinStep').hidden = true;
    box.innerHTML = `<div class="box"><div class="box-b muted"><span class="thinking"><i></i><i></i><i></i> Reading ${esc(repo)} from GitHub…</span></div></div>`;
    const [j, info] = await Promise.all([
      F.api('/api/launch/plan?repo=' + encodeURIComponent(repo) + (AS ? '&as=' + encodeURIComponent(AS) : '')),
      fetch('/api/repos?r=' + encodeURIComponent(repo)).then(r => r.json().then(j => (r.ok ? j : null), () => null)).catch(() => null)
    ]);
    if (current !== repo) return;
    const d = info && info.repos ? info.repos[repo] || Object.values(info.repos)[0] : null;
    const name = (j.plan && j.plan.repo) || (d && d.name) || repo, [o, n] = name.split('/');
    const proj = C.projectOf(name);
    const head = `<div class="repo-card"><div class="rn">${REPO_ICON}<a href="https://github.com/${esc(name)}" target="_blank" rel="noopener"><span style="font-weight:400">${esc(o)} / </span>${esc(n)}</a>${proj ? `<span class="tok project">$${esc(proj.symbol)}</span>` : ''}</div>
      ${d && d.desc ? `<p>${esc(d.desc)}</p>` : ''}
      ${d ? `<div class="rm">${d.lang ? `<span><i style="background:${LANG[d.lang] || 'var(--ink-3)'}"></i>${esc(d.lang)}</span>` : ''}<span>★ ${fmt(d.stars)}</span><span>${fmt(d.forks)} forks</span>${d.created ? `<span>since ${String(d.created).slice(0, 4)}</span>` : ''}${d.archived ? '<span class="label amber">archived</span>' : ''}</div>` : ''}</div>`;
    const say = (cls, html) => { box.innerHTML = `<div class="box">${head}<div class="box-row" style="border-top:1px solid var(--rule)"><div class="${cls}" style="width:100%">${html}</div></div></div>`; };
    if (j.ok) {
      box.innerHTML = `<div class="box">${head}</div>`;
      $('#splitBox').innerHTML = F.splitRows(j.plan.holders) + ((j.plan.line || []).length ? `<div class="ln-line" style="margin-top:8px">up the line: ${j.plan.line.map(x => `<b>${esc(x.repo)}</b>${x.via === 'github fork' ? ' <span>(github fork)</span>' : ''}`).join(' → ')}</div>` : '');
      $('#splitStep').hidden = false; $('#coinStep').hidden = false;
      F.form($('#formBox'), name, j, { split: false, box: $('#coinStep').querySelector('.box'), onLive: coin => { setTimeout(() => { location.href = '/coin/' + coin.mint; }, 1600); } });
      return;
    }
    if (j.error === 'taken') {
      const coin = j.coin || {};
      return say('', `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="tok forks">$${esc(coin.symbol || '')}</span><span>This repository already has its coin. One per repository.</span><a class="btn primary sm" href="/coin/${esc(coin.mint)}" style="margin-left:auto">Open the terminal</a></div>`);
    }
    if (j.error === 'not_configured' || j.error === 'offline') return say('flash warn', 'Launches open soon. The split below is how it will work.') || preview(name);
    if (j.error === 'reserved') return say('flash warn', `Reserved for the official ${esc(j.ticker || C.token.ticker)} coin, which isn’t launched yet. Nobody else can launch on forks’ own repository — anything called ${esc(j.ticker || C.token.ticker)} elsewhere isn’t it. <a href="https://x.com/${esc(C.x.handle)}" target="_blank" rel="noopener">Follow @${esc(C.x.handle)}</a> for the launch.`);
    const why = {
      in_flight: 'Someone is launching this repository’s coin right now. Try again in a few minutes.',
      blocked: 'The owner asked for no coins on their code.',
      not_found: 'GitHub doesn’t know this repository. Check the spelling.',
      no_people: 'No people to pay on this repository: only bots and organizations.',
      bad_repo: 'That isn’t a repository name. Use owner/name.',
      rate_limited: 'Too many at once. Give it a minute.'
    }[j.error] || 'Couldn’t read this repository just now. Try again in a minute.';
    say('flash err', esc(why));
  }
  function preview(name) {
    $('#splitBox').innerHTML = `<p class="muted" style="margin:0 0 8px">The parts for ${esc(name)}, once launches open:</p>` + $('#defSplit').innerHTML;
    $('#splitStep').hidden = false;
  }

  const first = new URLSearchParams(location.search).get('repo');
  if (first && F.repoOf(first)) choose(F.repoOf(first)); else if (matchMedia('(pointer: fine)').matches) inp.focus();
})();
