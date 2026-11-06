// Season 0: $FORK for the people who launch coins on repositories.
//
//   GET  /api/season               the rules, the top devs and (signed in) your coins and what they earned
//   GET  /api/season/link?wallet=  (signed in) the message to sign with a wallet that launched coins
//   POST /api/season/link  { wallet, issued, signature }   the wallet's signature over that message: the
//                                  wallet joins your X account, its coins earn for you from then on
//
// Rewards are paid by the database (0006_season1.sql) when a coin goes live and as the server measures its
// market cap (season-tick.mjs, every 10 minutes). Nothing here takes an amount from the page.
import { createPublicKey, verify } from 'node:crypto';
import { json, rpc, sameOrigin, session } from '../lib/server.mjs';

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const NO_FN = e => /PGRST202|Could not find the function/.test(String(e && e.message)); // a database without 0006
const err = (error, status = 400, extra = {}) => json({ ok: false, error, ...extra }, status, { 'cache-control': 'no-store' });

function b58(s) {
  let n = 0n;
  for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  let zeros = 0; for (const c of s) { if (c === '1') zeros++; else break; }
  return Buffer.concat([Buffer.alloc(zeros), n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex')]);
}
// ed25519 over the exact bytes of the message, with the wallet's own public key
function signedBy(wallet, message, signatureB64) {
  const pub = b58(wallet), sig = Buffer.from(String(signatureB64 || ''), 'base64');
  if (!pub || pub.length !== 32 || sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch (_) { return false; }
}
const linkMessage = (handle, wallet, issued) =>
  `forks.wiki · Season 0\n\nLink this wallet to @${handle} on forks.wiki, so the coins it launches earn $FORK.\n\nWallet: ${wallet}\nIssued: ${issued}\n\nSigning is free and moves no funds.`;

let pub = null; // the public view, for 30 seconds
export default async req => {
  const url = new URL(req.url), path = url.pathname.replace(/\/$/, '');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return err('not_configured', 503);
  try {
    const s = session(req);
    if (path === '/api/season' && req.method === 'GET') {
      if (!s && pub && Date.now() - pub.at < 30e3) return json(pub.v, 200, { 'cache-control': 'no-store' });
      const v = await rpc('api_season', { p_user: s ? s.uid : null });
      const out = { ok: true, ...v, signedIn: !!s };
      if (!s) pub = { at: Date.now(), v: out };
      return json(out, 200, { 'cache-control': 'no-store' });
    }
    if (path === '/api/season/link') {
      if (!s) return err('unauthorized', 401);
      const me = await rpc('api_me', { p_user: s.uid });
      if (!me || !me.user) return err('unauthorized', 401);
      const handle = me.user.username;
      if (req.method === 'GET') {
        const wallet = url.searchParams.get('wallet') || '';
        if (!SOLANA.test(wallet)) return err('bad_wallet');
        const issued = new Date().toISOString();
        return json({ ok: true, wallet, issued, message: linkMessage(handle, wallet, issued) }, 200, { 'cache-control': 'no-store' });
      }
      if (req.method !== 'POST') return err('method', 405);
      if (!sameOrigin(req)) return err('bad_origin', 403);
      const raw = await req.text();
      if (raw.length > 2048) return err('too_long', 413);
      let body; try { body = JSON.parse(raw || '{}'); } catch { return err('bad_json'); }
      const wallet = String(body.wallet || ''), issued = String(body.issued || '');
      if (!SOLANA.test(wallet)) return err('bad_wallet');
      const at = Date.parse(issued);
      if (!Number.isFinite(at) || Date.now() - at > 10 * 60e3 || at - Date.now() > 60e3) return err('expired', 409);
      if (!signedBy(wallet, linkMessage(handle, wallet, issued), body.signature)) return err('bad_signature', 400);
      const r = await rpc('api_dev_link', { p_user: s.uid, p_wallet: wallet });
      if (!r || !r.ok) return err((r && r.error) || 'link', 409);
      pub = null;
      return json({ ok: true, coins: r.coins }, 200, { 'cache-control': 'no-store' });
    }
    return err('not_found', 404);
  } catch (e) {
    if (NO_FN(e)) return err('not_configured', 503, { missing: ['supabase/migrations/0006_season1.sql'] });
    console.error('season', e.message);
    return err('server', 500);
  }
};

export const config = { path: ['/api/season', '/api/season/link'] };
