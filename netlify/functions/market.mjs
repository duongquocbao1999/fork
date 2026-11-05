// The market and the terminal. Coins launched on forks and the project tokens on the graph, with live
// prices (DexScreener), candles and trades (GeckoTerminal), holders and balances (our RPC), and trading:
// a coin still on its pump.fun curve trades straight on the curve (the server builds the transaction, the
// wallet signs, the server checks every byte and sends it); anything else goes through Jupiter.
// The server never holds a key and never decides an amount for anyone: the wallet signs what it is shown.
//
//   GET  /api/market                         coins (forks) + project tokens, with market data and curve progress
//   GET  /api/prices?mints=a,b               market data for up to 60 mints
//   GET  /api/trending                       { trending, top }: Jupiter's trending (1h) and top tokens by organic activity (24h);
//                                            GeckoTerminal's trending pools when Jupiter doesn't answer
//   GET  /api/coin?mint=                     one coin: what it is, its market, its curve, decimals
//   GET  /api/chart?mint=&tf=15m             candles (1m 5m 15m 1h 4h 1d)
//   GET  /api/trades?mint=                   the latest trades
//   GET  /api/holders?mint=                  the top 20 holders
//   GET  /api/balance?owner=&mint=           a wallet's SOL and token balance
//   GET  /api/trade/quote?mint=&side=&amount=&slippageBps=   a quote (pump curve or Jupiter)
//   POST /api/trade/build  { mint, side, amount, slippageBps, owner }   the same quote + the transaction to sign
//   POST /api/trade/send   { route, ticket | requestId, tx }             send the signed transaction
//   GET  /api/tx?sig=                        pending | confirmed | failed
//   GET  /api/chain                          did this function load the Solana SDKs? (node version, error)
import C from '../../src/config.js';
import { json, rpc as db, sameOrigin, seal, unseal } from '../lib/server.mjs';
import { BASE58, balances, candlesFrom, checkSigned, coinState, curveAddress, curveTrade, curveTrades, curvesOf, holders, sdkStatus, sendRaw, sigStatus } from '../lib/chain.mjs';
import { USDC, WSOL, TIMEFRAMES, candles, icons, jupExecute, jupList, jupOrder, markets, ownerAvatar, poolOf, poolTrades, solUsd, trending } from '../lib/markets.mjs';

const hits = new Map();
function limited(key, n) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > n;
}
const ipOf = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || 'anon';
const err = (code, status = 400, extra = {}) => json({ ok: false, error: code, ...extra }, status);
const cdn = s => ({ 'cache-control': `public, max-age=${Math.min(s, 15)}`, 'netlify-cdn-cache-control': `public, s-maxage=${s}, stale-while-revalidate=${s * 3}`, 'netlify-vary': 'query' });
const hasRpc = () => !!process.env.SOLANA_RPC_URL && sdkStatus().ok;
const hasDb = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const NO_FN = e => /PGRST202|Could not find the function/.test(String(e && e.message));
const RAW = /^\d{1,30}$/;

