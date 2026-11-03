// The trials API. The browser never talks to the database: it calls these endpoints with the session
// cookie and says what it did (task_id); the SQL functions decide whether it counts and how much.
import C from '../../src/config.js';
import { CALLBACK_PATH, SESSION_COOKIE, clearCookie, json, missingEnv, rpc, sameOrigin, session, siteOrigin } from '../lib/server.mjs';

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
      return json({
        ok: !missing.length && !config.length && !!(db && db.ok),
        missing, config, db,
        model: !!process.env.FORKS_LLM_KEY,
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
      return json(await rpc(path.endsWith('open') ? 'api_task_open' : 'api_task_claim', { p_user: s.uid, p_task: task }));
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

export const config = { path: ['/api/health', '/api/me', '/api/logout', '/api/task/open', '/api/task/claim', '/api/wallet'] };
