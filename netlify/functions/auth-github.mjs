// Connect GitHub — an optional trial for people already signed in with X.
//   GET /auth/github/start?return=/path   → github.com/login/oauth/authorize (no scopes: the public profile only)
//   GET /auth/github/callback             → exchange the code, read /user, revoke the token, link + bonus in SQL
// The GitHub account is matched to the X account from the session cookie, never from the page; the bonus is
// decided by api_github_link (0005_github.sql): one GitHub per X account, a minimum account age, once.
//
// Env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (a GitHub OAuth App; callback URL below), SESSION_SECRET.
import { randomBytes } from 'node:crypto';
import { GH_CALLBACK_PATH, clearCookie, readCookie, redirect, rpc, safeReturn, seal, session, setCookie, siteOrigin, unseal } from '../lib/server.mjs';

const GH_COOKIE = 'forks_gh';
const client = () => ({ id: process.env.GITHUB_CLIENT_ID || '', secret: process.env.GITHUB_CLIENT_SECRET || '' });
const UA = 'forks.wiki';

export default async req => {
  const url = new URL(req.url), path = url.pathname.replace(/\/$/, ''), origin = siteOrigin(req);
  const back = (ret, q) => redirect(`${origin}${ret}${ret.includes('?') ? '&' : '?'}${q}`, [clearCookie(req, GH_COOKIE)]);
  const { id, secret } = client();

  if (path === '/auth/github/start') {
    const ret = safeReturn(url.searchParams.get('return'));
    if (!id || !secret || !process.env.SESSION_SECRET) return back(ret, 'gh=error&reason=setup');
    const s = session(req);
    if (!s) return back(ret, 'gh=error&reason=signin');
    const state = randomBytes(16).toString('base64url');
    const to = new URL('https://github.com/login/oauth/authorize');
    to.search = new URLSearchParams({ client_id: id, redirect_uri: `${origin}${GH_CALLBACK_PATH}`, state, allow_signup: 'false' }).toString();
    // the state, who is signed in and where to come back to travel in a signed, ten-minute cookie
    return redirect(to.toString(), [setCookie(req, GH_COOKIE, seal({ state, uid: s.uid, ret }, 600), 600)]);
  }

  // the callback
  const saved = unseal(readCookie(req, GH_COOKIE));
  const ret = saved && saved.ret ? saved.ret : '/';
  const fail = reason => back(ret, `gh=error&reason=${reason}`);
  if (url.searchParams.get('error')) return fail('cancelled');
  if (!saved) return fail('expired');
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.get('state') !== saved.state) return fail('state');
  const s = session(req);
  if (!s || s.uid !== saved.uid) return fail('signin');
  if (!id || !secret) return fail('setup');

  try {
    const tr = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
      body: new URLSearchParams({ client_id: id, client_secret: secret, code, redirect_uri: `${origin}${GH_CALLBACK_PATH}` }),
      signal: AbortSignal.timeout(8000)
    });
    const tj = await tr.json().catch(() => null);
    if (!tr.ok || !tj || !tj.access_token) { console.error('github token exchange failed', tr.status, tj && tj.error); return fail('token'); }
    const token = tj.access_token;

    const ur = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const u = await ur.json().catch(() => null);
    // the token was only needed to learn who this is: revoke it right away
    fetch(`https://api.github.com/applications/${encodeURIComponent(id)}/token`, {
      method: 'DELETE',
      headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ access_token: token })
    }).catch(() => {});
    if (!ur.ok || !u || !u.id || !u.login) { console.error('github /user failed', ur.status); return fail('profile'); }

    let r;
    try {
      r = await rpc('api_github_link', {
        p_user: s.uid, p_gh_id: u.id, p_login: String(u.login).slice(0, 39), p_created: u.created_at || null,
        p_repos: Number.isFinite(u.public_repos) ? u.public_repos : null, p_followers: Number.isFinite(u.followers) ? u.followers : null
      });
    } catch (e) {
      console.error('api_github_link', e.message);
      return fail(/PGRST202|Could not find the function/.test(String(e.message)) ? 'setup' : 'database');
    }
    if (!r || !r.ok) return fail((r && r.error) || 'database');
    return back(ret, 'gh=ok');
  } catch (e) {
    console.error(e);
    return fail('server');
  }
};

export const config = { path: ['/auth/github/start', '/auth/github/callback'] };