async function forksCoins(limit = 50) {
  if (!hasDb()) return [];
  try { return await db('api_tokens_recent', { p_limit: limit }); } catch (e) { if (NO_FN(e)) return []; throw e; }
}
async function forksCoin(mint) {
  if (!hasDb()) return null;
  try { const l = await db('api_launch_get', { p_mint: mint }); return l && l.status === 'live' ? l : null; } catch (e) { if (NO_FN(e)) return null; throw e; }
}
// what a mint is to us: a coin launched here, a project token — or any other Solana token with a real market
// (DexScreener has a pair with some liquidity), shown as just that: a token, not ours, not endorsed
const MIN_LIQ = 1000;
async function identify(mint) {
  const p = C.projectByMint(mint);
  if (p) return { kind: 'project', mint, symbol: p.symbol, name: p.name, owner: p.owner, repo: null, image: null, wrapped: p.wrapped || null };
  const l = await forksCoin(mint);
  if (l) return { kind: 'forks', mint, symbol: l.symbol, name: l.name, image: l.image, repo: l.repo_name, split: l.split, launcher: l.wallet, live_at: l.live_at };
  if (mint === USDC) return null;
  const m = (await markets([mint]))[mint];
  if (m && (m.liquidity || 0) >= MIN_LIQ && m.symbol) return { kind: 'token', mint, symbol: String(m.symbol).slice(0, 16), name: String(m.name || m.symbol).slice(0, 48), image: m.image || null, repo: null };
  return null;
}
const quoteMint = mint => (mint === WSOL ? USDC : WSOL);
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
// is this mint on a live pump.fun curve? (its trades and candles then come straight from the chain)
async function onCurve(mint) {
  if (!hasRpc() || C.projectByMint(mint) || mint === WSOL) return false;
  try { const c = (await curvesOf([mint]))[mint]; return !!(c && !c.complete); } catch (_) { return false; }
}
const chainTrade = (x, sol) => {
  const usd = sol ? Number(x.lamports) / 1e9 * sol : 0, amount = Number(x.raw) / 10 ** x.decimals;
  return { t: x.t, side: x.side, amount, usd, sol: Number(x.lamports) / 1e9, price: usd && amount ? usd / amount : null, wallet: x.wallet, tx: x.tx };
};
// forks' fee: on the curve, a transfer to the treasury in the same transaction; through Jupiter, its referral fee
const FEE = () => (C.trade.feeBps > 0 && C.launch.treasury ? { bps: C.trade.feeBps, to: C.launch.treasury } : null);
const feeInfo = () => ({ bps: FEE() ? C.trade.feeBps : 0, jupiter: !!(process.env.JUP_REFERRAL_ACCOUNT && FEE()) });

