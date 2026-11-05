/* forks — coins on repositories. Anyone with a Solana wallet can launch the coin for a repository on
   pump.fun from here; its creator fees are split once, for good, between the people behind the code
   (paid to their GitHub accounts, claimed on pump.fun) and forks. The server decides the split from GitHub
   and the traced line and builds every byte; the page shows it, the wallet signs it.

   /launch owner/name   the coin on a repository, or the way to launch it
   /coins               the newest coins
   ?launch=owner/name   the same, from a link (the "open in your wallet" round trip lands here) */
(function () {
  'use strict';
  const C = window.FORKS_CONFIG, L = C.launch, W = window.ForksWallet;
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, RM() ? 0 : ms));
  const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
  const SYMBOL = /^[A-Z0-9]{2,10}$/;
  const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20V3.6"/><path d="M9 14.4C9 10 15.4 10.5 15.4 6.8"/><circle cx="9" cy="20" r="2.4"/><circle cx="15.4" cy="5.1" r="1.8"/></svg>';
  let ctx, esc;
  const seen = new Map(); // lower(owner/name) → { at, coin|null }
  const coinListeners = [], walletViews = new Set();

  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const pct = bps => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
  const usd = n => (n == null ? '' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}m` : n >= 1e3 ? `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `$${Math.round(n)}`);
  const short = a => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
  const links = mint => [['pump.fun', `https://pump.fun/coin/${mint}`], ['dexscreener', `https://dexscreener.com/solana/${mint}`], ['solscan', `https://solscan.io/token/${mint}`]];
  const shareUrl = repo => `${C.site.url}/?launch=${repo}`;

  function repoOf(s) {
    const m = String(s || '').trim().match(/(?:^|github\.com\/)([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})/i);
    if (!m) return null;
    const r = `${m[1]}/${m[2].replace(/\.git$/i, '')}`;
    return NAME.test(r) ? r : null;
  }
  async function api(path, body) {
    let r;
    try { r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: { accept: 'application/json' } }); }
    catch (_) { return { ok: false, error: 'network' }; }
    let j = null; try { j = await r.json(); } catch (_) { }
    if (!j) return { ok: false, error: r.status === 404 || r.status === 405 ? 'offline' : 'server', status: r.status };
    j.status = r.status; return j;
  }

  /* ---------- which repositories have coins ---------- */
  async function tokens(repos, fresh) {
    const want = [...new Set(repos.map(String))].filter(r => NAME.test(r)).slice(0, 24);
    const todo = want.filter(r => { const e = seen.get(r.toLowerCase()); return fresh || !e || Date.now() - e.at > 60e3; });
    if (todo.length) {
      const j = await api('/api/tokens?repos=' + encodeURIComponent(todo.join(',')));
      if (j && j.ok) {
        const now = Date.now();
        for (const r of todo) seen.set(r.toLowerCase(), { at: now, coin: null });
        for (const t of j.tokens || []) seen.set(String(t.repo).toLowerCase(), { at: now, coin: t });
      }
    }
    const out = new Map();
    for (const r of want) { const e = seen.get(r.toLowerCase()); if (e && e.coin) out.set(r.toLowerCase(), e.coin); }
    return out;
  }
  const known = repo => { const e = seen.get(String(repo).toLowerCase()); return e ? e.coin : undefined; };
  function landed(coin) {
    seen.set(String(coin.repo).toLowerCase(), { at: Date.now(), coin });
    coinListeners.forEach(f => { try { f(coin); } catch (_) { } });
  }

  /* ---------- chat helpers ---------- */
  async function say(text, follow) {
    const m = ctx.addUp(); m.src.hidden = false; m.src.textContent = 'coins';
    await sleep(320); await ctx.type(m.txt, text);
    if (follow && follow.length) {
      const d = document.createElement('div'); d.className = 'follow';
      d.innerHTML = follow.map(f => `<button class="chip" type="button">${esc(f)}</button>`).join('');
      d.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) ctx.send(b.textContent); });
      m.body.appendChild(d);
    }
    ctx.scrollDown(); return m;
  }
  function card(m, cls, head, body) {
    const el = document.createElement('div'); el.className = 'card ' + cls;
    el.innerHTML = `<div class="card-h">${head}</div><div class="card-b">${body}</div>`;
    m.cards.appendChild(el); ctx.scrollDown(); return el;
  }

  /* ---------- the split, as rows ---------- */
  const ROLE = { owner: 'owner', maintainer: 'maintainer', contributor: 'contributor', parent: 'parent', grandparent: 'grandparent', ancestor: 'up the line', forks: 'forks.wiki' };
  const UP = ['parent', 'grandparent', 'ancestor'];
  function roleText(h) {
    const r = (h.roles || []).map(x => ROLE[x] || x).join(' · ');
    return (h.roles || []).some(x => UP.includes(x)) && h.repo ? `${r} · ${h.repo}` : r;
  }
  function splitRows(holders) {
    const max = Math.max(...holders.map(h => h.bps));
    return `<ul class="ln-split">${holders.map(h => {
      const av = h.kind === 'wallet' ? `<span class="ln-av fk">${MARK}</span>` : `<span class="ln-av"><img src="${esc(h.avatar ? h.avatar + (h.avatar.includes('?') ? '&' : '?') + 's=64' : `https://github.com/${encodeURIComponent(h.login)}.png?size=64`)}" alt="" width="28" height="28" loading="lazy" decoding="async"></span>`;
      const who = h.kind === 'wallet' ? `<b>forks</b>` : `<a href="https://github.com/${encodeURIComponent(h.login)}" target="_blank" rel="noopener"><b>@${esc(h.login)}</b></a>`;
      return `<li class="${h.kind === 'wallet' ? 'fk' : ''}">${av}<span class="ln-who">${who}<span>${esc(roleText(h))}</span></span><span class="ln-p mono">${pct(h.bps)}</span><i style="--w:${(h.bps / max).toFixed(3)}"></i></li>`;
    }).join('')}</ul>`;
  }
  function previewHolders(repo) {
    const owner = repo.split('/')[0], S = L.split;
    return [
      { kind: 'github', login: owner, roles: ['owner'], bps: S.owner },
      { kind: 'github', login: 'top contributors', roles: ['contributor'], bps: S.contributors, ghost: true },
      { kind: 'github', login: 'the parent', roles: ['parent'], bps: S.ancestors[0], ghost: true },
      { kind: 'github', login: 'grandparent', roles: ['grandparent'], bps: S.ancestors[1], ghost: true },
      { kind: 'github', login: 'one more up', roles: ['ancestor'], bps: S.ancestors[2], ghost: true },
      { kind: 'wallet', login: 'forks', roles: ['forks'], bps: S.forks }
    ];
  }
  function previewRows(repo) {
    const hs = previewHolders(repo), max = Math.max(...hs.map(h => h.bps)), owner = repo.split('/')[0];
    const ROLE2 = { owner: `the owner — or an organization's top ${L.orgContributors} people`, contributor: `its top ${L.contributors} contributors`, parent: 'the repo it forked from, its owner', grandparent: 'one further up the line', ancestor: 'one more up the line', forks: 'forks.wiki' };
    return `<ul class="ln-split">${hs.map((h, i) => {
      const av = h.kind === 'wallet' ? `<span class="ln-av fk">${MARK}</span>` : i === 0 ? `<span class="ln-av"><img src="https://github.com/${encodeURIComponent(owner)}.png?size=64" alt="" width="28" height="28" loading="lazy"></span>` : `<span class="ln-av ghost"></span>`;
      return `<li class="${h.kind === 'wallet' ? 'fk' : ''}">${av}<span class="ln-who"><b>${i === 0 ? '@' + esc(owner) : esc(h.login)}</b><span>${esc(ROLE2[h.roles[0]])}</span></span><span class="ln-p mono">${pct(h.bps)}</span><i style="--w:${(h.bps / max).toFixed(3)}"></i></li>`;
    }).join('')}</ul>`;
  }

  /* ---------- a logo in the family style: the line it came from, in the coin's own seed ---------- */
  function rng(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  }
  let fontsP = null;
  const fonts = () => fontsP || (fontsP = Promise.all([document.fonts.load('900 120px Anybody'), document.fonts.load('500 22px "JetBrains Mono"')]).catch(() => null));
  async function drawLogo(cv, repo, symbol, seed) {
    await fonts();
    const S = 512, g = cv.getContext('2d'), rnd = rng(repo.toLowerCase() + '#' + seed);
    cv.width = S; cv.height = S;
    g.fillStyle = '#0A0D0C'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(231,236,233,.07)';
    for (let x = 16; x < S; x += 32) for (let y = 16; y < 352; y += 32) { g.beginPath(); g.arc(x, y, 1.4, 0, 7); g.fill(); }
    const n = 4 + Math.floor(rnd() * 2), x0 = 62, x1 = 418, pts = [];
    let y = 130 + rnd() * 120;
    for (let i = 0; i < n; i++) { pts.push([x0 + (x1 - x0) * i / (n - 1), y]); y = Math.max(86, Math.min(286, y + (rnd() - .5) * 170)); }
    const curve = (a, b) => { const dx = b[0] - a[0]; g.moveTo(a[0], a[1]); g.bezierCurveTo(a[0] + dx * .6, a[1], a[0] + dx * .4, b[1], b[0], b[1]); };
    const dot = (p, r, fill, stroke, w) => { g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = w; g.strokeStyle = stroke; g.stroke(); } };
    g.lineCap = 'round';
    // the repo's glow first, so the line runs into it; side branches peel off away from it
    const t = pts[n - 1], glow = g.createRadialGradient(t[0], t[1], 0, t[0], t[1], 96);
    glow.addColorStop(0, 'rgba(232,180,90,.5)'); glow.addColorStop(1, 'rgba(232,180,90,0)');
    g.fillStyle = glow; g.fillRect(t[0] - 96, t[1] - 96, 192, 192);
    const ends = [];
    g.strokeStyle = 'rgba(162,172,167,.42)'; g.lineWidth = 7;
    for (let i = 0; i < n - 2; i++) if (rnd() < .85) {
      const a = pts[i], up = a[1] > 190 ? -1 : a[1] < 130 ? 1 : (rnd() < .5 ? -1 : 1);
      const b = [Math.min(t[0] - 60, a[0] + 80 + rnd() * 90), Math.max(56, Math.min(318, a[1] + up * (52 + rnd() * 66)))];
      g.beginPath(); curve(a, b); g.stroke(); ends.push(b);
    }
    g.strokeStyle = '#6EE7B7'; g.lineWidth = 11;
    g.beginPath(); for (let i = 0; i < n - 1; i++) curve(pts[i], pts[i + 1]); g.stroke();
    for (const b of ends) dot(b, 9, '#0A0D0C', 'rgba(162,172,167,.75)', 5);
    pts.slice(0, -1).forEach((p, i) => dot(p, i === 0 ? 16 : 12, '#0A0D0C', '#6EE7B7', 7));
    dot(t, 23, '#E8B45A');
    const txt = '$' + (symbol || 'COIN');
    let size = 150; const font = s => `900 ${s}px Anybody, "Arial Black", sans-serif`;
    g.font = font(size); while (g.measureText(txt).width > S - 96 && size > 36) { size -= 4; g.font = font(size); }
    g.fillStyle = '#E7ECE9'; g.textBaseline = 'alphabetic'; g.fillText(txt, 46, 452);
    g.font = '500 22px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = '#7C8681';
    g.fillText(repo.length > 34 ? repo.slice(0, 33) + '…' : repo, 48, 490);
  }
  function drawUpload(cv, file) {
    return new Promise((res, rej) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 12e6) return rej(new Error('type'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const S = 512, g = cv.getContext('2d'); cv.width = S; cv.height = S;
        const k = Math.max(S / img.naturalWidth, S / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
        g.fillStyle = '#0A0D0C'; g.fillRect(0, 0, S, S); g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        URL.revokeObjectURL(url); res();
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load')); };
      img.src = url;
    });
  }
  const tickerOf = repo => {
    const [o, n] = repo.split('/'); let t = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.length < 2) t = (o.toUpperCase().replace(/[^A-Z0-9]/g, '') + t);
    return t.slice(0, 10).padEnd(2, 'X');
  };

  /* ---------- the wallet button, shared by every open launch card ---------- */
  W.onChange(() => walletViews.forEach(f => f()));

  /* ---------- /launch owner/name ---------- */
  async function run(arg) {
    if (/^coins?$/i.test(String(arg || '').trim())) return recent();
    const repo = repoOf(arg);
    if (!repo) return say(`which repository? type /launch owner/name, or tap any point on a tree and pick “launch a coin”.`, ['/coins']);
    const m = ctx.addUp(); m.src.hidden = false; m.src.textContent = 'coins';
    m.txt.innerHTML = '<span class="thinking"><i></i><i></i><i></i> reading the split</span>';
    const j = await api('/api/launch/plan?repo=' + encodeURIComponent(repo));
    if (j.ok) return launchCard(m, j.plan.repo, j);
    if (j.error === 'taken') {
      const map = await tokens([repo], true), coin = map.get(repo.toLowerCase()) || { repo, ...j.coin };
      await ctx.type(m.txt, `${coin.repo} already has its coin: $${coin.symbol}. one coin per repository, so this is the one.`);
      return coinCard(m, coin);
    }
    if (j.error === 'not_configured' || j.error === 'offline') return previewCard(m, repo);
    const why = {
      in_flight: `someone is launching ${repo}'s coin right now. give it a few minutes, then /launch ${repo} again.`,
      blocked: `${repo}'s owner asked for no coins on their code, so there won't be one here.`,
      not_found: `github doesn't know ${repo}. check the spelling, or trace it first.`,
      no_people: `no people to pay on ${repo}: only bots and organizations. no coin for it.`,
      bad_repo: `that isn't a repository name. try /launch owner/name.`,
      rate_limited: `too many at once. give it a minute.`,
      network: `couldn't reach forks.wiki just now. check the connection and try again.`
    }[j.error] || `couldn't read ${repo} from github just now. try again in a minute.`;
    await ctx.type(m.txt, why);
  }

  function previewCard(m, repo) {
    ctx.type(m.txt, `coins on repositories open soon. here's how the coin for ${repo} would split its creator fees, once and for good:`).then(() => {
      card(m, 'ln preview', `<span>// launch · <b>${esc(repo)}</b> · <b class="demo">preview</b></span>`,
        `<div class="ln-k">creator fees · locked at launch</div>${previewRows(repo)}
        <p class="q-note">anyone with a solana wallet will launch a repository's coin on pump.fun from here. one coin per repository. people claim their part on pump.fun by signing in with their github; the authors don't need to do anything first.</p>
        <div class="ln-go"><button class="q-btn" type="button" disabled>launches open soon</button></div>`);
    });
  }

  async function launchCard(m, repo, j) {
    let plan = j.plan, ticket = j.ticket, ticketAt = Date.now();
    const who = plan.holders.some(h => h.kind === 'github' && h.roles.includes('owner')) ? 'the people who wrote it' : 'the people who keep it';
    const line = (plan.line || []).filter(x => x.repo);
    await ctx.type(m.txt, `the coin for ${repo}, on pump.fun. its creator fees are split once and locked: ${who}, ${line.length ? 'the line it came from, ' : ''}and ${pct(L.split.forks)} to forks. they claim on pump.fun with their github.`);
    const sym0 = tickerOf(repo), name0 = repo.split('/')[1].slice(0, 32);
    const el = card(m, 'ln', `<span>// launch · <b>${esc(repo)}</b></span>${plan.stars != null ? `<span class="mono">★ ${fmt(plan.stars)}</span>` : ''}`, `
      <div class="ln-k">creator fees · locked at launch</div>
      ${splitRows(plan.holders)}
      ${line.length ? `<div class="ln-line">up the line: ${line.map(x => `<b>${esc(x.repo)}</b>${x.via === 'github fork' ? ' <span>(github fork)</span>' : ''}`).join(' → ')}</div>` : ''}
      <div class="ln-k">the coin</div>
      <div class="ln-form">
        <div class="ln-logo"><canvas width="512" height="512" role="img" aria-label="The coin's logo"></canvas>
          <div class="ln-la"><button type="button" data-a="re">another</button><label>upload<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div></div>
        <div class="ln-fields">
          <label class="ln-f"><span>ticker</span><span class="ln-tk"><i>$</i><input class="q-in" name="symbol" value="${esc(sym0)}" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false"></span></label>
          <label class="ln-f"><span>name</span><input class="q-in" name="name" value="${esc(name0)}" maxlength="32" autocomplete="off" spellcheck="false"></label>
        </div>
      </div>
      <label class="ln-ok"><input type="checkbox" name="ok"><span>i get it: the split is locked forever, nobody can change it. the authors didn't make or endorse this coin. not financial advice.</span></label>
      <div class="ln-go"><button class="q-btn" type="button" data-a="go">connect a wallet</button><span class="ln-w"></span></div>
      <div class="ln-ws" hidden></div>
      <p class="q-note ln-cost">your wallet pays pump.fun's account rent, ${plan.holders.filter(h => h.kind === 'github').length > 0 ? 'any missing github fee accounts, ' : ''}and a ${L.tipSol} SOL tip, and shows the total before you sign. one coin per repository · ${L.perDay} a day per wallet.</p>
      <ol class="ln-steps" hidden></ol>`);
    const $ = s => el.querySelector(s);
    const cv = $('canvas'), symIn = $('[name="symbol"]'), nameIn = $('[name="name"]'), okIn = $('[name="ok"]'), go = $('[data-a="go"]');
    let seed = 0, uploaded = false, busy = false, drawT = 0;
    const redraw = () => { if (!uploaded) drawLogo(cv, repo, symIn.value.toUpperCase(), seed); };
    redraw();
    symIn.addEventListener('input', () => {
      const v = symIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (v !== symIn.value) symIn.value = v;
      clearTimeout(drawT); drawT = setTimeout(redraw, 120); paint();
    });
    $('[data-a="re"]').addEventListener('click', () => { uploaded = false; seed++; redraw(); });
    $('input[type="file"]').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { await drawUpload(cv, f); uploaded = true; } catch (_) { ctx.toast('That image won’t load. PNG or JPEG, please.'); }
      e.target.value = '';
    });

    // the wallet: connect, pick, or open the page inside one
    const wEl = $('.ln-w'), wsEl = $('.ln-ws');
    function paint() {
      const s = W.state().connected;
      go.textContent = s ? `launch $${symIn.value || '…'}` : 'connect a wallet';
      wEl.innerHTML = s ? `${s.icon ? `<img src="${esc(s.icon)}" alt="" width="16" height="16">` : ''}<span class="mono">${esc(s.short)}</span><button type="button" data-a="off">switch</button>` : '';
      const off = wEl.querySelector('[data-a="off"]'); if (off) off.onclick = () => W.disconnect();
    }
    walletViews.add(paint); paint();
    async function connect() {
      const ws = await W.list();
      if (!ws.length) {
        const here = shareUrl(repo);
        wsEl.hidden = false;
        wsEl.innerHTML = W.mobile()
          ? `<p class="q-note">no solana wallet in this browser. open this page inside your wallet's app, then launch from there:</p><div class="ln-wb">${W.openIn(here).map(([n, u]) => `<a class="q-btn ghost" href="${esc(u)}" rel="noopener">open in ${esc(n)} ↗</a>`).join('')}</div>`
          : `<p class="q-note">no solana wallet in this browser. install one, reload, and come back:</p><div class="ln-wb">${W.install.map(([n, u]) => `<a class="q-btn ghost" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}</div>`;
        ctx.scrollDown(); return null;
      }
      let name = ws[0].name;
      if (ws.length > 1) {
        wsEl.hidden = false;
        wsEl.innerHTML = `<p class="q-note">which wallet?</p><div class="ln-wb">${ws.map(w => `<button class="q-btn ghost" type="button" data-w="${esc(w.name)}">${w.icon ? `<img src="${esc(w.icon)}" alt="" width="18" height="18">` : ''}${esc(w.name)}</button>`).join('')}</div>`;
        ctx.scrollDown();
        name = await new Promise(res => wsEl.querySelectorAll('[data-w]').forEach(b => { b.onclick = () => res(b.dataset.w); }));
      }
      wsEl.hidden = true;
      try { return await W.connect(name); }
      catch (e) { ctx.toast(e.code === 'rejected' ? 'Wallet connection cancelled.' : 'Couldn’t connect that wallet.'); return null; }
    }

    // the steps, shown as they happen
    const stepsEl = $('.ln-steps');
    const STEPS = [['build', 'logo and metadata to ipfs · transactions built'], ['sign', 'sign in your wallet'], ['send', 'to solana as one bundle: all of it lands, or none'], ['land', 'reading the coin and its split back from the chain']];
    function steps() {
      stepsEl.hidden = false;
      stepsEl.innerHTML = STEPS.map(([k, t]) => `<li data-s="${k}"><i></i><span>${esc(t)}</span><em></em></li>`).join('');
    }
    function step(k, st, text, note) {
      const li = stepsEl.querySelector(`[data-s="${k}"]`); if (!li) return;
      li.className = st; if (text) li.querySelector('span').textContent = text;
      li.querySelector('em').textContent = note || '';
      ctx.scrollDown();
    }
    function lock(on) {
      busy = on;
      [symIn, nameIn, okIn].forEach(x => { x.disabled = on; });
      el.querySelectorAll('.ln-la button, .ln-la input, .ln-w button').forEach(x => { x.disabled = on; });
      go.classList.toggle('busy', on);
    }
    function failAt(k, msg) {
      step(k, 'err', null, msg); lock(false);
      go.textContent = 'try again'; go.dataset.retry = '1';
    }

    go.addEventListener('click', async () => {
      if (busy) return;
      if (!W.state().connected) { await connect(); return; } // connecting is its own tap; launching is the next
      const symbol = symIn.value.toUpperCase(), name = nameIn.value.trim();
      if (!SYMBOL.test(symbol)) { symIn.focus(); return ctx.toast('Ticker: 2–10 letters or digits.'); }
      if (!name) { nameIn.focus(); return ctx.toast('Give the coin a name.'); }
      if (!okIn.checked) { const l = $('.ln-ok'); l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake'); return ctx.toast('Tick the box first: the split can never change.'); }
      lock(true); steps(); delete go.dataset.retry;
      const wallet = W.state().connected;

      // 1 · build (a fresh plan ticket if this one is about to run out)
      step('build', 'run');
      if (Date.now() - ticketAt > 13 * 60e3) {
        const p = await api('/api/launch/plan?repo=' + encodeURIComponent(repo));
        if (!p.ok) return failAt('build', p.error === 'taken' ? 'someone launched it a moment ago.' : 'couldn’t refresh the split. try again.');
        plan = p.plan; ticket = p.ticket; ticketAt = Date.now();
      }
      if (!uploaded) { clearTimeout(drawT); await drawLogo(cv, repo, symbol, seed); }
      const img = uploaded ? cv.toDataURL('image/jpeg', .9) : cv.toDataURL('image/png');
      const b = await api('/api/launch/build', { ticket, wallet: wallet.address, symbol, name, image: img });
      if (!b.ok) {
        return failAt('build', {
          daily_limit: `this wallet started coins on ${L.perDay} repositories today. tomorrow.`,
          in_flight: 'someone else is launching this repository right now.',
          taken: 'someone launched it a moment ago.',
          blocked: 'the owner asked for no coins on this code.',
          bad_image: 'that logo is too big. try another.',
          bad_symbol: 'ticker: 2–10 letters or digits.', bad_name: 'the name can’t have < > or control characters.',
          ipfs: 'pump.fun’s ipfs didn’t answer. try again.', rate_limited: 'too many at once. give it a minute.', expired: 'the split expired. try again.'
        }[b.error] || 'couldn’t build it just now. try again.');
      }
      step('build', 'ok', null, b.created ? `${b.created} github fee account${b.created > 1 ? 's' : ''} to open` : '');

      // 2 · sign
      step('sign', 'run', `sign in ${wallet.name} · ${b.txs.length} transactions`);
      let signed;
      try { signed = await W.sign(b.txs); }
      catch (e) { return failAt('sign', e.code === 'rejected' ? 'cancelled in the wallet. nothing was sent.' : e.code === 'no_v0' ? 'this wallet can’t sign these. try phantom or solflare.' : 'the wallet couldn’t sign. nothing was sent.'); }
      step('sign', 'ok');

      // 3 · one bundle
      step('send', 'run');
      const s = await api('/api/launch/submit', { ticket: b.ticket, txs: signed });
      if (!s.ok) {
        return failAt('send', s.error === 'bad_signed' && s.why === 'changed' ? 'your wallet changed the transactions, so they no longer carry the locked split. nothing was sent. try another wallet.'
          : s.error === 'expired' ? 'that took too long to sign. try again.'
          : s.error === 'jito' || s.error === 'jito_busy' ? 'the bundle relay is busy. nothing was sent. try again.'
          : 'couldn’t send it. nothing was sent. try again.');
      }
      step('send', 'ok');

      // 4 · the chain
      step('land', 'run');
      const t0 = Date.now();
      for (;;) {
        await new Promise(r => setTimeout(r, 2500));
        const st = await api('/api/launch/status?mint=' + encodeURIComponent(b.mint));
        if (st.ok && st.state === 'live') {
          step('land', 'ok', 'live: the coin and its locked split are on the chain');
          lock(true); go.textContent = `$${symbol} is live`; el.classList.add('done');
          walletViews.delete(paint);
          const coin = { repo, mint: b.mint, symbol, name, image: st.coin && st.coin.image, split: plan.holders, live_at: new Date().toISOString(), market: null };
          landed(coin);
          const box = el.getBoundingClientRect(); ctx.burst(box.left + 60, box.top + 60);
          const m2 = await say(`$${symbol} is live: the coin for ${repo}. its creator fees go where the split says, for good.`);
          return coinCard(m2, coin, true);
        }
        if (st.ok && st.state === 'mismatch') return failAt('land', 'a coin landed, but not with this split. it won’t be listed here.');
        if ((st.ok && st.state === 'expired') || Date.now() - t0 > 210e3) return failAt('land', 'it didn’t land: the network was busy. a bundle is all or nothing, so nothing was charged. try again.');
      }
    });
  }

  /* ---------- a coin ---------- */
  function coinCard(m, coin, justNow) {
    const [owner, name] = coin.repo.split('/'), mk = coin.market;
    const ch = mk && mk.change24 != null ? `<span class="${mk.change24 >= 0 ? 'up' : 'dn'}">${mk.change24 >= 0 ? '+' : ''}${Number(mk.change24).toFixed(1)}%</span>` : '';
    const text = `$${coin.symbol} — the coin for github.com/${coin.repo}. its creator fees go to the people who wrote it, locked for good.\n\n${shareUrl(coin.repo)}`;
    const el = card(m, 'tkn' + (justNow ? ' new' : ''), `<span>// coin · <b>${esc(coin.repo)}</b></span><span class="tkn-live">on pump.fun</span>`, `
      <div class="tkn-top">
        <span class="tkn-img">${coin.image ? `<img src="${esc(coin.image)}" alt="" width="56" height="56">` : `<b>${esc(coin.symbol[0])}</b>`}</span>
        <span class="tkn-id"><b class="tkn-sym">$${esc(coin.symbol)}</b><span>${esc(coin.name)} · <a href="https://github.com/${esc(owner)}/${esc(name)}" target="_blank" rel="noopener">${esc(coin.repo)}</a></span></span>
        <span class="tkn-mk">${mk && mk.mcap ? `<b class="mono">${usd(mk.mcap)}</b><span>mcap ${ch}</span>` : `<span>${justNow ? 'just launched' : 'no trades seen yet'}</span>`}</span>
      </div>
      <button class="tkn-ca" type="button" data-a="ca" aria-label="Copy the contract address"><span class="k">ca</span><span class="mono v">${esc(coin.mint)}</span><b>copy</b></button>
      <div class="tkn-links">${links(coin.mint).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}</div>
      ${Array.isArray(coin.split) && coin.split.length ? `<details class="tkn-split"${justNow ? ' open' : ''}><summary>creator fees · locked · ${coin.split.length} ${coin.split.length > 1 ? 'parts' : 'part'}</summary>${splitRows(coin.split)}</details>` : ''}
      <div class="q-acts"><a class="q-btn ghost" href="https://x.com/intent/tweet?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">share on x ↗</a><a class="q-link" href="https://pump.fun/coin/${esc(coin.mint)}" target="_blank" rel="noopener">trade on pump.fun</a></div>`);
    el.querySelector('[data-a="ca"]').addEventListener('click', async e => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(coin.mint); ctx.toast(`$${coin.symbol} address copied.`); } catch (_) { ctx.toast(coin.mint); }
      b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    });
    return el;
  }

  /* ---------- /coins ---------- */
  async function recent() {
    const j = await api('/api/tokens/recent');
    const list = (j && j.ok && j.tokens) || [];
    if (!list.length) return say(j && j.ok ? `no coins yet. tap any repository on a tree and launch the first.` : `coins on repositories open soon.`, ['where did llama.cpp come from?']);
    for (const t of list) seen.set(String(t.repo).toLowerCase(), { at: Date.now(), coin: t });
    const m = await say(`the newest coins on repositories. tap one for its split and address.`);
    const el = card(m, 'tkn-list', `<span>// coins · newest first</span><span>${list.length}</span>`, list.map(t => `
      <button class="tkl" type="button" data-r="${esc(t.repo)}">
        <span class="tkn-img sm">${t.image ? `<img src="${esc(t.image)}" alt="" width="32" height="32" loading="lazy">` : `<b>${esc(t.symbol[0])}</b>`}</span>
        <span class="tkl-id"><b>$${esc(t.symbol)}</b><span>${esc(t.repo)}</span></span>
        <span class="tkl-m mono">${t.market && t.market.mcap ? usd(t.market.mcap) : ''}</span>
      </button>`).join(''));
    el.addEventListener('click', e => { const b = e.target.closest('.tkl'); if (b) ctx.send(`/launch ${b.dataset.r}`); });
  }

  /* ---------- a repository's card: its coin, or the way to one ---------- */
  function pointBlock(repo) {
    const c = known(repo);
    if (!c) return null;
    const mk = c.market;
    return `<div class="pt-coin"><span class="pt-k">coin</span><b>$${esc(c.symbol)}</b>${mk && mk.mcap ? `<span class="mono">${usd(mk.mcap)}</span>` : ''}<a href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a></div>`;
  }

  function mount(c) { ctx = c; esc = c.esc; return api_; }
  const api_ = { mount, run, tokens, known, pointBlock, repoOf, onCoin: f => coinListeners.push(f) };
  window.ForksLaunch = api_;
})();
