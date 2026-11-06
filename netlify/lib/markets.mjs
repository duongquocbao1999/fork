// Market data and routing for the terminal: DexScreener (prices, pairs), GeckoTerminal (candles, trades),
// Jupiter (quotes and swaps for anything off a pump.fun curve). Every answer is cached in memory for a few
// seconds; the functions add CDN caching on top. No keys needed; JUP_API_KEY lifts Jupiter's limit.
//
// Env: JUP_API_KEY (optional, from developers.jup.ag/portal), JUP_URL (optional, default https://api.jup.ag/swap/v2).
const cache = new Map();
async function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v;
  if (hit && hit.p) return hit.p;
  const p = fn().then(v => { cache.set(key, { at: Date.now(), v }); return v; }, e => { cache.delete(key); throw e; });
  cache.set(key, { at: 0, v: hit ? hit.v : null, p });
  if (cache.size > 2000) cache.clear();
  return p;
}
const get = async (url, ms = 5000, headers = {}) => {
  const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(ms) });
  if (r.status === 429) throw Object.assign(new Error('rate limited ' + url), { code: 'upstream_busy' });
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${url}`), { code: 'upstream', status: r.status });
  return r.json();
};

export const WSOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ---------- DexScreener: the best pair of each mint ---------- */
// DexScreener sometimes prices a broken or stale pool thousands of times off (MET/JUP at $1,354 while MET
// trades at $0.27), and its "liquidity" and "volume" are that price times the pool's tokens, so the broken
// pool looks like the deepest. So: find the price most of the market agrees on — pools within 3× of each
// other, weighed by their number of trades (a count, which a wrong price can't inflate) — or Jupiter's price
// when we have it, drop every pool far from it, then take the deepest of the rest.
const liq = p => (p && p.liquidity && p.liquidity.usd) || 0;
const trades = p => (p && p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : 0);
const near = (a, b) => a > 0 && b > 0 && a / b < 3 && b / a < 3;
const refPrice = new Map(); // mint → { price, at }: Jupiter's price, a sanity anchor for six hours
const pick = (pairs, mint) => {
  const mine = pairs.filter(p => p && p.chainId === 'solana' && p.baseToken && p.baseToken.address === mint && Number(p.priceUsd) > 0); // prices quoted for the base token only
  if (!mine.length) return null;
  const ref = refPrice.get(mint);
  let anchor = ref && Date.now() - ref.at < 6 * 3600e3 && mine.some(p => near(Number(p.priceUsd), ref.price)) ? ref.price : null;
  if (!anchor) {
    let best = null;
    for (const p of mine) {
      const price = Number(p.priceUsd), score = mine.reduce((s, q) => s + (near(Number(q.priceUsd), price) ? 1 + trades(q) : 0), 0);
      if (!best || score > best.score || (score === best.score && liq(p) > liq(best.p))) best = { price, score, p };
    }
    anchor = best.price;
  }
  return mine.filter(p => near(Number(p.priceUsd), anchor)).reduce((a, b) => (liq(b) > liq(a) ? b : a));
};
const shape = p => p && {
  price: p.priceUsd ? Number(p.priceUsd) : null,
  priceNative: p.priceNative ? Number(p.priceNative) : null,
  mcap: p.marketCap || p.fdv || null,
  liquidity: p.liquidity ? p.liquidity.usd || null : null,
  volume24: p.volume ? p.volume.h24 || 0 : 0,
  volume1: p.volume ? p.volume.h1 || 0 : 0,
  change24: p.priceChange && p.priceChange.h24 != null ? p.priceChange.h24 : null,
  change1: p.priceChange && p.priceChange.h1 != null ? p.priceChange.h1 : null,
  txns24: trades(p),
  txns1: p.txns && p.txns.h1 ? (p.txns.h1.buys || 0) + (p.txns.h1.sells || 0) : 0,
  pair: p.pairAddress, dex: p.dexId, url: p.url,
  symbol: p.baseToken && p.baseToken.symbol || null, name: p.baseToken && p.baseToken.name || null,
  image: p.info && p.info.imageUrl || null,
  created: p.pairCreatedAt || null
};
/** { mint: market | null } for up to 90 mints (30 per call). */
export async function markets(mints) {
  const uniq = [...new Set(mints)].filter(Boolean);
  const out = {};
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    const pairs = await cached('ds:' + chunk.join(','), 20e3, () => get(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`).catch(() => []));
    const list = Array.isArray(pairs) ? pairs : [];
    for (const m of chunk) {
      const best = shape(pick(list, m));
      // the logo sits on some pairs only: take it from any pair the token is the base of
      if (best && !best.image) { const w = list.find(p => p && p.baseToken && p.baseToken.address === m && p.info && p.info.imageUrl); if (w) best.image = w.info.imageUrl; }
      out[m] = best;
    }
  }
  return out;
}