export default async (req, context) => {
  const url = new URL(req.url), path = url.pathname.replace(/\/$/, ''), q = k => (url.searchParams.get(k) || '').trim();
  const ip = ipOf(req, context);
  try {
    if (path === '/api/chain') return json({ ok: true, rpc: !!process.env.SOLANA_RPC_URL, jupiter_key: !!process.env.JUP_API_KEY, sdk: sdkStatus() });

    /* ---------- lists ---------- */
    if (path === '/api/market') {
      const coins = await forksCoins(50);
      const mints = coins.map(c => c.mint).concat(C.projects.map(p => p.mint));
      const [mk, curves, sol, ic] = await Promise.all([
        markets(mints),
        hasRpc() && coins.length ? curvesOf(coins.map(c => c.mint)).catch(() => ({})) : {},
        solUsd().catch(() => null),
        icons(C.projects.map(p => p.mint))
      ]);
      const withCurve = c => {
        const cv = curves[c.mint] || null, m = mk[c.mint] || null;
        // a coin DexScreener hasn't seen yet: its market cap from the curve itself
        const mcap = m && m.mcap ? m.mcap : cv && sol ? Number(cv.mcapLamports) / 1e9 * sol : null;
        // a pump.fun coin has a billion tokens: the price follows from the market cap
        return { ...c, kind: 'forks', market: m ? { ...m, mcap } : mcap ? { mcap, price: mcap / 1e9, change24: null, volume24: 0 } : null, curve: cv && { complete: cv.complete, progress: cv.progress } };
      };
      return json({
        ok: true, sol,
        coins: coins.map(withCurve),
        // a project's logo: Jupiter's token list, else DexScreener's, else its GitHub organization's avatar
        projects: C.projects.map(p => ({ kind: 'project', mint: p.mint, symbol: p.symbol, name: p.name, owner: p.owner, image: ic[p.mint] || (mk[p.mint] && mk[p.mint].image) || ownerAvatar(p.owner), market: mk[p.mint] || null }))
      }, 200, cdn(20));
    }
    if (path === '/api/trending') {
      const [tr, top] = await Promise.all([jupList('toptrending', '1h', 40).catch(() => null), jupList('toporganicscore', '24h', 100).catch(() => null)]);
      if (tr || top) return json({ ok: true, trending: (tr || []).slice(0, 20), top: top || [], tokens: (tr || []).slice(0, 20), source: 'jupiter' }, 200, cdn(120));
      try {
        const list = await trending(), missing = list.filter(t => !t.image).map(t => t.mint);
        const ic = missing.length ? await icons(missing) : {};
        const tokens = list.map(t => (t.image ? t : { ...t, image: ic[t.mint] || null }));
        return json({ ok: true, trending: tokens, top: [], tokens, source: 'geckoterminal' }, 200, cdn(90));
      }
      catch (e) { console.error('trending', e.code || '', e.message); return json({ ok: true, trending: [], top: [], tokens: [], busy: true }, 200, cdn(15)); }
    }
    if (path === '/api/prices') {
      const mints = q('mints').split(',').map(s => s.trim()).filter(s => BASE58.test(s)).slice(0, 60);
      if (!mints.length) return err('bad_mints');
      return json({ ok: true, prices: await markets(mints) }, 200, cdn(20));
    }

    /* ---------- one coin ---------- */
    if (path === '/api/coin') {
      const mint = q('mint');
      if (!BASE58.test(mint)) return err('bad_mint');
      const id = await identify(mint);
      if (!id) return err('unknown', 404);
      const [mk, state, sol, ic] = await Promise.all([
        markets([mint]).then(m => m[mint]),
        hasRpc() ? coinState(mint).catch(() => null) : null,
        solUsd().catch(() => null),
        // project logos come in one batch shared with /api/market (Jupiter's limit is shared with trading)
        id.kind === 'project' ? icons(C.projects.map(p => p.mint)) : {}
      ]);
      if (!id.image) id.image = ic[mint] || (mk && mk.image) || (id.kind === 'project' ? ownerAvatar(id.owner) : (await icons([mint]))[mint] || null);
      let market = mk || null;
      if (state && state.curve && sol && (!market || !market.mcap)) {
        const mcap = Number(state.curve.mcapLamports) / 1e9 * sol;
        const supply = Number(state.supply) / 10 ** state.decimals;
        market = { ...(market || {}), mcap, price: market && market.price ? market.price : supply ? mcap / supply : null };
      }
      return json({
        ok: true, coin: id, market, sol,
        decimals: state ? state.decimals : mint === WSOL ? 9 : null,
        supply: state ? state.supply : null,
        program: state ? state.program : null,
        curve: state && state.curve ? { complete: state.curve.complete, progress: state.curve.progress, onCurve: !state.curve.complete && state.curve.solCurve } : null,
        quote: { mint: quoteMint(mint), symbol: mint === WSOL ? 'USDC' : 'SOL', decimals: mint === WSOL ? 6 : 9 },
        trading: hasRpc(), fee: feeInfo()
      }, 200, cdn(10));
    }
    if (path === '/api/chart') {
      const mint = q('mint'), tf = TIMEFRAMES.includes(q('tf')) ? q('tf') : '15m';
      if (!BASE58.test(mint)) return err('bad_mint');
      // a coin on its curve: GeckoTerminal while it keeps up, else candles from the curve's own trades
      if (await onCurve(mint)) {
        const pool = curveAddress(mint);
        const gt = await candles(mint, pool, tf).catch(() => []);
        const fresh = gt.length >= 12 && Date.now() / 1000 - gt[gt.length - 1][0] < TF_SEC[tf] * 3;
        if (fresh) return json({ ok: true, candles: gt, pool, tf, source: 'geckoterminal' }, 200, cdn(tf === '1m' ? 15 : 45));
        if (limited('chain:' + ip, 40)) return json({ ok: true, candles: gt, pool, tf, source: 'geckoterminal' }, 200, cdn(10));
        const [list, sol] = await Promise.all([curveTrades(mint, 150), solUsd().catch(() => null)]);
        return json({ ok: true, candles: sol ? candlesFrom(list, TF_SEC[tf], sol) : [], pool, tf, source: 'chain' }, 200, cdn(8));
      }
      const pool = (await poolOf(mint, BASE58.test(q('pool')) ? q('pool') : null)) || (C.projectByMint(mint) || !hasRpc() ? null : curveAddress(mint)); // a pump.fun coin's pool is its curve
      if (!pool) return json({ ok: true, candles: [], pool: null }, 200, cdn(30));
      try { return json({ ok: true, candles: await candles(mint, pool, tf), pool, tf, source: 'geckoterminal' }, 200, cdn(tf === '1m' ? 15 : 45)); }
      catch (e) { return json({ ok: true, candles: [], pool, tf, busy: e.code === 'upstream_busy' }, 200, cdn(10)); }
    }
    if (path === '/api/trades') {
      const mint = q('mint');
      if (!BASE58.test(mint)) return err('bad_mint');
      // a coin on its curve: its trades from the chain, seconds after they land
      if (await onCurve(mint) && !limited('chain:' + ip, 40)) {
        const [list, sol] = await Promise.all([curveTrades(mint, 60), solUsd().catch(() => null)]);
        return json({ ok: true, trades: list.map(x => chainTrade(x, sol)), pool: curveAddress(mint), source: 'chain' }, 200, cdn(4));
      }
      const pool = (await poolOf(mint, BASE58.test(q('pool')) ? q('pool') : null)) || (C.projectByMint(mint) || !hasRpc() ? null : curveAddress(mint)); // a pump.fun coin's pool is its curve
      if (!pool) return json({ ok: true, trades: [] }, 200, cdn(15));
      try { return json({ ok: true, trades: await poolTrades(mint, pool), pool, source: 'geckoterminal' }, 200, cdn(8)); }
      catch (e) { return json({ ok: true, trades: [], pool, busy: e.code === 'upstream_busy' }, 200, cdn(8)); }
    }
    if (path === '/api/holders') {
      const mint = q('mint');
      if (!BASE58.test(mint) || mint === WSOL) return err('bad_mint');
      if (!hasRpc()) return err('not_configured', 503);
      if (limited('holders:' + ip, 30)) return err('rate_limited', 429);
      return json({ ok: true, ...(await holders(mint)) }, 200, cdn(60));
    }
    if (path === '/api/balance') {
      const owner = q('owner'), mint = q('mint');
      if (!BASE58.test(owner) || (mint && !BASE58.test(mint))) return err('bad_owner');
      if (!hasRpc()) return err('not_configured', 503);
      if (limited('bal:' + ip, 60)) return err('rate_limited', 429);
      const b = await balances(owner, mint || null);
      // a USDC balance too, for the SOL page (paid in USDC)
      if (mint === WSOL) { const u = await balances(owner, USDC); b.quoteToken = u.token; }
      return json({ ok: true, ...b });
    }
    if (path === '/api/tx') {
      const sig = q('sig');
      if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return err('bad_sig');
      if (!hasRpc()) return err('not_configured', 503);
      if (limited('tx:' + ip, 90)) return err('rate_limited', 429);
      return json({ ok: true, ...(await sigStatus(sig)) });
    }

    /* ---------- trading ---------- */
    if (path === '/api/trade/quote' || path === '/api/trade/build') {
      let p;
      if (path === '/api/trade/build') {
        if (req.method !== 'POST') return err('method', 405);
        if (!sameOrigin(req)) return err('bad_origin', 403);
        try { p = JSON.parse(await req.text() || '{}'); } catch { return err('bad_json'); }
        if (!BASE58.test(String(p.owner || ''))) return err('bad_owner');
        if (limited('build:' + ip, 20)) return err('rate_limited', 429);
      } else {
        p = { mint: q('mint'), side: q('side'), amount: q('amount'), slippageBps: q('slippageBps') };
        if (limited('quote:' + ip, 60)) return err('rate_limited', 429);
      }
      const mint = String(p.mint || ''), side = p.side === 'sell' ? 'sell' : p.side === 'buy' ? 'buy' : null, amount = String(p.amount || '');
      const slippageBps = Math.max(10, Math.min(5000, Number(p.slippageBps) || C.trade.slippageBps));
      if (!BASE58.test(mint) || !side || !RAW.test(amount) || amount === '0') return err('bad_trade');
      if (!(await identify(mint))) return err('unknown', 404);
      if (!hasRpc()) return err('not_configured', 503);
      const owner = p.owner ? String(p.owner) : null;
      // on a live SOL curve: straight to the curve
      if (mint !== WSOL) {
        const c = await curveTrade({ mint, side, amount, slippageBps, user: owner, fee: FEE() }).catch(e => { if (e.code === 'too_small') throw e; return null; });
        if (c) {
          const out = { ok: true, ...c, tx: undefined, hash: undefined };
          if (owner) { out.tx = c.tx; out.ticket = seal({ k: 'trade', hash: c.hash, owner }, 120); }
          return json(out);
        }
      }
      // everything else: Jupiter
      const io = side === 'buy' ? { inputMint: quoteMint(mint), outputMint: mint } : { inputMint: mint, outputMint: quoteMint(mint) };
      try {
        const j = await jupOrder({ ...io, amount, slippageBps, taker: owner, feeBps: FEE() ? C.trade.feeBps : 0 });
        return json({ ok: true, ...j, tx: owner ? j.tx : undefined, requestId: owner ? j.requestId : undefined });
      } catch (e) {
        if (e.code === 'upstream_busy') return err('busy', 429);
        return err('no_route', 409, { why: e.why || null });
      }
    }
    if (path === '/api/trade/send') {
      if (req.method !== 'POST') return err('method', 405);
      if (!sameOrigin(req)) return err('bad_origin', 403);
      if (limited('send:' + ip, 20)) return err('rate_limited', 429);
      let b; try { b = JSON.parse(await req.text() || '{}'); } catch { return err('bad_json'); }
      if (typeof b.tx !== 'string' || b.tx.length > 3000) return err('bad_tx');
      if (b.route === 'jupiter') {
        if (typeof b.requestId !== 'string' || !b.requestId || b.requestId.length > 200) return err('bad_request');
        const r = await jupExecute({ signedTransaction: b.tx, requestId: b.requestId });
        return json({ ok: r.ok, signature: r.signature, error: r.ok ? null : 'failed', why: r.error, code: r.code, out: r.out }, r.ok ? 200 : 409);
      }
      const t = unseal(b.ticket);
      if (!t || t.k !== 'trade') return err('expired', 409);
      const bad = checkSigned([b.tx], [t.hash], t.owner, null);
      if (bad) return err('bad_signed', 400, { why: bad });
      try { return json({ ok: true, signature: await sendRaw(b.tx) }); }
      catch (e) { return err('send_failed', 409, { why: String(e.message || '').replace(/^rpc sendTransaction: \d+ /, '').slice(0, 240) }); }
    }
    return err('not_found', 404);
  } catch (e) {
    if (e.code === 'too_small') return err('too_small', 400);
    if (e.code === 'sdk') { console.error('market', path, e.message); return err('not_configured', 503, { why: 'sdk' }); }
    console.error('market', path, e.code || '', e.message);
    return err(e.code === 'rpc' ? 'rpc' : e.code === 'upstream_busy' ? 'busy' : 'server', e.code === 'rpc' || e.code === 'upstream' ? 502 : e.code === 'upstream_busy' ? 429 : 500);
  }
};

export const config = { path: ['/api/chain', '/api/market', '/api/trending', '/api/prices', '/api/coin', '/api/chart', '/api/trades', '/api/holders', '/api/balance', '/api/tx', '/api/trade/quote', '/api/trade/build', '/api/trade/send'] };
