// Shared helpers for the sign-in and trial functions: signed cookies, the database over REST, JSON replies.
// No dependencies: Supabase is reached through PostgREST with the service role key, server-side only.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'forks_session';
export const OAUTH_COOKIE = 'forks_oauth';
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
// Must match the Callback URI registered in the X app, character for character.
export const CALLBACK_PATH = '/auth/x/callback';

const REQUIRED = ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
export const missingEnv = () =>
  REQUIRED.filter(k => !process.env[k]).concat(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32 ? ['SESSION_SECRET (needs 32+ characters)'] : []);

const env = name => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

export const xClient = () => ({ id: env('X_CLIENT_ID'), secret: env('X_CLIENT_SECRET') });

/** Call a database function: POST /rest/v1/rpc/<fn>. Throws with the database's reason on failure. */
export async function rpc(fn, args = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`; // legacy JWT keys; sb_secret_ keys go in apikey only
  const res = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const sign = body => createHmac('sha256', env('SESSION_SECRET')).update(body).digest('base64url');

/** Pack a payload into a tamper-proof, expiring token: base64url(json).hmac */
export function seal(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function unseal(token) {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Public origin. SITE_URL wins (custom domains); else https, except on localhost / 127.0.0.1. */
export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const { host, hostname, protocol } = new URL(req.url);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  return `${local ? protocol : 'https:'}//${host}`;
}

const secure = req => (siteOrigin(req).startsWith('https:') ? '; Secure' : '');
export const setCookie = (req, name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req)}`;
export const clearCookie = (req, name) => setCookie(req, name, '', 0);

/** The signed-in user ({ uid }) or null. */
export const session = req => unseal(readCookie(req, SESSION_COOKIE));

/** Only same-site relative paths ("/x", not "//evil.com"). */
export const safeReturn = p => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p.slice(0, 200) : '/');

/**
 * Mutations must come from our own pages. A JSON body forces a CORS preflight for any other site,
 * and the Origin host must be ours (www or not).
 */
export function sameOrigin(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const bare = h => h.replace(/^www\./, '');
  try {
    const host = bare(new URL(origin).hostname);
    const ours = [new URL(req.url).hostname, process.env.URL && new URL(process.env.URL).hostname, process.env.SITE_URL && new URL(process.env.SITE_URL).hostname]
      .filter(Boolean).map(bare);
    return ours.includes(host);
  } catch {
    return false;
  }
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export function redirect(location, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}
