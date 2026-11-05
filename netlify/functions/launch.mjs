// Coins on repositories, launched on pump.fun from forks.wiki. Anyone with a Solana wallet; one coin per
// repository; the creator fees split once, for good, between the people behind the code and forks.
//
//   GET  /api/launch/plan?repo=owner/name   who gets what (GitHub + the traced line), signed for the next step
//   POST /api/launch/build   { ticket, wallet, symbol, name, image, devBuy?, x? }   metadata on IPFS, the transactions to sign
//   POST /api/launch/submit  { ticket, txs }   checks every signature and byte, sends one all-or-nothing bundle
//   GET  /api/launch/status?mint=…   reads the coin and its locked split back from the chain, then lists it
//   GET  /api/tokens?repos=a/b,c/d   live coins on these repositories (+ market data when DexScreener has it)
//   GET  /api/tokens/recent          the newest coins
//
// Env: SOLANA_RPC_URL (secret), SUPABASE_*, SESSION_SECRET (signs the tickets), GITHUB_TOKEN; JITO_URL optional.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import C from '../../src/config.js';
import { json, rpc as db, sameOrigin, seal, siteOrigin, unseal } from '../lib/server.mjs';
import { NAME } from '../lib/github.mjs';
import { plan } from '../lib/split.mjs';
import { BASE58, build, checkSigned, cosign, ipfsReady, landed, sdkStatus, sendBundle, uploadMetadata } from '../lib/chain.mjs';

