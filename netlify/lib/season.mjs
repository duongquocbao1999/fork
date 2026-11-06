// Season 0: the server measures every coin still counting this season and tells the database what it saw.
// A coin on its pump.fun curve: the curve on the chain (market cap and whether it graduated). After the
// curve: DexScreener's consensus price, and only with real liquidity behind it. The page never sends a
// market cap; milestones count once seen twice, 10+ minutes apart (supabase/migrations/0006_season1.sql).
import { rpc } from './server.mjs';
import { curvesOf } from './chain.mjs';
import { markets, solUsd } from './markets.mjs';

export const MIN_LIQUIDITY = 5000; // USD: a market cap with less than this behind it isn't counted

/** [{ mint, mcap (USD) | null, grad }] for these mints. */
export async function measure(mints) {
  if (!mints.length) return [];
  const [curves, mk, sol] = await Promise.all([
    process.env.SOLANA_RPC_URL ? curvesOf(mints).catch(() => ({})) : {},
    markets(mints).catch(() => ({})),
    solUsd().catch(() => null)
  ]);
  return mints.map(mint => {
    const c = curves[mint], m = mk[mint];
    if (c && !c.complete) return { mint, mcap: sol ? Number(c.mcapLamports) / 1e9 * sol : null, grad: false };
    const mcap = m && m.mcap && (m.liquidity || 0) >= MIN_LIQUIDITY ? m.mcap : null;
    return { mint, mcap, grad: !!(c && c.complete) };
  });
}

/** One pass: what's counting, measured, reported. Returns { coins, paid }. */
export async function tick() {
  const list = await rpc('api_season_watch');
  const mints = (Array.isArray(list) ? list : []).map(x => x.mint).filter(Boolean).slice(0, 300);
  let paid = 0;
  for (let i = 0; i < mints.length; i += 90) {
    const items = await measure(mints.slice(i, i + 90));
    const r = await rpc('api_season_observe', { p_items: items });
    paid += (r && r.paid) || 0;
  }
  return { coins: mints.length, paid };
}