/* ---------- logos: Jupiter's token list first (what wallets show), DexScreener's next ---------- */
/** { mint: icon url } for up to 100 mints, from Jupiter's Tokens API v2: kept six hours; after a failure the
 *  last answer (or {}) is kept five minutes, so a busy Jupiter isn't asked again on every page view. */
const iconMemo = new Map();
export async function icons(mints) {
  const uniq = [...new Set(mints)].filter(Boolean).sort().slice(0, 100);
  if (!uniq.length) return {};
  const key = uniq.join(','), hit = iconMemo.get(key), now = Date.now();
  if (hit && (now < hit.until || hit.p)) return hit.p || hit.v;
  const p = (async () => {
    try {
      const r = await fetch(`https://api.jup.ag/tokens/v2/search?query=${key}`, { headers: { accept: 'application/json', ...jupHeaders() }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('jupiter tokens ' + r.status);
      const list = await r.json(), out = {};
      for (const t of Array.isArray(list) ? list : []) {
        if (!t || !t.id) continue;
        if (typeof t.icon === 'string' && /^https:\/\//.test(t.icon)) out[t.id] = t.icon;
        if (Number(t.usdPrice) > 0) refPrice.set(t.id, { price: Number(t.usdPrice), at: Date.now() });
      }
      iconMemo.set(key, { v: out, until: Date.now() + 6 * 3600e3 });
      return out;
    } catch (e) {
      const v = hit ? hit.v : {};
      iconMemo.set(key, { v, until: Date.now() + 5 * 60e3 });
      return v;
    }
  })();
  iconMemo.set(key, { v: hit ? hit.v : {}, until: 0, p });
  if (iconMemo.size > 500) iconMemo.clear();
  return p;
}
/** A GitHub owner's avatar: the project's own picture when no token list has a logo. */
export const ownerAvatar = owner => (owner ? `https://github.com/${encodeURIComponent(owner)}.png?size=96` : null);
export async function solUsd() {
  const m = await markets([WSOL]);
  return m[WSOL] && m[WSOL].price ? m[WSOL].price : null;
}

/* ---------- GeckoTerminal: candles and trades of a pool, and what's trending ---------- */
const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const NOT_A_TOKEN = new Set([WSOL, USDC, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' /* USDT */]);
/** Solana's trending pools on GeckoTerminal (their ranking: visits, trades, liquidity checks), one row per
 *  token, with at least `minLiq` of liquidity. Cached two minutes: GeckoTerminal allows ~30 calls a minute. */
export async function trending(minLiq = 10000) {
  return cached('trending', 120e3, async () => {
    const pages = await Promise.all([1, 2].map(n => get(`${GT}/trending_pools?include=base_token&page=${n}`, 7000).catch(e => (n === 1 ? Promise.reject(e) : null))));
    const toks = new Map(), out = [], seen = new Set();
    for (const j of pages) for (const t of (j && j.included) || []) if (t.type === 'token' && t.attributes) toks.set(t.id, t.attributes);
    for (const j of pages) for (const d of (j && j.data) || []) {
      const a = d.attributes || {}, rel = d.relationships || {}, bid = rel.base_token && rel.base_token.data && rel.base_token.data.id;
      const tk = toks.get(bid) || {}, mint = tk.address || (bid ? String(bid).replace(/^solana_/, '') : null);
      const liq = Number(a.reserve_in_usd) || 0;
      if (!mint || seen.has(mint) || NOT_A_TOKEN.has(mint) || liq < minLiq) continue;
      seen.add(mint);
      const ch = a.price_change_percentage || {}, tx = (a.transactions && a.transactions.h24) || {};
      out.push({
        kind: 'token', mint, symbol: tk.symbol || String(a.name || '?').split(' / ')[0], name: tk.name || tk.symbol || '', image: tk.image_url && !/missing/.test(tk.image_url) ? tk.image_url : null,
        pool: a.address || null, dex: rel.dex && rel.dex.data ? rel.dex.data.id : null, created: a.pool_created_at || null,
        market: {
          price: a.base_token_price_usd != null ? Number(a.base_token_price_usd) : null,
          mcap: Number(a.market_cap_usd) || Number(a.fdv_usd) || null, liquidity: liq,
          volume24: Number(a.volume_usd && a.volume_usd.h24) || 0,
          change24: ch.h24 != null ? Number(ch.h24) : null, change1: ch.h1 != null ? Number(ch.h1) : null,
          txns24: (Number(tx.buys) || 0) + (Number(tx.sells) || 0)
        }
      });
    }
    return out.slice(0, 40);
  });
}
const TF = { '1m': ['minute', 1, 20e3], '5m': ['minute', 5, 30e3], '15m': ['minute', 15, 45e3], '1h': ['hour', 1, 60e3], '4h': ['hour', 4, 120e3], '1d': ['day', 1, 300e3] };
export const TIMEFRAMES = Object.keys(TF);
/** The pool to chart: DexScreener's best pair, else GeckoTerminal's top pool, else the pump.fun curve. */
export async function poolOf(mint, hint) {
  if (hint) return hint;
  return cached('pool:' + mint, 300e3, async () => {
    const m = (await markets([mint]))[mint];
    if (m && m.pair) return m.pair;
    try {
      const j = await get(`${GT}/tokens/${mint}/pools?page=1`);
      const id = j.data && j.data[0] && j.data[0].attributes && j.data[0].attributes.address;
      if (id) return id;
    } catch (_) { }
    return null;
  });
}
/** Candles oldest first: [[t (s), open, high, low, close, volumeUsd], …], priced in USD for `mint`. */
export async function candles(mint, pool, tf) {
  const [frame, agg, ms] = TF[tf] || TF['15m'];
  return cached(`ohlcv:${pool}:${mint}:${tf}`, ms, async () => {
    const j = await get(`${GT}/pools/${pool}/ohlcv/${frame}?aggregate=${agg}&limit=300&currency=usd&token=${mint}`, 7000);
    const list = (j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
    return list.map(r => r.map(Number)).filter(r => r.length >= 6 && r.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  });
}
/** The latest trades in a pool, newest first, sided for `mint` (a buy = `mint` bought). */
export async function poolTrades(mint, pool) {
  return cached(`trades:${pool}:${mint}`, 8e3, async () => {
    const j = await get(`${GT}/pools/${pool}/trades`, 7000);
    return (j.data || []).slice(0, 60).map(d => {
      const a = d.attributes || {}, buy = a.to_token_address === mint;
      return {
        t: Date.parse(a.block_timestamp) || null, side: buy ? 'buy' : 'sell',
        amount: Number(buy ? a.to_token_amount : a.from_token_amount) || 0,
        usd: Number(a.volume_in_usd) || 0,
        price: Number(buy ? a.price_to_in_usd : a.price_from_in_usd) || null,
        wallet: a.tx_from_address || null, tx: a.tx_hash || null
      };
    }).filter(x => x.tx);
  });
}

/* ---------- Jupiter's token lists: what's trending, what's on top (logos, prices, volume, verification) ---------- */
const shapeJup = t => {
  const d = t.stats24h || {}, h = t.stats1h || {};
  return {
    kind: 'token', mint: t.id, symbol: String(t.symbol || '?').slice(0, 16), name: String(t.name || t.symbol || '').slice(0, 48),
    image: typeof t.icon === 'string' && /^https:\/\//.test(t.icon) ? t.icon : null,
    verified: !!t.isVerified, organic: t.organicScoreLabel || null, holders: t.holderCount != null ? Number(t.holderCount) : null, created: t.createdAt || null,
    market: {
      price: t.usdPrice != null ? Number(t.usdPrice) : null, mcap: t.mcap != null ? Number(t.mcap) : t.fdv != null ? Number(t.fdv) : null,
      liquidity: t.liquidity != null ? Number(t.liquidity) : null, volume24: (Number(d.buyVolume) || 0) + (Number(d.sellVolume) || 0),
      change24: d.priceChange != null ? Number(d.priceChange) : null, change1: h.priceChange != null ? Number(h.priceChange) : null,
      txns24: (Number(d.numBuys) || 0) + (Number(d.numSells) || 0)
    }
  };
};
// only tokens Jupiter vouches for (verified, or high organic activity) and that have a logo; never flagged
// ones, never stablecoins
const keep = t => t && t.id && !(t.audit && t.audit.isSus) && (t.isVerified || t.organicScoreLabel === 'high') && typeof t.icon === 'string' && /^https:\/\//.test(t.icon) && !NOT_A_TOKEN.has(t.id) && !(t.tags || []).includes('stable');
/** Jupiter's Tokens API v2 lists: 'toptrending' | 'toptraded' | 'toporganicscore' over 5m | 1h | 6h | 24h. Cached five minutes. */
export async function jupList(category, interval, limit = 100) {
  return cached(`jl:${category}:${interval}:${limit}`, 300e3, async () => {
    const r = await fetch(`https://api.jup.ag/tokens/v2/${category}/${interval}?limit=${limit}`, { headers: { accept: 'application/json', ...jupHeaders() }, signal: AbortSignal.timeout(8000) });
    if (r.status === 429) throw Object.assign(new Error('jupiter tokens busy'), { code: 'upstream_busy' });
    if (!r.ok) throw Object.assign(new Error('jupiter tokens ' + r.status), { code: 'upstream' });
    const list = await r.json(), now = Date.now();
    for (const t of Array.isArray(list) ? list : []) if (t && t.id && Number(t.usdPrice) > 0) refPrice.set(t.id, { price: Number(t.usdPrice), at: now });
    if (refPrice.size > 5000) refPrice.clear();
    return (Array.isArray(list) ? list : []).filter(keep).map(shapeJup);
  });
}

/* ---------- Jupiter: quotes and swaps for everything off a curve ---------- */
const JUP = () => (process.env.JUP_URL || 'https://api.jup.ag/swap/v2').replace(/\/$/, '');
const jupHeaders = () => (process.env.JUP_API_KEY ? { 'x-api-key': process.env.JUP_API_KEY } : {});
/** GET /order: a quote (no taker) or a quote with the transaction to sign (taker). */
export async function jupOrder({ inputMint, outputMint, amount, slippageBps, taker, feeBps }) {
  const q = new URLSearchParams({ inputMint, outputMint, amount: String(amount) });
  if (slippageBps) q.set('slippageBps', String(slippageBps));
  if (taker) q.set('taker', taker);
  // forks' fee: Jupiter's referral program (the referral account and its SOL/USDC token accounts set up once)
  const ref = process.env.JUP_REFERRAL_ACCOUNT, fee = Number(feeBps) || 0;
  if (ref && fee >= 50 && fee <= 255) { q.set('referralAccount', ref); q.set('referralFee', String(fee)); }
  const key = 'jup:' + q.toString();
  const run = async () => {
    const r = await fetch(`${JUP()}/order?${q}`, { headers: { accept: 'application/json', ...jupHeaders() }, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => null);
    if (r.status === 429) throw Object.assign(new Error('jupiter busy'), { code: 'upstream_busy' });
    if (!r.ok || !j) throw Object.assign(new Error(`jupiter ${r.status} ${j && j.error}`), { code: 'no_route', why: j && j.error });
    if (taker && !j.transaction) throw Object.assign(new Error(j.errorMessage || 'no transaction'), { code: 'no_route', why: j.errorMessage || j.error || null, errorCode: j.errorCode });
    return {
      route: 'jupiter', inAmount: j.inAmount, outAmount: j.outAmount, minOut: j.otherAmountThreshold,
      impact: j.priceImpact != null ? Math.abs(Number(j.priceImpact)) : j.priceImpactPct != null ? Math.abs(Number(j.priceImpactPct) * 100) : null,
      feeBps: j.feeBps != null ? j.feeBps : null, feeMint: j.feeMint || null, referral: !!(j.referralAccount || (ref && fee >= 50)),
      platformFeeBps: j.platformFee && j.platformFee.feeBps != null ? j.platformFee.feeBps : null, router: j.router || null,
      venues: (j.routePlan || []).map(s => s.swapInfo && s.swapInfo.label).filter(Boolean).slice(0, 4),
      tx: j.transaction || null, requestId: j.requestId || null
    };
  };
  return taker ? run() : cached(key, 3e3, run);
}
/** POST /execute: Jupiter lands the signed transaction. */
export async function jupExecute({ signedTransaction, requestId }) {
  const r = await fetch(`${JUP()}/execute`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...jupHeaders() },
    body: JSON.stringify({ signedTransaction, requestId }), signal: AbortSignal.timeout(30000)
  });
  const j = await r.json().catch(() => null);
  if (!j) throw Object.assign(new Error('jupiter execute ' + r.status), { code: 'upstream' });
  return { ok: j.status === 'Success', signature: j.signature || null, error: j.error || null, code: j.code != null ? j.code : null, out: j.totalOutputAmount || j.outputAmountResult || null };
}
