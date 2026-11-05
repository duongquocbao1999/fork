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
const pick = (pairs, mint) => {
  let best = null;
  for (const p of pairs) {
    if (!p || p.chainId !== 'solana') continue;
    const side = p.baseToken && p.baseToken.address === mint ? 'base' : p.quoteToken && p.quoteToken.address === mint ? 'quote' : null;
    if (side !== 'base') continue; // prices quoted for the base token only
    if (!best || ((p.liquidity && p.liquidity.usd) || 0) > ((best.liquidity && best.liquidity.usd) || 0)) best = p;
  }
  return best;
};
const shape = p => p && {
  price: p.priceUsd ? Number(p.priceUsd) : null,
  priceNative: p.priceNative ? Number(p.priceNative) : null,
  mcap: p.marketCap || p.fdv || null,
  liquidity: p.liquidity ? p.liquidity.usd || null : null,
  volume24: p.volume ? p.volume.h24 || 0 : 0,
  change24: p.priceChange && p.priceChange.h24 != null ? p.priceChange.h24 : null,
  change1: p.priceChange && p.priceChange.h1 != null ? p.priceChange.h1 : null,
  txns24: p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : 0,
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
    for (const m of chunk) out[m] = shape(pick(Array.isArray(pairs) ? pairs : [], m));
  }
  return out;
}
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

/* ---------- Jupiter: quotes and swaps for everything off a curve ---------- */
const JUP = () => (process.env.JUP_URL || 'https://api.jup.ag/swap/v2').replace(/\/$/, '');
const jupHeaders = () => (process.env.JUP_API_KEY ? { 'x-api-key': process.env.JUP_API_KEY } : {});
/** GET /order: a quote (no taker) or a quote with the transaction to sign (taker). */
export async function jupOrder({ inputMint, outputMint, amount, slippageBps, taker }) {
  const q = new URLSearchParams({ inputMint, outputMint, amount: String(amount) });
  if (slippageBps) q.set('slippageBps', String(slippageBps));
  if (taker) q.set('taker', taker);
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
      feeBps: j.feeBps != null ? j.feeBps : null, router: j.router || null,
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
