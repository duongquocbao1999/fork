/* forks — the share card: your fork as a picture to quote on X, drawn like a repository page.
   Header: forkwiki / @handle with a Fork button whose counter is your $FORK. Left: the commit graph —
   the x scan, the trials, the trees, the invites, each with its green diffstat — down to HEAD and the
   allocation. Right: where it came from as a language bar, the same as squares (one = 500 $FORK), and
   a clone box with your invite link. Drawn on a canvas with the page's own fonts and handed back as a
   PNG blob for "copy card", "save" and the <img> in the chat. */
(function () {
  'use strict';
  const W = 1200, H = 675, S = 1.6; // 1920×1080 out: crisp on phones, light enough to paste
  const BG = '#010409', PANEL = '#0d1117', LINE = '#3d444d', SUB = '#151b23', TEXT = '#f0f6fc', MUTED = '#9198a1',
    LINK = '#4493f8', GREEN = '#3fb950', PURPLE = '#ab7df8', CORAL = '#f78166', AMBER = '#d29922';
  const SANS = 'Anybody, system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
  const fmt = n => Number(n || 0).toLocaleString('en-US');

  function loadAvatar(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      const t = setTimeout(() => res(null), 2500);
      img.onload = () => { clearTimeout(t); res(img); };
      img.onerror = () => { clearTimeout(t); res(null); };
      img.src = src;
    });
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function mark(ctx, x, y, size, color) {
    const k = size / 24;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(9, 20); ctx.lineTo(9, 3.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, 14.4); ctx.bezierCurveTo(9, 10, 15.4, 10.5, 15.4, 6.8); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(9, 20, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(15.4, 5.1, 1.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 4 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }

  function pill(ctx, x, y, text, fg, border, bg, font) {
    ctx.font = font; const w = ctx.measureText(text).width + 22;
    rr(ctx, x, y, w, 28, 14); if (bg) { ctx.fillStyle = bg; ctx.fill(); }
    ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = fg; ctx.fillText(text, x + 11, y + 19.5);
    return w;
  }

  /** d: { handle, avatar, ticker, allocation, scan, trialsDone, trialsAll, trialsAmount, refs, refsAmount, traces, repos, link, demo } */
  async function render(d) {
    try { await Promise.all([document.fonts.load(`800 44px ${SANS}`), document.fonts.load(`600 24px ${SANS}`), document.fonts.load(`500 20px ${MONO}`)]); } catch (_) { }
    const avatar = await loadAvatar(d.avatar);
    const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
    const ctx = c.getContext('2d'); ctx.scale(S, S);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    rr(ctx, 36, 36, W - 72, H - 72, 14); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();

    // ---- header: [face] forkwiki / @handle  (pending)            [ Fork | 18,000 ]
    const X0 = 80, XR = W - 80;
    let x = X0;
    if (avatar) {
      ctx.save(); ctx.beginPath(); ctx.arc(x + 19, 96, 19, 0, Math.PI * 2); ctx.clip();
      try { ctx.drawImage(avatar, x, 77, 38, 38); } catch (_) { }
      ctx.restore(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 19, 96, 19, 0, Math.PI * 2); ctx.stroke();
    } else mark(ctx, x + 3, 80, 32, MUTED);
    x += 52;
    ctx.font = `400 29px ${SANS}`; ctx.fillStyle = LINK; ctx.fillText('forkwiki', x, 106); x += ctx.measureText('forkwiki').width;
    ctx.fillStyle = MUTED; ctx.fillText(' / ', x, 106); x += ctx.measureText(' / ').width;
    ctx.font = `700 29px ${SANS}`; ctx.fillStyle = LINK;
    const who = fit(ctx, '@' + d.handle, 330); ctx.fillText(who, x, 106); x += ctx.measureText(who).width + 16;
    x += pill(ctx, x, 82, 'pending', AMBER, '#9e6a03', null, `500 16px ${MONO}`) + 8;
    if (d.demo) pill(ctx, x, 82, 'demo · simulated', MUTED, LINE, null, `500 16px ${MONO}`);

    // the Fork button, its counter the allocation
    ctx.font = `600 19px ${SANS}`;
    const cnt = fmt(d.allocation), cw = ctx.measureText(cnt).width + 28, fw = 108, bx = XR - fw - cw;
    rr(ctx, bx, 74, fw + cw, 44, 8); ctx.fillStyle = '#212830'; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
    mark(ctx, bx + 14, 84, 24, TEXT);
    ctx.fillStyle = TEXT; ctx.fillText('Fork', bx + 46, 103);
    ctx.fillStyle = LINE; ctx.fillRect(bx + fw, 74, 1.5, 44);
    rr(ctx, bx + fw + 8, 83, cw - 16, 26, 13); ctx.fillStyle = '#2f3742'; ctx.fill();
    ctx.fillStyle = TEXT; ctx.fillText(cnt, bx + fw + 14, 103);

    ctx.font = `400 21px ${SANS}`; ctx.fillStyle = MUTED;
    ctx.fillText(fit(ctx, `forked from x.com/${d.handle} · the family tree of open source`, XR - X0), X0, 150);
    ctx.fillStyle = LINE; ctx.fillRect(36, 180, W - 72, 1.5);

    // ---- left: the commit graph
    const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ctx.font = `500 17px ${MONO}`; ctx.fillStyle = MUTED; ctx.fillText(`commits on ${day}`, X0, 222);
    const rows = [];
    if (d.scan) rows.push(['read the x account', `+${fmt(d.scan)}`]);
    rows.push([`merge ${d.trialsDone}/${d.trialsAll} trials`, d.trialsAmount ? `+${fmt(d.trialsAmount)}` : '']);
    rows.push([`grow ${fmt(d.traces)} ${d.traces === 1 ? 'tree' : 'trees'} · ${fmt(d.repos)} repos`, '']);
    if (d.refsAmount) rows.push([`invite ${fmt(d.refs)} ${d.refs === 1 ? 'friend' : 'friends'}`, `+${fmt(d.refsAmount)}`]);
    const GX = X0 + 14, LX = X0 + 44, LR = 610, step = rows.length > 3 ? 58 : 66;
    let y = 268;
    const headY = y + rows.length * step + 12;
    ctx.fillStyle = LINE; ctx.fillRect(GX - 1.5, y - 6, 3, headY - y + 6);
    for (const [msg, diff] of rows) {
      ctx.beginPath(); ctx.arc(GX, y, 8, 0, Math.PI * 2); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = MUTED; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.font = `600 23px ${SANS}`; ctx.fillStyle = TEXT; ctx.fillText(fit(ctx, msg, LR - LX - 130), LX, y + 8);
      if (diff) { ctx.font = `600 21px ${MONO}`; ctx.fillStyle = GREEN; ctx.textAlign = 'right'; ctx.fillText(diff, LR, y + 8); ctx.textAlign = 'left'; }
      y += step;
    }
    // HEAD
    ctx.beginPath(); ctx.arc(GX, headY, 10, 0, Math.PI * 2); ctx.fillStyle = GREEN; ctx.fill();
    ctx.font = `500 16px ${MONO}`;
    const hw = ctx.measureText('HEAD → main').width + 20;
    rr(ctx, LX, headY - 15, hw, 30, 6); ctx.fillStyle = '#121d2f'; ctx.fill(); ctx.strokeStyle = '#1f3a5f'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = LINK; ctx.fillText('HEAD → main', LX + 10, headY + 6);
    ctx.font = `800 46px ${SANS}`; ctx.fillStyle = TEXT;
    const big = fmt(d.allocation), bigW = ctx.measureText(big).width; ctx.fillText(big, LX, headY + 70);
    ctx.font = `600 22px ${MONO}`; ctx.fillStyle = AMBER; ctx.fillText(d.ticker, LX + bigW + 14, headY + 70);

    // ---- right: where it came from
    const RX = 660, RW = XR - RX;
    ctx.font = `600 22px ${SANS}`; ctx.fillStyle = TEXT; ctx.fillText('Allocation', RX, 222);
    const parts = [['x scan', d.scan || 0, GREEN], ['trials', d.trialsAmount || 0, PURPLE], ['invites', d.refsAmount || 0, CORAL]].filter(p => p[1] > 0);
    const sum = parts.reduce((s, p) => s + p[1], 0) || 1;
    rr(ctx, RX, 240, RW, 10, 5); ctx.save(); ctx.clip();
    let bxp = RX; for (const [, v, col] of parts) { const w = RW * v / sum; ctx.fillStyle = col; ctx.fillRect(bxp, 240, w + 0.5, 10); bxp += w; }
    if (!parts.length) { ctx.fillStyle = LINE; ctx.fillRect(RX, 240, RW, 10); }
    ctx.restore();
    let lx = RX;
    for (const [name, v, col] of parts) {
      ctx.beginPath(); ctx.arc(lx + 6, 282, 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.font = `600 18px ${SANS}`; ctx.fillStyle = TEXT; ctx.fillText(name, lx + 18, 288); const nw = ctx.measureText(name).width;
      ctx.font = `400 18px ${SANS}`; ctx.fillStyle = MUTED; const pct = `${(100 * v / sum).toFixed(1)}%`; ctx.fillText(pct, lx + 24 + nw, 288);
      lx += 24 + nw + ctx.measureText(pct).width + 26;
    }

    // the same as squares, column by column like a contribution graph: one square = 500
    const UNIT = 500, cells = [];
    for (const [, v, col] of parts) for (let k = 0; k < Math.round(v / UNIT); k++) cells.push(col);
    const R = 7, cs = 17, gap = 5, cols = Math.max(12, Math.ceil(cells.length / R)), fitCols = Math.min(cols, Math.floor((RW + gap) / (cs + gap)));
    const per = Math.ceil(cells.length / (fitCols * R)) || 1; // past the width, one square holds more
    for (let ci = 0; ci < fitCols; ci++) for (let ri = 0; ri < R; ri++) {
      const k = (ci * R + ri) * per;
      rr(ctx, RX + ci * (cs + gap), 318 + ri * (cs + gap), cs, cs, 3);
      ctx.fillStyle = k < cells.length ? cells[k] : '#151b23'; ctx.fill();
      if (k >= cells.length) { ctx.strokeStyle = '#212830'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.font = `400 16px ${MONO}`; ctx.fillStyle = MUTED;
    ctx.fillText(`one square = ${fmt(UNIT * per)} ${d.ticker}`, RX, 318 + R * (cs + gap) + 18);

    // the clone box: your invite link
    const cy = 530, cb = 58;
    rr(ctx, RX, cy, cb, 44, 8); ctx.fillStyle = '#238636'; ctx.fill();
    ctx.font = `700 19px ${MONO}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText('<>', RX + cb / 2, cy + 29); ctx.textAlign = 'left';
    rr(ctx, RX + cb + 10, cy, RW - cb - 10, 44, 8); ctx.fillStyle = BG; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
    const clone = `git clone ${d.link}`, room = RW - cb - 38;
    let fs = 19; ctx.font = `500 ${fs}px ${MONO}`;
    while (fs > 14 && ctx.measureText(clone).width > room) { fs -= 1; ctx.font = `500 ${fs}px ${MONO}`; } // the link must fit whole
    ctx.fillStyle = TEXT; ctx.fillText(fit(ctx, clone, room), RX + cb + 24, cy + 22 + fs * 0.36);

    // the fine print
    ctx.font = `400 15px ${MONO}`; ctx.fillStyle = '#656c76';
    ctx.fillText('pending · not financial advice', X0, H - 58);
    ctx.textAlign = 'right'; ctx.fillText('not affiliated with github', XR, H - 58); ctx.textAlign = 'left';

    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return { blob, url: blob ? URL.createObjectURL(blob) : c.toDataURL('image/png'), canvas: c };
  }

  // copy the picture; where the clipboard can't take images, the share sheet; failing that, a download
  async function copy(blob) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch (_) { }
    return share(blob);
  }
  async function share(blob) {
    try {
      const f = new File([blob], 'my-fork.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return 'shared'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    save(blob); return 'saved';
  }
  function save(blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-fork.png';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.ForksCard = { render, copy, share, save, W, H };
})();
