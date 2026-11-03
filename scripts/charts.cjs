#!/usr/bin/env node
// Regenerates the README charts and banner from src/data.js:  npm run charts
const fs = require('fs');
const path = require('path');
const D = require('./load-data.cjs')();

const OUT = path.join(__dirname, '..', 'docs', 'media');
fs.mkdirSync(OUT, { recursive: true });
const DAY = 864e5, NOW = +D.SAMPLE_NOW;
const SANS = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MONO = SANS;
const SERIF = SANS;
const DISPLAY = "'Instrument Serif', 'Iowan Old Style', Georgia, serif";
const PAPER = '#090B0A', INK = '#E7ECE9', INK2 = '#A2ACA7', MUTED = '#66706B', RULE = '#1F2421', COBALT = '#6EE7B7';
const FAM = { 'viral-animals': '#56C2D6', 'ai-celebrities': '#6EE7B7', 'crypto-mascots': '#E5C07B', 'brainrot': '#E06C9F', 'reaction-formats': '#98C379', 'political-memes': '#C192F0', 'game-memes': '#EE8A62' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f1 = v => (+v).toFixed(1);

function card(w, h, title, sub, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="${PAPER}" stroke="${RULE}"/>
<path d="M24 22.5H${w - 24}" stroke="${RULE}" stroke-width="1"/>
<path d="M24 22.5C36 22.5 34 36 47 36" fill="none" stroke="${COBALT}" stroke-width="1.6"/><circle cx="49" cy="36" r="2.6" fill="${PAPER}" stroke="${COBALT}" stroke-width="1.6"/>
<text x="58" y="41" fill="${MUTED}" font-family="${SANS}" font-size="11" letter-spacing=".2">// ${esc(sub)}</text>
<text x="24" y="78" fill="${INK}" font-family="${SERIF}" font-size="24" font-weight="500" letter-spacing="-.8">${esc(title)}</text>
${body}
</svg>`;
}

/* 1. forks per quarter, documented vs sample */
function timeline() {
  const W = 880, H = 340, x0 = 56, x1 = W - 32, y0 = 110, y1 = H - 46;
  const qs = []; for (let y = 2016; y <= 2026; y++) for (let q = 0; q < 4; q++) { const t = Date.UTC(y, q * 3, 1); if (t <= NOW) qs.push(t); }
  const rows = qs.map((t, i) => { const e = qs[i + 1] || NOW + DAY; const ns = D.nodes.filter(n => n.parent && n.t >= t && n.t < e); return { t, doc: ns.filter(n => n.doc).length, smp: ns.filter(n => !n.doc).length }; });
  const max = Math.ceil(Math.max(...rows.map(r => r.doc + r.smp)) / 20) * 20;
  const bw = (x1 - x0) / rows.length, Y = v => y1 - v / max * (y1 - y0);
  let g = '';
  for (let v = 0; v <= max; v += 10) g += `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="#1A1F1C"/><text x="${x0 - 10}" y="${f1(Y(v) + 4)}" fill="#66706B" font-family="${MONO}" font-size="11" text-anchor="end">${v}</text>`;
  rows.forEach((r, i) => {
    const x = x0 + i * bw + 2, w = bw - 4;
    if (r.smp) g += `<rect x="${f1(x)}" y="${f1(Y(r.smp))}" width="${f1(w)}" height="${f1(y1 - Y(r.smp))}" fill="#E7ECE9" fill-opacity=".22"/>`;
    if (r.doc) g += `<rect x="${f1(x)}" y="${f1(Y(r.smp + r.doc))}" width="${f1(w)}" height="${f1(Y(r.smp) - Y(r.smp + r.doc))}" fill="#6EE7B7"/>`;
    const d = new Date(r.t); if (d.getUTCMonth() === 0 && d.getUTCFullYear() % 2 === 0) g += `<text x="${f1(x)}" y="${y1 + 20}" fill="#66706B" font-family="${MONO}" font-size="11">${d.getUTCFullYear()}</text>`;
  });
  const peak = rows.reduce((a, b) => (b.doc + b.smp > a.doc + a.smp ? b : a));
  const pi = rows.indexOf(peak), px = x0 + pi * bw + bw / 2;
  g += `<path d="M${f1(px)} ${f1(Y(peak.doc + peak.smp) - 6)}V${y0 - 2}H${f1(px - 150)}" fill="none" stroke="#6EE7B7" stroke-width="1" stroke-dasharray="2 3"/><text x="${f1(px - 156)}" y="${y0 + 2}" fill="#6EE7B7" font-family="${MONO}" font-size="11" text-anchor="end">Q3 2026 · Jean Philanthrope, Glorp 2026, Lagos Cut</text>`;
  g += `<rect x="${W - 250}" y="62" width="10" height="10" fill="#6EE7B7"/><text x="${W - 234}" y="71" fill="#A2ACA7" font-family="${MONO}" font-size="11">documented</text><rect x="${W - 140}" y="62" width="10" height="10" fill="#E7ECE9" fill-opacity=".22"/><text x="${W - 124}" y="71" fill="#A2ACA7" font-family="${MONO}" font-size="11">sample</text>`;
  return card(W, H, 'Culture is forking faster', `new forks per quarter · ${D.nodes.filter(n => n.parent).length} forks since 2016`, g);
}

/* 2. objects per family */
function families() {
  const W = 880, rowH = 38, H = 124 + D.FAMILIES.length * rowH, x0 = 210, x1 = W - 140;
  const rows = D.FAMILIES.map(f => ({ f, all: D.nodes.filter(n => n.family === f.id).length, doc: D.nodes.filter(n => n.family === f.id && n.doc).length })).sort((a, b) => b.all - a.all);
  const max = Math.max(...rows.map(r => r.all));
  let g = '';
  rows.forEach((r, i) => {
    const y = 104 + i * rowH, w = (x1 - x0) * r.all / max, wd = (x1 - x0) * r.doc / max, c = FAM[r.f.id];
    g += `<circle cx="40" cy="${y + 11}" r="5" fill="${c}"/><text x="54" y="${y + 15}" fill="#E7ECE9" font-family="${SERIF}" font-size="16">${esc(r.f.name)}</text>`;
    g += `<rect x="${x0}" y="${y + 3}" width="${f1(w)}" height="16" rx="4" fill="${c}" fill-opacity=".28"/>`;
    if (r.doc) g += `<rect x="${x0}" y="${y + 3}" width="${f1(wd)}" height="16" rx="4" fill="${c}"/>`;
    g += `<text x="${f1(x0 + w + 10)}" y="${y + 15}" fill="#A2ACA7" font-family="${MONO}" font-size="12">${r.all}${r.doc ? ` · ${r.doc} doc` : ''}</text>`;
  });
  return card(W, H, 'Seven cultural families', 'objects per family · solid = documented with sources', g);
}

/* 3. deepest lineages */
function deepest() {
  const roots = D.roots.slice().sort((a, b) => b.depthBelow - a.depthBelow || b.descendants - a.descendants).slice(0, 6);
  const W = 880, rowH = 46, H = 124 + roots.length * rowH, x0 = 260, x1 = W - 170, maxD = roots[0].depthBelow;
  let g = '';
  roots.forEach((r, i) => {
    const y = 118 + i * rowH, c = FAM[r.family], xe = x0 + (x1 - x0) * r.depthBelow / maxD;
    g += `<text x="32" y="${y + 5}" fill="#E7ECE9" font-family="${SERIF}" font-size="17">${esc(r.name)}</text><text x="32" y="${y + 22}" fill="#66706B" font-family="${MONO}" font-size="11">${new Date(r.t).getUTCFullYear()} · ${r.doc ? 'documented' : 'sample'}</text>`;
    g += `<line x1="${x0}" x2="${f1(xe)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2" stroke-opacity=".7"/>`;
    for (let k = 0; k <= r.depthBelow; k++) { const x = x0 + (x1 - x0) * k / maxD; g += `<circle cx="${f1(x)}" cy="${y}" r="${k === 0 ? 5 : 3.4}" fill="${k === 0 ? c : '#090B0A'}" stroke="${c}" stroke-width="1.6"/>`; }
    g += `<text x="${x1 + 24}" y="${y + 4}" fill="#E7ECE9" font-family="${MONO}" font-size="13">depth ${r.depthBelow}</text><text x="${W - 32}" y="${y + 4}" fill="#6EE7B7" font-family="${MONO}" font-size="13" text-anchor="end">${r.score}</text>`;
  });
  g += `<text x="${W - 32}" y="100" fill="#66706B" font-family="${MONO}" font-size="10.5" text-anchor="end">FORK SCORE</text>`;
  return card(W, H, 'Deepest lineages', 'one dot per generation of unbroken descent', g);
}

/* 4. platforms where forks land */
function platforms() {
  const counts = {}; D.nodes.forEach(n => { counts[n.platform] = (counts[n.platform] || 0) + 1; });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const W = 880, H = 340, x0 = 48, x1 = W - 32, y0 = 116, y1 = H - 52, bw = (x1 - x0) / rows.length, max = rows[0][1];
  let g = '';
  rows.forEach(([p, c], i) => {
    const h = (y1 - y0) * c / max, x = x0 + i * bw + 8, w = bw - 16;
    g += `<rect x="${f1(x)}" y="${f1(y1 - h)}" width="${f1(w)}" height="${f1(h)}" fill="url(#pg)"/>`;
    g += `<text x="${f1(x + w / 2)}" y="${f1(y1 - h - 8)}" fill="#E7ECE9" font-family="${MONO}" font-size="12" text-anchor="middle">${c}</text>`;
    g += `<text x="${f1(x + w / 2)}" y="${y1 + 20}" fill="#A2ACA7" font-family="${SANS}" font-size="12.5" text-anchor="middle">${esc(D.PLATFORMS[p])}</text>`;
  });
  g = `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#6EE7B7" stop-opacity=".55"/></linearGradient></defs>` + g;
  return card(W, H, 'Where things fork', 'objects by platform of first appearance', g);
}

/* banner: an animated fork tree drawing itself */
function banner() {
  const W = 1280, H = 440;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const cols = Object.values(FAM);
  const edges = [], dots = [];
  const grow = (x, y, depth, spread, col, hot) => {
    if (depth > 4) return;
    const n = depth === 0 ? 5 : depth < 3 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const nx = x + 96 + rnd() * 34, ny = Math.max(34, Math.min(H - 34, y + (n === 1 ? (rnd() - .5) * spread * .4 : (i / (n - 1) - .5) * spread + (rnd() - .5) * 14)));
      const h = hot && i === Math.min(1, n - 1), c = h ? COBALT : INK2;
      edges.push({ x, y, nx, ny, depth, c, h, w: Math.max(1.1, 4.4 - depth * .85) });
      dots.push({ x: nx, y: ny, c, depth });
      grow(nx, ny, depth + 1, spread * .56, c, h);
    }
  };
  const ox = 668, oy = H / 2;
  grow(ox, oy, 0, 340, null, true);
  const paths = edges.map((e, i) => {
    const dx = e.nx - e.x, d = `M${f1(e.x)} ${f1(e.y)}C${f1(e.x + dx * .62)} ${f1(e.y)} ${f1(e.x + dx * .38)} ${f1(e.ny)} ${f1(e.nx)} ${f1(e.ny)}`;
    return `<path id="b${i}" d="${d}" pathLength="1" stroke="${e.c}" stroke-opacity="${e.h ? 1 : .42}" stroke-width="${e.w}" style="animation-delay:${(e.depth * .5 + (i % 5) * .05).toFixed(2)}s"/>`;
  }).join('');
  const pulses = edges.map((e, i) => i).filter(i => edges[i].h).map((i, j) => `<circle r="2.8" fill="${COBALT}"><animateMotion dur="${(2.6 + (j % 4) * .4).toFixed(1)}s" begin="${(3 + j * .19).toFixed(2)}s" repeatCount="indefinite"><mpath href="#b${i}"/></animateMotion></circle>`).join('');
  const nodes = dots.map(d => `<circle cx="${f1(d.x)}" cy="${f1(d.y)}" r="${d.depth < 1 ? 4.6 : 3}" fill="${d.depth > 2 ? PAPER : d.c}" stroke="${d.c}" stroke-width="1.5" style="animation-delay:${(d.depth * .5 + .45).toFixed(2)}s"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="forks — where did it come from?">
<defs><style>
.br path{fill:none;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:draw .9s cubic-bezier(.2,.7,.2,1) forwards}
.nd circle{opacity:0;animation:pop .4s ease forwards}
.og{opacity:0;animation:pop .4s ease .1s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pop{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.br path{animation:none;stroke-dashoffset:0}.nd circle,.og{animation:none;opacity:1}}
</style></defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="${PAPER}" stroke="${RULE}"/>
<g class="br">${paths}</g>
<g class="nd">${nodes}</g>
<g class="og"><circle cx="${ox}" cy="${oy}" r="7" fill="${COBALT}"/></g>
<g>${pulses}</g>
<g transform="translate(64 128)">
  <g transform="scale(2.4)" fill="none" stroke="${COBALT}" stroke-width="2.2" stroke-linecap="round"><path d="M9 20V3.5"/><path d="M9 14.2C9 9.6 15.5 10.4 15.5 6.6"/><circle cx="9" cy="20" r="2.4" fill="${COBALT}" stroke="none"/><circle cx="15.5" cy="5" r="1.7" fill="${PAPER}" stroke-width="1.6"/></g>
  <text x="68" y="46" fill="${INK}" font-family="${MONO}" font-size="40" font-weight="500" letter-spacing="-1">forks</text>
  <text x="0" y="128" fill="${INK}" font-family="${DISPLAY}" font-size="58" letter-spacing="-1.5">where did it</text>
  <text x="0" y="186" fill="${COBALT}" font-family="${DISPLAY}" font-size="58" font-style="italic" letter-spacing="-1.5">come from?</text>
  <text x="2" y="226" fill="${MUTED}" font-family="${MONO}" font-size="13" letter-spacing=".2">a sourced family tree of internet culture · forks.wiki</text>
</g>
</svg>`;
}

/* small logo */
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.5" fill="#090B0A"/><g fill="none" stroke="#6EE7B7" stroke-width="2" stroke-linecap="round"><path d="M9 20V3.5"/><path d="M9 14.2C9 9.6 15.5 10.4 15.5 6.6"/></g><circle cx="9" cy="20" r="2.3" fill="#6EE7B7"/><circle cx="15.5" cy="5" r="1.6" fill="#090B0A" stroke="#6EE7B7" stroke-width="1.5"/></svg>`;

const files = { 'chart-timeline.svg': timeline(), 'chart-families.svg': families(), 'chart-depth.svg': deepest(), 'chart-platforms.svg': platforms(), 'banner.svg': banner(), 'logo.svg': logo };
for (const [name, svg] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, name), svg); console.log('wrote docs/media/' + name); }