const L = C.launch;
const SYMBOL = /^[A-Z0-9]{2,10}$/;
const plans = new Map(), market = new Map(), hits = new Map();
const err = (code, status = 400, extra = {}) => json({ ok: false, error: code, ...extra }, status);
function limited(key, n) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > n;
}
// the mint key rides in the send ticket, encrypted (AES-256-GCM, key derived from SESSION_SECRET)
const KEY = () => createHash('sha256').update('forks-mint:' + process.env.SESSION_SECRET).digest();
function lock(buf) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}
function unlock(s) {
  try {
    const b = Buffer.from(String(s), 'base64url'), d = createDecipheriv('aes-256-gcm', KEY(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  } catch (_) { return null; }
}
const NO_FN = e => /PGRST202|Could not find the function/.test(String(e && e.message)); // a database without 0004
const ipOf = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || 'anon';
const ready = () => !!(L.treasury && process.env.SOLANA_RPC_URL && sdkStatus().ok && ipfsReady() && process.env.SUPABASE_URL && process.env.SESSION_SECRET && process.env.GITHUB_TOKEN);

// the line above a repo as upstream draws it, from the same cached trace the page shows
async function tracedLine(req, repo) {
  try {
    const q = `where did ${repo} come from?`;
    const r = await fetch(`${siteOrigin(req)}/api/trace?q=${encodeURIComponent(q)}`, { headers: { 'sec-fetch-site': 'same-origin' }, signal: AbortSignal.timeout(6500) });
    if (!r.ok) return [];
    const t = await r.json(), nodes = t.nodes || [];
    let i = nodes.findIndex(x => String(x.repo).toLowerCase() === repo.toLowerCase());
    const out = [];
    while (i >= 0 && nodes[i] && nodes[i].parent != null && out.length < 3) { i = nodes[i].parent; out.push(nodes[i].repo); }
    return out;
  } catch (_) { return []; }
}

async function getPlan(req, repo) {
  const k = repo.toLowerCase(), hit = plans.get(k);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.v;
  const traced = await tracedLine(req, repo);
  const v = await plan(repo, { traced, treasury: L.treasury, split: L.split, orgContributors: L.orgContributors, contributors: L.contributors });
  if (plans.size > 500) plans.clear();
  plans.set(k, { at: Date.now(), v });
  return v;
}

function image(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  return bytes.length > 600 * 1024 || bytes.length < 200 ? null : { type: m[1], bytes };
}
const pct = bps => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
function describe(p) {
  const people = p.holders.filter(h => h.kind === 'github').map(h => `${pct(h.bps)} @${h.login}`).join(', ');
  return `The coin for github.com/${p.repo}, launched on forks.wiki. Creator fees, split for good: ${people} (GitHub, claimed on pump.fun)` +
    `${p.holders.some(h => h.kind === 'wallet') ? `, ${pct(L.split.forks)} forks` : ''}. Not made or endorsed by the repository's authors. Not financial advice.`;
}

async function marketData(mints) {
  const now = Date.now(), todo = mints.filter(m => { const e = market.get(m); return !e || now - e.at > 60e3; });
  if (todo.length) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${todo.slice(0, 30).join(',')}`, { signal: AbortSignal.timeout(3500) });
      const pairs = r.ok ? await r.json() : [];
      const best = new Map();
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const m = p.baseToken && p.baseToken.address; if (!m) continue;
        const cur = best.get(m);
        if (!cur || (p.liquidity && p.liquidity.usd || 0) > (cur.liquidity && cur.liquidity.usd || 0)) best.set(m, p);
      }
      for (const m of todo) { const p = best.get(m); market.set(m, { at: now, v: p ? { mcap: p.marketCap || p.fdv || null, price: p.priceUsd ? Number(p.priceUsd) : null, change24: p.priceChange ? p.priceChange.h24 : null, url: p.url } : null }); }
    } catch (_) { }
  }
  const out = {}; for (const m of mints) { const e = market.get(m); out[m] = e ? e.v : null; }
  return out;
}

export default async (req, context) => {
  const url = new URL(req.url), path = url.pathname.replace(/\/$/, '');
  try {
    if (path === '/api/tokens' || path === '/api/tokens/recent') {
      if (!process.env.SUPABASE_URL) return json({ ok: true, tokens: [] });
      let list;
      try { list = path.endsWith('recent')
        ? await db('api_tokens_recent', { p_limit: 20 })
        : await db('api_tokens', { p_repos: (url.searchParams.get('repos') || '').split(',').map(s => s.trim()).filter(s => NAME.test(s)).slice(0, 24) }); }
      catch (e) { if (NO_FN(e)) return json({ ok: true, tokens: [] }); throw e; } // 0004 not run yet: no coins
      const m = list.length ? await marketData(list.map(t => t.mint)) : {};
      return json({ ok: true, tokens: list.map(t => ({ ...t, market: m[t.mint] || null })) }, 200, { 'cache-control': 'public, max-age=20', 'netlify-cdn-cache-control': 'public, s-maxage=20', 'netlify-vary': 'query=repos' });
    }

    if (!ready()) return err('not_configured', 503, { missing: [!L.treasury && 'src/config.js launch.treasury', !process.env.SOLANA_RPC_URL && 'SOLANA_RPC_URL', !process.env.SUPABASE_URL && 'SUPABASE_URL', !process.env.GITHUB_TOKEN && 'GITHUB_TOKEN', !ipfsReady() && 'PINATA_JWT', !sdkStatus().ok && 'solana sdk (see /api/chain)'].filter(Boolean) });

    if (path === '/api/launch/plan' && req.method === 'GET') {
      const repo = (url.searchParams.get('repo') || '').trim();
      if (!NAME.test(repo)) return err('bad_repo');
      if (limited('plan:' + ipOf(req, context), 20)) return err('rate_limited', 429);
      const state = await db('api_launch_state', { p_repo: repo });
      if (state.blocked) return err('blocked', 409);
      if (state.coin && state.coin.status === 'live') return err('taken', 409, { coin: state.coin });
      let p;
      try { p = await getPlan(req, repo); } catch (e) { return err(e.code || 'github', e.code ? 409 : 502); }
      if (state.coin) return err('in_flight', 409);
      return json({ ok: true, plan: p, ticket: seal({ k: 'plan', p }, 15 * 60) });
    }

    if (path === '/api/launch/status' && req.method === 'GET') {
      const mint = url.searchParams.get('mint') || '';
      if (!BASE58.test(mint)) return err('bad_mint');
      const l = await db('api_launch_get', { p_mint: mint });
      if (!l) return err('unknown', 404);
      if (l.status === 'live') return json({ ok: true, state: 'live', coin: l });
      const s = await landed(mint, l.split);
      if (s.state === 'live' || s.state === 'mismatch') await db('api_launch_settle', { p_mint: mint, p_status: s.state });
      // a bundle can't land once its blockhash is gone (~1 minute); after 3 minutes it never will
      const expired = s.state === 'pending' && (Date.now() - Date.parse(l.created_at) > 180e3 || (l.reserved_until && Date.parse(l.reserved_until) < Date.now()));
      return json({ ok: true, state: expired ? 'expired' : s.state, why: s.why || null, coin: { ...l, status: s.state === 'live' ? 'live' : l.status } });
    }

    if (req.method !== 'POST') return err('method', 405);
    if (!sameOrigin(req)) return err('bad_origin', 403);
    const raw = await req.text();
    if (raw.length > 900 * 1024) return err('too_long', 413);
    let body; try { body = JSON.parse(raw || '{}'); } catch { return err('bad_json'); }

    if (path === '/api/launch/build') {
      if (limited('build:' + ipOf(req, context), Number(process.env.LAUNCH_BUILDS_PER_MIN) || 6)) return err('rate_limited', 429);
      const t = unseal(body.ticket);
      if (!t || t.k !== 'plan') return err('expired', 409);
      const p = t.p, wallet = String(body.wallet || ''), symbol = String(body.symbol || '').toUpperCase(), name = String(body.name || '').trim();
      if (!BASE58.test(wallet)) return err('bad_wallet');
      if (!SYMBOL.test(symbol)) return err('bad_symbol');
      if (!name || name.length > 32 || /[\u0000-\u001f<>]/.test(name)) return err('bad_name');
      const img = image(body.image);
      if (!img) return err('bad_image');
      // buy at launch: the launcher's own SOL, bought first in the same bundle (0 = none)
      const devSol = body.devBuy == null || body.devBuy === '' ? 0 : Number(body.devBuy);
      if (!Number.isFinite(devSol) || devSol < 0 || devSol > (L.maxDevBuySol || 20)) return err('bad_dev_buy');
      const devBuyLamports = Math.round(devSol * 1e9);
      if (devBuyLamports > 0 && devBuyLamports < 1e6) return err('bad_dev_buy'); // below 0.001 SOL
      const x = String(body.x || '').trim();
      if (x && !/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}(\/status\/\d{1,25})?\/?$/.test(x)) return err('bad_x');
      const meta = await uploadMetadata({ name, symbol, description: describe(p), website: `https://github.com/${p.repo}`, twitter: x || null, image: img });
      const b = await build({ wallet, name, symbol, uri: meta.uri, holders: p.holders, tipSol: L.tipSol, devBuyLamports });
      const r = await db('api_launch_reserve', { p_repo: p.repo, p_repo_name: p.repo, p_wallet: wallet, p_mint: b.mint, p_symbol: symbol, p_name: name, p_uri: meta.uri, p_image: meta.image, p_split: p.holders });
      if (!r || !r.ok) return err((r && r.error) || 'reserve', 409);
      return json({ ok: true, mint: b.mint, txs: b.txs, created: b.missing, bought: b.bought, ticket: seal({ k: 'send', repo: p.repo, mint: b.mint, wallet, hashes: b.hashes, key: lock(b.secret) }, 150) });
    }

    if (path === '/api/launch/submit') {
      const t = unseal(body.ticket);
      if (!t || t.k !== 'send') return err('expired', 409);
      const secret = unlock(t.key);
      if (!secret || secret.length !== 64) return err('expired', 409);
      const bad = checkSigned(body.txs, t.hashes, t.wallet, t.mint);
      if (bad) return err('bad_signed', 400, { why: bad });
      const bundle = await sendBundle(cosign(body.txs, secret));
      return json({ ok: true, bundle, mint: t.mint });
    }
    return err('not_found', 404);
  } catch (e) {
    if (NO_FN(e)) return err('not_configured', 503, { missing: ['supabase/migrations/0004_launch.sql'] });
    if (e.code === 'sdk') { console.error('launch', e.message); return err('not_configured', 503, { why: 'sdk' }); }
    console.error('launch', e.code || '', e.message);
    return err(e.code || 'server', e.code === 'ipfs' || e.code === 'rpc' || e.code === 'jito' || e.code === 'jito_busy' ? 502 : 500, e.why ? { why: e.why } : {});
  }
};

export const config = { path: ['/api/launch/plan', '/api/launch/build', '/api/launch/submit', '/api/launch/status', '/api/tokens', '/api/tokens/recent'] };
