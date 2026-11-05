// The trials API. The browser never talks to the database: it calls these endpoints with the session
// cookie and says what it did (task_id); the SQL functions decide whether it counts and how much.
import C from '../../src/config.js';
import { CALLBACK_PATH, GH_CALLBACK_PATH, SESSION_COOKIE, clearCookie, json, missingEnv, rpc, sameOrigin, session, siteOrigin } from '../lib/server.mjs';

const TASK_ID = /^[a-z0-9-]{1,32}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default async req => {
  const path = new URL(req.url).pathname.replace(/\/$/, '');
  try {
    if (path === '/api/health') {
      const missing = missingEnv();
      const config = ['handle', 'post'].filter(k => !C.x[k]).map(k => `src/config.js x.${k}`);
      let db = null;
      if (!missing.some(m => m.startsWith('SUPABASE'))) {
        try { db = await rpc('api_health'); } catch (e) { db = { ok: false, error: String(e.message).slice(0, 200) }; }
      }
      // schema '3' = 0001 + 0002 + 0003; anything older still needs migrations run in the SQL editor
      const MIGRATIONS = ['supabase/migrations/0002_scan.sql', 'supabase/migrations/0003_refs.sql', 'supabase/migrations/0004_launch.sql', 'supabase/migrations/0005_github.sql'];
      const migrations = db && db.ok ? MIGRATIONS.slice(Math.max(0, Number(db.schema) - 1)) : [];
      return json({
        ok: !missing.length && !config.length && !!(db && db.ok) && !migrations.length && !!process.env.GITHUB_TOKEN,
        missing: missing.concat(process.env.GITHUB_TOKEN ? [] : ['GITHUB_TOKEN']), config, db, migrations,
        github: !!process.env.GITHUB_TOKEN,
        model: !!process.env.FORKS_LLM_KEY,
        // coins on repositories: open when the treasury is set in src/config.js and these env are there
        // the terminal: trading needs the RPC; Jupiter works without a key but at 0.5 requests a second
        // forks' 0.5%: on the curve it goes to launch.treasury; through Jupiter only with JUP_REFERRAL_ACCOUNT
        trade: { rpc: !!process.env.SOLANA_RPC_URL, jupiter_key: !!process.env.JUP_API_KEY, fee_bps: C.launch.treasury ? C.trade.feeBps : 0, jupiter_fee: !!(process.env.JUP_REFERRAL_ACCOUNT && C.launch.treasury && C.trade.feeBps > 0), check: '/api/chain' }, node: process.version,
        // the coin's logo and metadata go to IPFS through Pinata (pump.fun no longer takes uploads itself)
        launch: { rpc: !!process.env.SOLANA_RPC_URL, treasury: C.launch.treasury || null, ipfs: process.env.PINATA_JWT ? 'pinata' : process.env.PUMP_IPFS_URL ? 'custom' : null, ready: !!(process.env.SOLANA_RPC_URL && C.launch.treasury && process.env.SUPABASE_URL && process.env.GITHUB_TOKEN && process.env.SESSION_SECRET && (process.env.PINATA_JWT || process.env.PUMP_IPFS_URL)), missing: [!C.launch.treasury && 'src/config.js launch.treasury', !process.env.SOLANA_RPC_URL && 'SOLANA_RPC_URL', !(process.env.PINATA_JWT || process.env.PUMP_IPFS_URL) && 'PINATA_JWT'].filter(Boolean) },
        // connect GitHub (optional trial): a GitHub OAuth App with exactly this callback URL, and 0005_github.sql
        github_connect: { ready: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) && !!(db && db.ok && Number(db.schema) >= 5), missing: [!process.env.GITHUB_CLIENT_ID && 'GITHUB_CLIENT_ID', !process.env.GITHUB_CLIENT_SECRET && 'GITHUB_CLIENT_SECRET', !(db && db.ok && Number(db.schema) >= 5) && 'supabase/migrations/0005_github.sql'].filter(Boolean), callback_url: `${siteOrigin(req)}${GH_CALLBACK_PATH}` },
        callback_url: `${siteOrigin(req)}${CALLBACK_PATH}`
      });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(req, SESSION_COOKIE) });
    }
    // Not set up yet: the page shows the trials as closed (or runs its demo off the live site).
    if (missingEnv().length) return json({ error: 'not_configured' }, 503);

    const s = session(req);
    if (!s) return json({ error: 'unauthorized' }, 401);

    if (path === '/api/me' && req.method === 'GET') {
      const me = await rpc('api_me', { p_user: s.uid });
      if (!me) return json({ error: 'unauthorized' }, 401, { 'set-cookie': clearCookie(req, SESSION_COOKIE) });
      return json(me);
    }

    if (req.method !== 'POST') return json({ error: 'bad_request' }, 400);
    if (!sameOrigin(req)) return json({ error: 'bad_origin' }, 403);
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'too_long' }, 413);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { return json({ error: 'bad_json' }, 400); }

    if (path === '/api/task/open' || path === '/api/task/claim') {
      const task = String(body.task_id || '');
      if (!TASK_ID.test(task)) return json({ ok: false, error: 'unknown_task' }, 400);
      if (!C.questOpen()) return json({ ok: false, error: 'closed' }, 409);
      const args = { p_user: s.uid, p_task: task };
      // the quote trial is checked by the link to the post (0003_refs.sql → quote_check)
      if (path.endsWith('claim') && body.proof != null) args.p_proof = String(body.proof).slice(0, 300);
      return json(await rpc(path.endsWith('open') ? 'api_task_open' : 'api_task_claim', args));
    }
    if (path === '/api/scan/seen') return json(await rpc('api_scan_seen', { p_user: s.uid }));
    // a stat for the summary card, never a reward: one tree at a time, or the trees grown before sign-in (capped in SQL)
    if (path === '/api/seen') {
      const traces = Math.max(1, Math.min(25, Number(body.traces) | 0 || 1));
      const repos = Math.max(0, Math.min(20 * traces, Number(body.repos) | 0));
      return json(await rpc('api_note_trace', { p_user: s.uid, p_repos: repos, p_traces: traces }));
    }
    if (path === '/api/wallet') {
      const wallet = String(body.wallet || '').trim();
      if (!SOLANA.test(wallet)) return json({ ok: false, error: 'bad_wallet' }, 400);
      return json(await rpc('api_set_wallet', { p_user: s.uid, p_wallet: wallet }));
    }
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'server' }, 500);
  }
};

export const config = { path: ['/api/health', '/api/me', '/api/logout', '/api/task/open', '/api/task/claim', '/api/wallet', '/api/scan/seen', '/api/seen'] };
