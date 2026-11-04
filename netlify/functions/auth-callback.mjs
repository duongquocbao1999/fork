// GET /auth/x/callback — exchange the code, read the X profile, create or refresh the account, start a session.
import { CALLBACK_PATH, OAUTH_COOKIE, SESSION_COOKIE, SESSION_TTL, clearCookie, readCookie, redirect, rpc, seal, setCookie, siteOrigin, unseal, xClient } from '../lib/server.mjs';

const MIN_AGE_DAYS = Number(process.env.X_MIN_ACCOUNT_AGE_DAYS || 0);

export default async req => {
  const url = new URL(req.url);
  const fail = reason => redirect(`${siteOrigin(req)}/?auth=error&reason=${reason}`, [clearCookie(req, OAUTH_COOKIE)]);

  const saved = unseal(readCookie(req, OAUTH_COOKIE));
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return fail('cancelled');
  if (!saved) return fail('expired');
  if (!code || url.searchParams.get('state') !== saved.state) return fail('state');

  try {
    const { id, secret } = xClient();
    const basic = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${siteOrigin(req)}${CALLBACK_PATH}`, code_verifier: saved.verifier, client_id: id }),
      signal: AbortSignal.timeout(8000)
    });
    if (!tokenRes.ok) { console.error('X token exchange failed', tokenRes.status, await tokenRes.text()); return fail('token'); }
    const { access_token } = await tokenRes.json();

    const meRes = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,created_at,public_metrics,verified,verified_type', {
      headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000)
    });
    if (!meRes.ok) { console.error('X profile request failed', meRes.status, await meRes.text()); return fail('profile'); }
    const { data: x } = await meRes.json();

    // The token was only needed to learn who signed in.
    fetch('https://api.x.com/2/oauth2/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic },
      body: new URLSearchParams({ token: access_token, token_type_hint: 'access_token', client_id: id })
    }).catch(() => {});

    if (MIN_AGE_DAYS > 0 && x.created_at && Date.now() - Date.parse(x.created_at) < MIN_AGE_DAYS * 864e5) return fail('too_new');

    const base = {
      p_x_id: x.id,
      p_username: x.username,
      p_name: x.name || x.username,
      p_avatar: x.profile_image_url ? x.profile_image_url.replace('_normal', '_200x200') : null,
      p_x_created_at: x.created_at || null,
      p_followers: x.public_metrics ? x.public_metrics.followers_count : null
    };
    let uid;
    try {
      // what the X scan reads (supabase/migrations/0002_scan.sql → scan_lines)
      uid = await rpc('upsert_x_user', {
        ...base,
        p_following: x.public_metrics ? x.public_metrics.following_count : null,
        p_tweets: x.public_metrics ? x.public_metrics.tweet_count : null,
        p_listed: x.public_metrics ? x.public_metrics.listed_count : null,
        p_verified: !!x.verified,
        p_verified_type: x.verified_type || null
      });
    } catch (e) {
      // 0002 not run yet: PostgREST can't find the new signature (PGRST202). Sign in on the old one, no scan.
      if (!/PGRST202/.test(e.message)) { console.error(e); return fail('database'); }
      console.warn('upsert_x_user: run supabase/migrations/0002_scan.sql for the X scan');
      try { uid = await rpc('upsert_x_user', base); } catch (e2) { console.error(e2); return fail('database'); }
    }
    if (!uid) return fail('database');

    const ret = saved.ret || '/';
    return redirect(`${siteOrigin(req)}${ret}${ret.includes('?') ? '&' : '?'}auth=ok`, [
      clearCookie(req, OAUTH_COOKIE),
      setCookie(req, SESSION_COOKIE, seal({ uid }, SESSION_TTL), SESSION_TTL)
    ]);
  } catch (e) {
    console.error(e);
    return fail('server');
  }
};

export const config = { path: '/auth/x/callback' };
